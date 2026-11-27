"""Run TripoSR locally (Apple GPU via MPS, else CPU) and export a GLB, timing each stage.
Runs in the separate TripoSR environment (see scripts/setup-local-triposr.sh), not the backend's.
Usage: infer.py <prepared.png> <out.glb> [mc_resolution] [texture_resolution|0]
texture_resolution > 0 bakes a real UV texture from the model (TripoSR bake_texture) instead of vertex colours.
TRIPOSR_CODE must point at a checkout of github.com/VAST-AI-Research/TripoSR."""

import os
import sys
import time

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
sys.path.insert(0, os.environ["TRIPOSR_CODE"])

import torch
from PIL import Image
from tsr.models import isosurface
from tsr.system import TSR

# torchmcubes is compiled CPU-only on macOS; TripoSR only falls back on AttributeError,
# so hand it the volume on the CPU. The helper moves results back to the model device.
_marching_cubes = isosurface.marching_cubes
isosurface.marching_cubes = lambda volume, threshold: _marching_cubes(volume.detach().cpu(), threshold)


def main() -> None:
    source, target = sys.argv[1], sys.argv[2]
    resolution = int(sys.argv[3]) if len(sys.argv) > 3 else 256
    texture_resolution = int(sys.argv[4]) if len(sys.argv) > 4 else 0
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    timings: dict[str, float] = {}

    t = time.perf_counter()
    model = TSR.from_pretrained("stabilityai/TripoSR", config_name="config.yaml", weight_name="model.ckpt")
    model.renderer.set_chunk_size(8192)
    model.to(device)
    timings["load"] = time.perf_counter() - t

    image = Image.open(source).convert("RGB")
    t = time.perf_counter()
    with torch.no_grad():
        scene_codes = model([image], device=device)
    if device == "mps":
        torch.mps.synchronize()
    timings["model"] = time.perf_counter() - t

    t = time.perf_counter()
    with torch.no_grad():
        mesh = model.extract_mesh(scene_codes, texture_resolution == 0, resolution=resolution)[0]
    # Marching cubes leaves a few zero-area triangles; drop them before baking so the
    # texture atlas is built on the same clean mesh the backend validates.
    mesh.update_faces((mesh.area_faces > 1e-12) & mesh.unique_faces())
    mesh.remove_unreferenced_vertices()
    timings["mesh"] = time.perf_counter() - t

    if texture_resolution:
        import numpy as np
        import trimesh
        from tsr import bake_texture as baking

        def positions_to_colors(model, scene_code, positions_texture, texture_resolution):  # type: ignore[no-untyped-def]
            """TripoSR's version builds the query points on the CPU; keep them on the model's device."""
            flat = positions_texture.reshape(-1, 4)
            positions = torch.tensor(flat[:, :-1], device=scene_code.device)
            with torch.no_grad():
                queried = model.renderer.query_triplane(model.decoder, positions, scene_code)
            rgba = np.insert(queried["color"].float().cpu().numpy().reshape(-1, 3), 3, flat[:, -1], axis=1)
            rgba[rgba[:, -1] == 0.0] = [0, 0, 0, 0]
            return rgba.reshape(texture_resolution, texture_resolution, 4)

        baking.positions_to_colors = positions_to_colors
        bake_texture = baking.bake_texture

        t = time.perf_counter()
        baked = bake_texture(mesh, model, scene_codes[0], texture_resolution)
        # GL rasterises bottom-up; flip so image row 0 is v = 1, as glTF export expects.
        image = Image.fromarray((baked["colors"] * 255.0).clip(0, 255).astype(np.uint8)).transpose(
            Image.FLIP_TOP_BOTTOM
        ).convert("RGB")
        material = trimesh.visual.material.PBRMaterial(
            baseColorTexture=image, metallicFactor=0.0, roughnessFactor=1.0
        )
        mesh = trimesh.Trimesh(
            vertices=mesh.vertices[baked["vmapping"]],
            faces=baked["indices"],
            visual=trimesh.visual.TextureVisuals(uv=baked["uvs"], material=material),
            process=False,
        )
        timings["bake"] = time.perf_counter() - t

    # Same orientation fix as TripoSR's demo (tsr.utils.to_gradio_3d_orientation): glTF is Y-up.
    import numpy as np
    import trimesh

    mesh.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))
    mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
    mesh.export(target)
    print(
        f"device={device} " + " ".join(f"{k}_seconds={v:.2f}" for k, v in timings.items())
        + f" vertices={len(mesh.vertices)} faces={len(mesh.faces)}"
    )


if __name__ == "__main__":
    main()

"""Collect independent GLB data and optional silhouette comparisons for the run."""

import hashlib
import io
import json
import struct
import sys
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parents[1] / "backend"), str(HERE.parent / "reconstruction")]

from app.quality import quality_report, silhouette
from validate_glb import inspect_glb


def material_data(path: Path) -> dict[str, object]:
    source = path.read_bytes()
    length = struct.unpack_from("<I", source, 12)[0]
    doc = json.loads(source[20:20 + length])
    material = doc["materials"][0]
    pbr = material["pbrMetallicRoughness"]
    texture = doc["textures"][pbr["baseColorTexture"]["index"]]
    image = doc["images"][texture["source"]]
    view = doc["bufferViews"][image["bufferView"]]
    start = 28 + length + view.get("byteOffset", 0)
    with Image.open(io.BytesIO(source[start:start + view["byteLength"]])) as texture_image:
        size = texture_image.size
    return {"base_color_dimensions": size, "metallic": pbr.get("metallicFactor", 1),
            "roughness": pbr.get("roughnessFactor", 1), "normal_texture": "normalTexture" in material}


def main() -> None:
    results = {}
    for path in sorted(HERE.glob("*/*.glb")):
        name = path.stem.split("-")[0]
        front = path.with_name(f"{path.stem}-front.png")
        mask = HERE / "edited" / f"{name}-mask.png"
        if not mask.exists():
            mask = HERE / "reviewed" / f"{name}-mask.png"
        scene = trimesh.load_scene(path, file_type="glb", process=False, skip_materials=True)
        mesh = scene.to_mesh()
        result = inspect_glb(path)
        result["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
        result["geometry_sha256"] = hashlib.sha256(mesh.vertices.tobytes() + mesh.faces.tobytes()).hexdigest()
        result["material"] = material_data(path)
        if front.exists() and mask.exists():
            result["report"] = quality_report(mesh, silhouette(mask), silhouette(front))
        else:
            result["report"] = quality_report(mesh)
        results[str(path.relative_to(HERE))] = result

    output_differences = {}
    for name in ("shoe-2048", "chair-2048", "shoe-model-material", "shoe-normal-only", "shoe-roughness-only"):
        front = HERE / "reviewed" / f"{name}-front.png"
        same_input = HERE / "reviewed" / f"{name.split('-')[0]}-front.png"
        if not front.exists():
            continue
        a = np.asarray(Image.open(front).convert("RGBA"), dtype=np.int16)
        b = np.asarray(Image.open(same_input).convert("RGBA"), dtype=np.int16)
        overlapping = (a[:, :, 3] >= 240) & (b[:, :, 3] >= 240)
        output_differences[name] = round(float(np.abs(a[overlapping, :3] - b[overlapping, :3]).mean()), 3)
    print(json.dumps({"models": results, "front_mean_rgb_delta_8bit": output_differences}, indent=2))


if __name__ == "__main__":
    main()

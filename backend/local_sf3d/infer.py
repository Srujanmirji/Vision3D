"""Stable Fast 3D (Stability AI Community License) worker for Vision3D, run in its own venv.

Usage: infer.py --serve   keeps the model loaded and answers one JSON request per line:
                          {"input", "output", "remove"} -> {"ok": true, "seconds": ...}
       infer.py <image> <out.glb>   one-off run, for setup checks.

Runs on the CPU: SF3D's Metal texture kernel does not compile on current macOS, and its MPS path needs
more than 32 GB of memory. Background removal uses u2net (Apache-2.0); rembg's newer default is
non-commercial. Output is made matte: SF3D's predicted gloss and normal map look wet and blotchy on
photo-derived textures."""

import json
import os
import sys
import time
from typing import Any

sys.path.insert(0, os.environ["SF3D_CODE"])

import rembg
import torch
from PIL import Image
from sf3d.system import SF3D
from sf3d.utils import remove_background, resize_foreground

FOREGROUND_RATIO = 0.85
TEXTURE_RESOLUTION = 1024


def load() -> tuple[Any, Any]:
    model = SF3D.from_pretrained(
        "stabilityai/stable-fast-3d", config_name="config.yaml", weight_name="model.safetensors"
    )
    model.to("cpu")
    model.eval()
    return model, rembg.new_session("u2net")


def reconstruct(model: Any, session: Any, source: str, target: str, remove: bool) -> float:
    start = time.perf_counter()
    image = Image.open(source).convert("RGBA")
    if remove:
        image = resize_foreground(remove_background(image, session), FOREGROUND_RATIO)
    with torch.no_grad():
        mesh, _ = model.run_image(image, bake_resolution=TEXTURE_RESOLUTION, remesh="none", vertex_count=-1)
    # SF3D leaves a few zero-area triangles, which the backend rejects; drop them as infer.py does.
    mesh.update_faces((mesh.area_faces > 1e-12) & mesh.unique_faces())
    mesh.remove_unreferenced_vertices()
    material = mesh.visual.material
    material.metallicFactor = 0.0
    material.roughnessFactor = 1.0
    material.normalTexture = None
    mesh.export(target, include_normals=True)
    return time.perf_counter() - start


def serve() -> None:
    """Keep the model in memory and handle one request per line. Library chatter goes to stderr."""
    replies = sys.stdout
    sys.stdout = sys.stderr
    model, session = load()
    replies.write(json.dumps({"ready": True}) + "\n")
    replies.flush()
    for line in sys.stdin:
        try:
            job = json.loads(line)
            reply = {"ok": True, "seconds": reconstruct(model, session, job["input"], job["output"], job["remove"])}
        except Exception as exc:  # noqa: BLE001 - report and keep serving
            reply = {"ok": False, "error": type(exc).__name__}
        replies.write(json.dumps(reply) + "\n")
        replies.flush()


def main() -> None:
    if sys.argv[1:] == ["--serve"]:
        serve()
        return
    model, session = load()
    print(f"seconds={reconstruct(model, session, sys.argv[1], sys.argv[2], True):.2f}")


if __name__ == "__main__":
    main()

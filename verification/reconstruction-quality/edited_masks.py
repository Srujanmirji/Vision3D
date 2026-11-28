"""Reproduce the two hand-traced mask edits against a local SF3D API."""

import argparse
import base64
import io
import json
import time
from pathlib import Path

import httpx
from PIL import Image, ImageChops, ImageDraw

HERE = Path(__file__).resolve().parent
# Retain the bottle itself and erase the space inside the headphone headband.
# Coordinates are percentages of the EXIF-oriented photo.
BOTTLE = [(32, 10), (63, 10), (68, 78), (63, 79), (63, 84), (60, 87),
          (55, 88), (46, 88), (41, 86), (38, 81), (35, 79)]
HEADPHONE_GAP = [(46, 41), (48, 34), (52, 29), (57, 27), (65, 27),
                 (71, 30), (77, 34), (81, 40), (83, 46), (84, 52), (83, 59),
                 (80, 62), (78, 58), (75, 56), (71, 60), (65, 69), (62, 77),
                 (56, 73), (57, 62), (56, 48), (55, 41), (51, 40), (48, 43)]


def main() -> None:
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("--api", default="http://127.0.0.1:8391")
    args.add_argument("--out", type=Path, default=HERE / "edited")
    options = args.parse_args()
    options.out.mkdir(parents=True, exist_ok=True)
    photos = {"bottle": HERE / "bottle.jpg", "electronics": HERE.parent / "reconstruction/inputs/electronics.jpg"}
    with httpx.Client(base_url=options.api, timeout=30, trust_env=False) as client:
        for case, source in photos.items():
            photo = (source.name, source.read_bytes(), "image/jpeg")
            preview = client.post("/v1/preprocessing/foreground", files={"image": photo}).raise_for_status().json()
            with Image.open(io.BytesIO(base64.b64decode(preview["mask_png"]))) as estimated:
                width, height = estimated.size
                selector = Image.new("L", estimated.size, 0 if case == "bottle" else 255)
                polygon = BOTTLE if case == "bottle" else HEADPHONE_GAP
                ImageDraw.Draw(selector).polygon(
                    [(x * width / 100, y * height / 100) for x, y in polygon],
                    fill=255 if case == "bottle" else 0,
                )
                mask = ImageChops.multiply(estimated, selector)
            path = options.out / f"{case}-mask.png"
            mask.save(path)
            started = time.perf_counter()
            job = client.post("/v1/jobs", files={"image": photo, "foreground_mask": ("mask.png", path.read_bytes())})
            job_id = job.raise_for_status().json()["job_id"]
            end = time.monotonic() + 310
            while time.monotonic() < end:
                result = client.get(f"/v1/jobs/{job_id}").raise_for_status().json()
                if result["status"] in ("succeeded", "failed"):
                    break
                time.sleep(0.8)
            if result["status"] != "succeeded" or result["provider"] != "sf3d-local":
                raise RuntimeError(result)
            model_id = result["model_id"]
            model = client.get(f"/v1/models/{model_id}").raise_for_status().json()
            asset = client.get(f"/v1/models/{model_id}/glb?download=true").raise_for_status()
            (options.out / f"{case}.glb").write_bytes(asset.content)
            evidence = {
                key: model[key] for key in ("vertices", "triangles", "bounds_extent", "appearance", "byte_size", "provider")
            }
            evidence["end_to_end_seconds"] = round(time.perf_counter() - started, 3)
            (options.out / f"{case}.json").write_text(json.dumps(evidence, indent=2) + "\n")
            print(case, evidence, flush=True)


if __name__ == "__main__":
    main()

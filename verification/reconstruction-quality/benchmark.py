"""Reproduce baseline and reviewed-mask experiments with the installed offline SF3D."""

import argparse
import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path[:0] = [str(ROOT / "backend"), str(HERE.parent / "reconstruction")]

from app.images import prepare_image
from local_sf3d.foreground import apply_mask, frame_foreground
from validate_glb import inspect_glb

INPUTS = {
    "chair": HERE.parent / "reconstruction/inputs/furniture.jpg",
    "shoe": HERE.parent / "reconstruction/inputs/shoes.jpg",
    "bottle": HERE / "bottle.jpg",
    "toy": HERE.parent / "reconstruction/inputs/toys.jpg",
    "electronics": HERE.parent / "reconstruction/inputs/electronics.jpg",
}
LOCAL = ROOT / "backend/local_sf3d"


def sample_rss(pid: int, stop: threading.Event, samples: list[float]) -> None:
    while not stop.is_set():
        process = subprocess.run(["ps", "-o", "rss=", "-p", str(pid)], check=False, capture_output=True, text=True)
        if process.stdout.strip():
            samples.append(int(process.stdout) / 1024)
        stop.wait(0.1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("out", type=Path)
    parser.add_argument("--home", type=Path, default=Path.home() / "vision3d-sf3d")
    parser.add_argument("--infer", type=Path, default=LOCAL / "infer.py")
    parser.add_argument("--baseline", action="store_true")
    args = parser.parse_args()
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    python = str(args.home / "venv/bin/python")
    env = dict(os.environ, SF3D_CODE=str(args.home / "stable-fast-3d"), HF_HUB_OFFLINE="1")
    env.pop("HF_TOKEN", None)
    runs: list[tuple[str, Path, dict[str, object]]] = []
    result: dict[str, object] = {}
    for item, input_path in INPUTS.items():
        source = out / f"{item}-source.png"
        prepare_image(input_path.read_bytes(), source)
        settings: dict[str, object] = {"remove": args.baseline}
        if not args.baseline:
            mask = out / f"{item}-mask.png"
            started = time.perf_counter()
            subprocess.run([python, str(LOCAL / "segment.py"), str(source), str(mask)], env=env, check=True)
            prep_seconds = time.perf_counter() - started
            with Image.open(source) as image, Image.open(mask) as alpha:
                cutout = apply_mask(image, alpha)
            cutout.save(out / f"{item}-cutout.png")
            source = out / f"{item}-framed.png"
            frame_foreground(cutout).save(source)
            result[f"{item}-preprocessing-seconds"] = round(prep_seconds, 3)
        runs.append((item, source, settings))
    if not args.baseline:
        for item in ("shoe", "chair"):
            runs.append((f"{item}-2048", out / f"{item}-framed.png", {"remove": False, "texture": 2048}))
        runs.append(("shoe-model-material", out / "shoe-framed.png", {"remove": False, "material": "model"}))

    with (out / "worker.log").open("w") as log, subprocess.Popen(
        [python, "-u", str(args.infer.resolve()), "--serve"], env=env, stdin=subprocess.PIPE,
        stdout=subprocess.PIPE, stderr=log, text=True,
    ) as process:
        assert process.stdout is not None and process.stdin is not None
        start = time.perf_counter()
        if not json.loads(process.stdout.readline()).get("ready"):
            raise RuntimeError("SF3D did not start. See worker.log.")
        result["worker_start_seconds"] = round(time.perf_counter() - start, 3)
        for item, source, settings in runs:
            target = out / f"{item}.glb"
            samples: list[float] = []
            stop = threading.Event()

            sampler = threading.Thread(target=sample_rss, args=(process.pid, stop, samples))
            sampler.start()
            try:
                process.stdin.write(json.dumps(dict(input=str(source), output=str(target), **settings)) + "\n")
                process.stdin.flush()
                record = json.loads(process.stdout.readline())
            finally:
                stop.set()
                sampler.join()
            if record.get("ok"):
                record.update(inspect_glb(target))
            record.update(file=target.name, peak_rss_mib=round(max(samples), 1) if samples else None)
            result[item] = record
            (out / "results.json").write_text(json.dumps(result, indent=2) + "\n")
            print(item, record, flush=True)
        process.stdin.close()
    if any(not result[item]["ok"] for item, _, _ in runs):
        raise SystemExit("At least one reconstruction failed. See results.json.")


if __name__ == "__main__":
    main()

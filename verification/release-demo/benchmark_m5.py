"""Sample real SF3D and TripoSR worker performance on the operator's Apple Silicon Mac."""

import argparse
import importlib
import json
import os
import re
import statistics
import subprocess
import sys
import tempfile
import threading
import time
from collections.abc import Callable
from pathlib import Path
from types import FrameType
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
BACKEND = ROOT / "backend"


def sf3d_bake_trace(model: Any) -> tuple[Callable[[FrameType, str, Any], Any], dict[str, float]]:
    function = model.generate_mesh.__func__
    code = function.__code__
    source = Path(code.co_filename).read_text().splitlines()
    start = next(i for i, line in enumerate(source, 1) if "rast = self.baker.rasterize(" in line)
    end = next(i for i, line in enumerate(source, 1) if "tmesh = trimesh.Trimesh(" in line)
    result: dict[str, float] = {}
    starts: list[float] = []

    def local(frame: FrameType, event: str, _arg: Any) -> Any:
        if event == "line" and frame.f_lineno == start:
            starts.append(time.perf_counter())
        if event == "line" and frame.f_lineno == end and starts:
            result["texture_seconds"] = time.perf_counter() - starts.pop()
        return local

    def tracer(frame: FrameType, event: str, arg: Any) -> Any:
        return local(frame, event, arg) if frame.f_code is code else None

    return tracer, result


def worker(kind: str) -> None:
    sys.path.insert(0, str(BACKEND / f"local_{kind}"))
    replies = sys.stdout
    sys.stdout = sys.stderr
    inference = importlib.import_module("infer")
    model, extra = inference.load()
    device = extra if kind == "triposr" else str(model.device)
    print(json.dumps({"device": device}), file=replies, flush=True)
    for line in sys.stdin:
        request = json.loads(line)
        if kind == "sf3d":
            trace, timings = sf3d_bake_trace(model)
            try:
                sys.settrace(trace)
                seconds = inference.reconstruct(model, extra, request["input"], request["output"], True)
            finally:
                sys.settrace(None)
            timings["reconstruct_seconds"] = seconds
        else:
            timings = inference.reconstruct(model, extra, request["input"], request["output"], 256, 2048)
        print(json.dumps(timings), file=replies, flush=True)


def sample(pid: int, stop: threading.Event, rows: list[tuple[float, float, float | None]]) -> None:
    while not stop.is_set():
        ps = subprocess.run(["ps", "-p", str(pid), "-o", "pcpu=,rss="], capture_output=True, text=True, check=False)
        gpu = subprocess.run(
            ["/usr/sbin/ioreg", "-r", "-d1", "-w0", "-c", "AGXAccelerator"],
            capture_output=True, text=True, check=False,
        )
        match = re.search(r'"Device Utilization %"=(\d+)', gpu.stdout)
        if ps.stdout.strip():
            cpu, rss = map(float, ps.stdout.split())
            rows.append((cpu, rss / 1024, float(match[1]) if match else None))
        stop.wait(0.5)


def sampled(pid: int, operation: Callable[[], dict[str, Any]]) -> dict[str, Any]:
    rows: list[tuple[float, float, float | None]] = []
    stop = threading.Event()
    monitor = threading.Thread(target=sample, args=(pid, stop, rows))
    monitor.start()
    start = time.perf_counter()
    try:
        result = operation()
    finally:
        stop.set()
        monitor.join()
    result["duration_seconds"] = round(time.perf_counter() - start, 3)
    if rows:
        result["cpu_peak_sample_percent"] = max(row[0] for row in rows)
        result["worker_peak_rss_mib"] = max(row[1] for row in rows)
        gpu = [row[2] for row in rows if row[2] is not None]
        if gpu:
            result["system_gpu_percent_median"] = statistics.median(gpu)
            result["system_gpu_percent_peak"] = max(gpu)
    return result


def main(output: Path) -> None:
    sys.path.insert(0, str(BACKEND))
    from app.images import prepare_image

    result = {}
    with tempfile.TemporaryDirectory(prefix="vision3d-m5-") as directory:
        work = Path(directory)
        sources = {}
        for name in ("shoes", "electronics"):
            source = work / f"{name}.png"
            photo = ROOT / f"verification/reconstruction/inputs/{name}.jpg"
            prepare_image(photo.read_bytes(), source)
            sources[name] = source

        for kind in ("sf3d", "triposr"):
            home = Path.home() / f"vision3d-{kind}"
            python = str(home / "venv/bin/python")
            env = dict(os.environ, HF_HUB_OFFLINE="1")
            env.pop("HF_TOKEN", None)
            if kind == "sf3d":
                env["SF3D_CODE"] = str(home / "stable-fast-3d")
            else:
                env["TRIPOSR_CODE"] = str(home / "TripoSR")
            prepared = dict(sources)
            prep_times = {}
            if kind == "triposr":
                for name, source in sources.items():
                    target = work / f"{name}-triposr.png"
                    start = time.perf_counter()
                    subprocess.run(
                        [python, str(BACKEND / "local_triposr/prep.py"), str(source), str(target)],
                        env=env, capture_output=True, check=True,
                    )
                    prepared[name] = target
                    prep_times[name] = round(time.perf_counter() - start, 3)

            with (work / f"{kind}.log").open("w") as log, subprocess.Popen(
                [python, "-u", __file__, "--worker", kind], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=log, env=env, text=True,
            ) as process:
                assert process.stdin and process.stdout
                cold = sampled(process.pid, lambda: json.loads(process.stdout.readline()))
                jobs = []
                for i, name in enumerate(["shoes", "shoes"] + (["electronics"] if kind == "triposr" else [])):
                    target = work / f"{kind}-{i}.glb"
                    parameters = {"input": str(prepared[name]), "output": str(target)}

                    def perform(parameters: dict[str, str] = parameters) -> dict[str, Any]:
                        process.stdin.write(json.dumps(parameters) + "\n")
                        process.stdin.flush()
                        return json.loads(process.stdout.readline())

                    trial = sampled(process.pid, perform)
                    trial["photo"] = name
                    trial["glb_bytes"] = target.stat().st_size
                    trial["separate_segmentation_seconds"] = prep_times.get(name)
                    jobs.append(trial)
                process.stdin.close()
                result[kind] = {"cold_start": cold, "jobs": jobs}
                output.write_text(json.dumps(result, indent=2) + "\n")
                print(kind, result[kind], flush=True)


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--worker":
        worker(sys.argv[2])
    else:
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument("output", type=Path)
        main(parser.parse_args().output)

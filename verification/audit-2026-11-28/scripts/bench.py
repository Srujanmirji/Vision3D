"""Live reconstruction benchmark through the real backend pipeline (no mocks).

Usage (from backend/): python bench.py OUT_DIR CHAIN IMAGE...   CHAIN = sf3d | triposr | round | box
Each image goes through POST /v1/jobs -> real worker -> finish_mesh -> stored GLB. Peak worker RSS is
sampled from `ps` every 0.5 s.
"""

import json
import subprocess
import sys
import threading
import time
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

out, chain, images = Path(sys.argv[1]), sys.argv[2], [Path(p) for p in sys.argv[3:]]
out.mkdir(parents=True, exist_ok=True)
home_sf3d, home_tsr = Path.home() / "vision3d-sf3d", Path.home() / "vision3d-triposr"
settings = Settings(
    data=out / "data",
    sf3d_home=home_sf3d if chain == "sf3d" else None,
    local_home=home_tsr,  # needed for round/box; for chain=sf3d it is also the fallback
    uploads_per_minute=100,
)
peak = {"rss": 0}
stop = threading.Event()


def sample() -> None:
    me = str(__import__("os").getpid())
    while not stop.is_set():
        rows = subprocess.run(["ps", "-A", "-o", "pid=,ppid=,rss=,command="], capture_output=True, text=True).stdout
        for row in rows.splitlines():
            parts = row.split(None, 3)
            if len(parts) == 4 and parts[1] == me and ("infer.py" in parts[3] or "app.providers" in parts[3]):
                peak["rss"] = max(peak["rss"], int(parts[2]) * 1024)
        time.sleep(0.5)


threading.Thread(target=sample, daemon=True).start()
results = []
with TestClient(create_app(settings)) as client:
    for image in images:
        peak["rss"] = 0
        mode = chain if chain in ("round", "box") else "auto"
        start = time.perf_counter()
        response = client.post(
            "/v1/jobs",
            files={"image": (image.name, image.read_bytes(), "image/jpeg")},
            data={"mode": mode, "remove_background": "true"},
        )
        response.raise_for_status()
        job_id = response.json()["job_id"]
        while True:
            job = client.get(f"/v1/jobs/{job_id}").json()
            if job["status"] in ("succeeded", "failed"):
                break
            time.sleep(0.5)
        seconds = time.perf_counter() - start
        row = {"image": image.name, "chain": chain, "status": job["status"], "provider": job["provider"],
               "error": job["error"], "seconds": round(seconds, 1), "peak_worker_rss_mb": round(peak["rss"] / 2**20)}
        if job["status"] == "succeeded":
            model = client.get(f"/v1/models/{job['model_id']}").json()
            glb = client.get(f"/v1/models/{job['model_id']}/glb").content
            target = out / f"{image.stem}-{chain}.glb"
            target.write_bytes(glb)
            row.update(bytes=len(glb), triangles=model.get("triangles"), vertices=model.get("vertices"),
                       appearance=model.get("appearance"), texture=model.get("texture_resolution"))
        print(json.dumps(row), flush=True)
        results.append(row)
stop.set()
(out / f"results-{chain}.json").write_text(json.dumps(results, indent=1))

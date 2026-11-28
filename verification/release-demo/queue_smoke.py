"""Submit two real images while the local TripoSR worker is cold and observe the queue."""

import json
import sys
import tempfile
import time
from pathlib import Path

from fastapi.testclient import TestClient

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.config import Settings
from app.main import create_app

with tempfile.TemporaryDirectory(prefix="vision3d-queue-") as root:
    settings = Settings(data=Path(root), local_home=Path.home() / "vision3d-triposr")
    with TestClient(create_app(settings)) as client:
        start = time.monotonic()
        ids = []
        accepted = []
        for name in ("shoes", "electronics"):
            photo = ROOT / f"verification/reconstruction/inputs/{name}.jpg"
            response = client.post("/v1/jobs", files={"image": (photo.name, photo.read_bytes(), "image/jpeg")})
            assert response.status_code == 202, response.text
            ids.append(response.json()["job_id"])
            accepted.append(round(time.monotonic() - start, 3))
        observed = [[], []]
        done: dict[int, dict[str, object]] = {}
        saw_busy = False
        while len(done) < 2 and time.monotonic() - start < 320:
            state = client.get("/health/inference").json()
            saw_busy |= state["state"] == "busy"
            for index, job_id in enumerate(ids):
                if index in done:
                    continue
                job = client.get(f"/v1/jobs/{job_id}").json()
                if not observed[index] or observed[index][-1] != job["status"]:
                    observed[index].append(job["status"])
                if job["status"] == "succeeded":
                    model_id = job["model_id"]
                    metadata = client.get(f"/v1/models/{model_id}").json()
                    output = client.get(f"/v1/models/{model_id}/glb").content
                    assert metadata["provider"] == "triposr-local" and len(output) == metadata["byte_size"]
                    assert output[:4] == b"glTF"
                    done[index] = {
                        "seconds_from_start": round(time.monotonic() - start, 3),
                        "triangles": metadata["triangles"], "glb_bytes": len(output),
                    }
                if job["status"] == "failed":
                    raise RuntimeError(job["error"])
            time.sleep(0.4)
        assert len(done) == 2 and saw_busy and "queued" in observed[1], (done, observed)
        summary = {
            "accepted_seconds_from_start": accepted, "observed": observed, "completed": done,
            "inference_at_end": client.get("/health/inference").json(),
        }
        print(json.dumps(summary, indent=2))
        (HERE / "queue.json").write_text(json.dumps(summary, indent=2) + "\n")

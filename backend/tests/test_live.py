"""Opt-in smoke tests against the previously verified public CPU Space."""

import json
import os
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.mesh import document, load_mesh

PROJECT = Path(__file__).resolve().parents[2]


@pytest.mark.skipif(os.getenv("VISION3D_RUN_LIVE") != "1", reason="requires live free Hugging Face inference")
@pytest.mark.parametrize("photo", ["shoes", "furniture"])
def test_real_photo_reaches_download(tmp_path: Path, photo: str) -> None:
    input_image = PROJECT / "verification" / "reconstruction" / "inputs" / f"{photo}.jpg"
    space = os.getenv("TRIPOSR_SPACE")
    app = create_app(
        Settings(
            data=tmp_path / "store",
            primary_space=space,
            hf_token=os.getenv("HF_TOKEN"),
            community_demo=not space,
        )
    )
    start = time.monotonic()
    with TestClient(app) as client:
        queued = client.post(
            "/v1/jobs",
            files={"image": ("test.jpg", input_image.read_bytes(), "image/jpeg")},
            data={"allow_external_processing": "true", "remove_background": "true"},
        )
        assert queued.status_code == 202, queued.text
        job_id = queued.json()["job_id"]
        stages: list[str] = []
        while time.monotonic() - start < 315:
            response = client.get(f"/v1/jobs/{job_id}")
            assert response.status_code == 200
            job = response.json()
            if not stages or stages[-1] != job["stage"]:
                stages.append(job["stage"])
            if job["status"] in ("failed", "succeeded"):
                break
            time.sleep(1)
        else:
            pytest.fail("No terminal backend job state")
        assert job["status"] == "succeeded", {"job": job, "stages": stages}
        model = client.get(f"/v1/models/{job['model_id']}").json()
        assert model["appearance"] == "baked_texture"
        download = client.get(f"/v1/models/{model['id']}/glb?download=true")
        assert download.status_code == 200
        assert download.headers["content-type"] == "model/gltf-binary"
        assert download.headers["content-disposition"].startswith("attachment;")
        local = tmp_path / "download.glb"
        local.write_bytes(download.content)
        metadata = document(local, 10_000_000)
        assert metadata["images"] and metadata["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"]
        assert len(load_mesh(local).faces) == model["triangles"]
        assert client.get("/v1/jobs").json()["jobs"][0]["job_id"] == job_id
        assert client.get("/v1/models").json()["models"][0]["id"] == model["id"]
        evidence = os.getenv("VISION3D_LIVE_EVIDENCE")
        if evidence:
            target = Path(evidence) / photo
            target.mkdir(parents=True, exist_ok=True)
            (target / "model.glb").write_bytes(download.content)
            (target / "result.json").write_text(
                json.dumps(
                    {
                        "job": job,
                        "model": model,
                        "stages": stages,
                        "total_seconds": round(time.monotonic() - start, 2),
                    },
                    indent=2,
                )
                + "\n"
            )
        assert client.delete(f"/v1/models/{model['id']}").status_code == 204
        assert client.get(f"/v1/models/{model['id']}/glb").status_code == 404


@pytest.mark.skipif(os.getenv("VISION3D_RUN_LIVE_FALLBACK") != "1", reason="requires free ZeroGPU inference")
def test_real_zero_gpu_fallback(tmp_path: Path) -> None:
    from collections.abc import Callable

    from app.jobs import subprocess_runner
    from app.providers import Provider
    from app.schemas import Failure, MeshInfo

    async def unavailable_primary(
        provider: Provider,
        folder: Path,
        remove: bool,
        config: Settings,
        stage: Callable[[str], None],
    ) -> MeshInfo:
        if provider.id == "triposr":
            raise Failure("PROVIDER_UNAVAILABLE", "Induced primary failure for fallback testing")
        return await subprocess_runner(provider, folder, remove, config, stage)

    input_image = PROJECT / "verification" / "reconstruction" / "inputs" / "electronics.jpg"
    config = Settings(data=tmp_path / "store", community_demo=True, shape_fallback=True)
    with TestClient(create_app(config, unavailable_primary)) as client:
        queued = client.post(
            "/v1/jobs",
            files={"image": ("test.jpg", input_image.read_bytes(), "image/jpeg")},
            data={"allow_external_processing": "true"},
        )
        assert queued.status_code == 202, queued.text
        deadline = time.monotonic() + 315
        while time.monotonic() < deadline:
            response = client.get(f"/v1/jobs/{queued.json()['job_id']}")
            assert response.status_code == 200
            job = response.json()
            if job["status"] in ("failed", "succeeded"):
                break
            time.sleep(1)
        else:
            pytest.fail("No terminal fallback state")
        evidence = os.getenv("VISION3D_LIVE_EVIDENCE")
        target = Path(evidence) / "fallback" if evidence else tmp_path
        target.mkdir(parents=True, exist_ok=True)
        (target / "result.json").write_text(json.dumps(job, indent=2) + "\n")
        assert job["status"] == "succeeded", job
        assert job["provider"] == "hunyuan-shape"
        model = client.get(f"/v1/models/{job['model_id']}").json()
        assert model["appearance"] == "shape_only" and 0 < model["triangles"] <= 100_000
        asset = client.get(f"/v1/models/{model['id']}/glb")
        assert asset.status_code == 200 and asset.content[:4] == b"glTF"
        (target / "model.glb").write_bytes(asset.content)
        (target / "result.json").write_text(json.dumps({"job": job, "model": model}, indent=2) + "\n")

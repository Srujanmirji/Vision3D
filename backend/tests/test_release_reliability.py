import asyncio
import sys
import threading
from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from test_backend import fixture_runner, submit, terminal

from app.config import Settings
from app.jobs import WarmModel
from app.main import create_app
from app.providers import Provider
from app.schemas import Failure, MeshInfo


def test_inference_status_follows_real_job_transitions(tmp_path: Path) -> None:
    permit = threading.Event()

    async def runner(
        provider: Provider, folder: Path, remove: bool, config: Settings, stage: Callable[[str], None],
    ) -> MeshInfo:
        await asyncio.to_thread(permit.wait, 3)
        return await fixture_runner(provider, folder, remove, config, stage)

    config = Settings(data=tmp_path, community_demo=True)
    with TestClient(create_app(config, runner)) as client:
        assert client.get("/health/live").status_code == 200
        assert client.get("/health/ready").status_code == 200
        assert client.get("/health/inference").json()["state"] == "unverified"
        try:
            job = submit(client)
            assert client.get("/health/inference").json()["state"] == "busy"
        finally:
            permit.set()
        assert terminal(client, job)["status"] == "succeeded"
        assert client.get("/health").json()["inference"] == {
            "state": "ready", "active_jobs": 0, "last_successful_provider": "triposr",
        }


def test_public_docs_and_owner_only_link_revocation(tmp_path: Path) -> None:
    origin = "https://vision.example.com"
    config = Settings(data=tmp_path, community_demo=True, public_app=origin)
    with TestClient(create_app(config, fixture_runner), base_url=origin) as client:
        for private_reference in ("/docs", "/redoc", "/openapi.json"):
            assert client.get(private_reference).status_code == 404
        model = terminal(client, submit(client))["model_id"]
        path = f"/v1/models/{model}/share"
        first, second = (client.post(path).json()["token"] for _ in range(2))
        asset = f"/v1/share/{first}/glb"
        cookies = dict(client.cookies)
        client.cookies.clear()
        assert client.get(asset).status_code == 200
        assert client.delete(f"{path}/{first}").status_code == 404
        client.cookies.update(cookies)
        assert client.delete(f"{path}/{first}").status_code == 204
        assert client.get(asset).status_code == 404
        assert client.get(f"/v1/share/{second}/glb").status_code == 200


def test_idle_worker_restarts_after_broken_protocol(tmp_path: Path) -> None:
    worker = tmp_path / "worker.py"
    marker = tmp_path / "attempt"
    worker.write_text(f"""
from pathlib import Path
import sys
marker = Path({str(marker)!r})
print('{{"ready": true}}', flush=True)
for msg in sys.stdin:
    if not marker.exists():
        marker.touch()
        print('invalid protocol', flush=True)
    else:
        print('{{"ok": true}}', flush=True)
""")

    async def run() -> None:
        engine = WarmModel()
        command = (sys.executable, str(worker))
        try:
            with pytest.raises(Failure) as broken:
                await engine.reconstruct(command, {}, {})
            assert broken.value.error.code == "TRANSIENT_PROVIDER_ERROR"
            assert engine.process is None
            await engine.reconstruct(command, {}, {})
        finally:
            await engine.stop()

    asyncio.run(run())

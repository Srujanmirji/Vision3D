"""Round-object mode: silhouette profile + photo wrap, and its API wiring."""

import json
import stat
import time
from collections.abc import Callable
from pathlib import Path

import numpy as np
import pytest
import trimesh
from fastapi.testclient import TestClient
from PIL import Image
from test_backend import fixture_runner, photo
from test_local_triposr import fake_home

from app.config import Settings
from app.lathe import build_round_object
from app.main import create_app
from app.mesh import finish_mesh
from app.providers import Provider, invoke_round
from app.schemas import Failure, MeshInfo


def can_cutout(path: Path, width: int = 120, height: int = 300) -> None:
    """A transparent cut-out of an upright can: red top half, blue bottom half."""
    image = np.zeros((height + 40, width + 40, 4), dtype=np.uint8)
    image[20 : 20 + height // 2, 20 : 20 + width] = [220, 30, 30, 255]
    image[20 + height // 2 : 20 + height, 20 : 20 + width] = [30, 30, 220, 255]
    Image.fromarray(image).save(path)


def test_round_object_has_the_photo_proportions_and_colours(tmp_path: Path) -> None:
    can_cutout(tmp_path / "cutout.png")
    build_round_object(tmp_path / "cutout.png", tmp_path / "raw.glb")
    info = finish_mesh(tmp_path / "raw.glb", tmp_path / "model.glb", 10_000_000, allow_shape=False)

    assert info.appearance == "native_texture"
    width, height, depth = info.bounds_extent
    assert height == pytest.approx(1.0, abs=0.01)
    assert width == pytest.approx(depth, rel=0.01)  # round
    assert width == pytest.approx(120 / 300, rel=0.05)  # same proportions as the photo

    mesh = trimesh.load_scene(tmp_path / "model.glb").to_mesh()
    texture = np.asarray(mesh.visual.material.baseColorTexture.convert("RGB"))
    middle = texture.shape[1] // 2  # u = 0.5 faces the camera
    assert texture[texture.shape[0] // 4, middle].tolist() == pytest.approx([220, 30, 30], abs=10)
    assert texture[texture.shape[0] * 3 // 4, middle].tolist() == pytest.approx([30, 30, 220], abs=10)


def test_round_object_rejects_a_photo_without_an_object(tmp_path: Path) -> None:
    Image.new("RGBA", (100, 100), (0, 0, 0, 0)).save(tmp_path / "empty.png")
    with pytest.raises(Failure) as failure:
        build_round_object(tmp_path / "empty.png", tmp_path / "raw.glb")
    assert failure.value.error.code == "INVALID_IMAGE"


def test_round_pipeline_cuts_out_then_builds(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    home = fake_home(tmp_path)
    cutout = tmp_path / "fixture-cutout.png"
    can_cutout(cutout)
    python = home / "venv" / "bin" / "python"
    python.write_text(f'#!/bin/sh\n[ "$4" = "--cutout" ] && cp "{cutout}" "$3"\n')
    python.chmod(python.stat().st_mode | stat.S_IEXEC)
    folder = tmp_path / "job"
    folder.mkdir()
    image = tmp_path / "input.png"
    Image.new("RGB", (32, 32), "white").save(image)

    invoke_round(home, image, folder, limit=10_000_000)

    messages = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    assert next(m["info"] for m in messages if "info" in m)["appearance"] == "native_texture"


def recording_runner(kinds: list[str]) -> Callable[..., object]:
    async def runner(
        provider: Provider, folder: Path, remove: bool, config: Settings, stage: Callable[[str], None]
    ) -> MeshInfo:
        kinds.append(provider.kind)
        return await fixture_runner(provider, folder, remove, config, stage)

    return runner


def test_round_mode_api(tmp_path: Path) -> None:
    def submit(client: TestClient, mode: str, consent: str = "false") -> dict[str, object]:
        response = client.post(
            "/v1/jobs",
            files={"image": ("photo.jpg", photo(), "image/jpeg")},
            data={"allow_external_processing": consent, "mode": mode},
        )
        result: dict[str, object] = response.json()
        return result

    with TestClient(create_app(Settings(data=tmp_path / "plain", community_demo=True), fixture_runner)) as client:
        assert client.get("/health").json()["round_mode"] is False
        assert submit(client, "round", consent="true")["error"] == {
            "code": "ROUND_MODE_UNAVAILABLE",
            "message": "Round-object mode needs local processing on the server.",
        }

    kinds: list[str] = []
    settings = Settings(data=tmp_path / "local", local_home=fake_home(tmp_path), community_demo=True)
    with TestClient(create_app(settings, recording_runner(kinds))) as client:  # type: ignore[arg-type]
        health = client.get("/health").json()
        assert health["round_mode"] is True and health["external_processing"] is True
        job = submit(client, "round")  # no consent: round mode never leaves the machine
        assert "job_id" in job, job
        until = time.monotonic() + 5
        while client.get(f"/v1/jobs/{job['job_id']}").json()["status"] not in ("succeeded", "failed"):
            assert time.monotonic() < until
        assert kinds == ["round"]  # only the round provider, never the hosted fallback
        assert submit(client, "auto")["error"]["code"] == "CONSENT_REQUIRED"  # type: ignore[index]

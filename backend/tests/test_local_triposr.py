"""Local TripoSR provider, with a fake TripoSR environment so no torch or GPU is needed."""

import json
import os
import stat
from pathlib import Path

import numpy as np
import pytest
import trimesh
from fastapi.testclient import TestClient
from PIL import Image
from test_backend import fixture_runner, photo

from app.config import Settings
from app.main import configured_providers, create_app
from app.providers import invoke_local
from app.schemas import Failure


def textured_box(path: Path) -> None:
    """A small GLB shaped like local TripoSR output: UVs plus an embedded base-colour texture."""
    box = trimesh.creation.box()
    uv = np.random.default_rng(1).random((len(box.vertices), 2))
    material = trimesh.visual.material.PBRMaterial(  # type: ignore[no-untyped-call]
        baseColorTexture=Image.new("RGB", (64, 64), "#c0392b")
    )
    box.visual = trimesh.visual.TextureVisuals(uv=uv, material=material)  # type: ignore[no-untyped-call]
    box.export(path)


def fake_home(tmp_path: Path, fail_step: str = "") -> Path:
    """A LOCAL_TRIPOSR_HOME whose 'python' records each call and produces the expected files."""
    home = tmp_path / "triposr-home"
    (home / "TripoSR").mkdir(parents=True)
    (home / "venv" / "bin").mkdir(parents=True)
    glb = tmp_path / "fixture.glb"
    textured_box(glb)
    python = home / "venv" / "bin" / "python"
    python.write_text(f"""#!/bin/sh
step=$(basename "$1")
printf '%s|%s|%s|%s\\n' "$step" "$HF_HUB_OFFLINE" "${{HF_TOKEN:-none}}" "$TRIPOSR_CODE" >> "{tmp_path}/calls.log"
[ "$step" = "{fail_step}" ] && exit 1
case "$step" in
  prep.py) cp "$2" "$3" ;;
  infer.py) cp "{glb}" "$3" ;;
esac
""")
    python.chmod(python.stat().st_mode | stat.S_IEXEC)
    return home


def test_local_runs_first_then_hosted_fallbacks(tmp_path: Path) -> None:
    home = fake_home(tmp_path)
    ids = [p.id for p in configured_providers(Settings(data=tmp_path, local_home=home, community_demo=True))]
    assert ids == ["triposr-local", "triposr"]
    assert [p.id for p in configured_providers(Settings(data=tmp_path, local_home=home))] == ["triposr-local"]


def test_missing_local_install_fails_at_startup(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="setup-local-triposr"):
        Settings(data=tmp_path, local_home=tmp_path / "nowhere")


def test_local_pipeline_runs_offline_without_token_and_validates(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HF_TOKEN", "secret-token")
    home = fake_home(tmp_path)
    folder = tmp_path / "job"
    folder.mkdir()
    image = tmp_path / "input.png"
    Image.new("RGB", (32, 32), "white").save(image)

    invoke_local(home, image, folder, remove=True, limit=10_000_000)

    calls = (tmp_path / "calls.log").read_text().splitlines()
    assert calls == [f"prep.py|1|none|{home / 'TripoSR'}", f"infer.py|1|none|{home / 'TripoSR'}"]
    messages = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    info = next(m["info"] for m in messages if "info" in m)
    assert info["appearance"] == "native_texture"
    assert (folder / "model.glb").is_file()


def test_local_pipeline_skips_background_removal_when_off(tmp_path: Path) -> None:
    home = fake_home(tmp_path)
    folder = tmp_path / "job"
    folder.mkdir()
    image = tmp_path / "input.png"
    Image.new("RGB", (32, 32), "white").save(image)
    invoke_local(home, image, folder, remove=False, limit=10_000_000)
    assert [c.split("|")[0] for c in (tmp_path / "calls.log").read_text().splitlines()] == ["infer.py"]


def test_local_step_failure_is_reported_as_provider_unavailable(tmp_path: Path) -> None:
    home = fake_home(tmp_path, fail_step="infer.py")
    folder = tmp_path / "job"
    folder.mkdir()
    image = tmp_path / "input.png"
    Image.new("RGB", (32, 32), "white").save(image)
    with pytest.raises(Failure) as failure:
        invoke_local(home, image, folder, remove=True, limit=10_000_000)
    assert failure.value.error.code == "PROVIDER_UNAVAILABLE"


def test_local_only_setup_does_not_ask_for_hugging_face_consent(tmp_path: Path) -> None:
    home = fake_home(tmp_path)
    with TestClient(create_app(Settings(data=tmp_path / "data", local_home=home), fixture_runner)) as client:
        response = client.post(
            "/v1/jobs",
            files={"image": ("photo.jpg", photo(), "image/jpeg")},
            data={"allow_external_processing": "false"},
        )
        assert response.status_code == 202, response.text

    with TestClient(
        create_app(Settings(data=tmp_path / "data2", local_home=home, community_demo=True), fixture_runner)
    ) as client:
        response = client.post(
            "/v1/jobs",
            files={"image": ("photo.jpg", photo(), "image/jpeg")},
            data={"allow_external_processing": "false"},
        )
        assert response.json()["error"]["code"] == "CONSENT_REQUIRED"  # the hosted fallback could be used


assert os.name == "posix"  # the fake environment is a POSIX shell script

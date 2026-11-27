"""Local TripoSR provider, with a fake TripoSR environment so no torch or GPU is needed."""

import asyncio
import os
import stat
import sys
from pathlib import Path

import numpy as np
import pytest
import trimesh
from fastapi.testclient import TestClient
from PIL import Image
from test_backend import fixture_runner, photo

from app.config import Settings
from app.jobs import WARM, local_runner
from app.main import configured_providers, create_app
from app.providers import Provider
from app.schemas import Failure, MeshInfo


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
    """A LOCAL_TRIPOSR_HOME whose 'python' records each call and produces the expected files.
    `infer.py --serve` runs a tiny real-Python server that answers like the real one."""
    home = tmp_path / "triposr-home"
    (home / "TripoSR").mkdir(parents=True)
    (home / "venv" / "bin").mkdir(parents=True)
    glb = tmp_path / "fixture.glb"
    textured_box(glb)
    server = tmp_path / "fake_server.py"
    server.write_text(f"""import json, os, shutil, sys
with open({str(tmp_path / "calls.log")!r}, "a") as log:
    log.write("serve|" + os.environ.get("HF_HUB_OFFLINE", "") + "|" + os.environ.get("HF_TOKEN", "none") + "\\n")
print(json.dumps({{"ready": True}}), flush=True)
for line in sys.stdin:
    if {fail_step!r} == "hang":
        import time; time.sleep(60)
    job = json.loads(line)
    ok = {fail_step!r} != "infer.py"
    if ok:
        shutil.copy({str(glb)!r}, job["output"])
    print(json.dumps({{"ok": ok}}), flush=True)
""")
    python = home / "venv" / "bin" / "python"
    python.write_text(f"""#!/bin/sh
step=$(basename "$1")
if [ "$2" = "--serve" ]; then exec {sys.executable} "{server}"; fi
printf '%s|%s|%s|%s\\n' "$step" "$HF_HUB_OFFLINE" "${{HF_TOKEN:-none}}" "$TRIPOSR_CODE" >> "{tmp_path}/calls.log"
[ "$step" = "{fail_step}" ] && exit 1
case "$step" in
  prep.py) cp "$2" "$3" ;;
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


async def run_jobs(home: Path, tmp_path: Path, count: int = 1, remove: bool = True) -> list[MeshInfo]:
    """Run jobs one after another in one event loop, as the backend does, then stop the warm process."""
    provider = Provider("triposr-local", "local", str(home), "local", True)
    settings = Settings(data=tmp_path / "data")
    results = []
    try:
        for index in range(count):
            folder = tmp_path / f"job-{index}" / "0-0"
            folder.mkdir(parents=True)
            Image.new("RGB", (32, 32), "white").save(folder.parent / "input.png")
            results.append(await local_runner(provider, folder, remove, settings, lambda _stage: None))
    finally:
        await WARM.stop()
    return results


def test_local_pipeline_runs_offline_without_token_and_validates(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HF_TOKEN", "secret-token")
    home = fake_home(tmp_path)
    infos = asyncio.run(run_jobs(home, tmp_path, count=2))
    assert [i.appearance for i in infos] == ["native_texture", "native_texture"]
    calls = (tmp_path / "calls.log").read_text().splitlines()
    assert calls.count("serve|1|none") == 1  # model loaded once for both jobs, offline, no token
    assert calls.count(f"prep.py|1|none|{home / 'TripoSR'}") == 2


def test_local_pipeline_skips_background_removal_when_off(tmp_path: Path) -> None:
    asyncio.run(run_jobs(fake_home(tmp_path), tmp_path, remove=False))
    assert not any(c.startswith("prep.py") for c in (tmp_path / "calls.log").read_text().splitlines())


def test_local_failures_are_reported_as_provider_unavailable(tmp_path: Path) -> None:
    for step in ("prep.py", "infer.py"):
        home = fake_home(tmp_path / step, fail_step=step)
        with pytest.raises(Failure) as failure:
            asyncio.run(run_jobs(home, tmp_path / step))
        assert failure.value.error.code == "PROVIDER_UNAVAILABLE"


def test_timeout_kills_a_hung_triposr_process(tmp_path: Path) -> None:
    home = fake_home(tmp_path, fail_step="hang")
    provider = Provider("triposr-local", "local", str(home), "local", True)
    folder = tmp_path / "job" / "0-0"
    folder.mkdir(parents=True)
    Image.new("RGB", (32, 32), "white").save(folder.parent / "input.png")

    async def scenario() -> int:
        with pytest.raises(TimeoutError):
            async with asyncio.timeout(2):
                await local_runner(provider, folder, False, Settings(data=tmp_path / "d"), lambda _s: None)
        return 0 if WARM.process is None else 1

    assert asyncio.run(scenario()) == 0  # the stuck process was killed, the next job starts fresh


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

"""Local Stable Fast 3D provider, with a fake SF3D environment so no torch or model weights are needed."""

import asyncio
import stat
import sys
from pathlib import Path

import pytest
from PIL import Image
from test_local_triposr import fake_home, textured_box

from app.config import Settings
from app.jobs import WARM, local_runner, sf3d_runner
from app.main import configured_providers
from app.providers import Provider
from app.schemas import Failure, MeshInfo


def fake_sf3d_home(tmp_path: Path, fail: bool = False, ready_delay: float = 0) -> Path:
    """A LOCAL_SF3D_HOME whose 'python' runs a tiny server that answers like local_sf3d/infer.py."""
    home = tmp_path / "sf3d-home"
    (home / "stable-fast-3d").mkdir(parents=True)
    (home / "venv" / "bin").mkdir(parents=True)
    glb = tmp_path / "sf3d-fixture.glb"
    textured_box(glb)
    server = tmp_path / "fake_sf3d.py"
    server.write_text(f"""import json, os, shutil, sys, time
time.sleep({ready_delay!r})
with open({str(tmp_path / "sf3d.log")!r}, "a") as log:
    log.write("serve|" + os.environ.get("HF_HUB_OFFLINE", "") + "|" + os.environ.get("HF_TOKEN", "none")
              + "|" + os.environ.get("SF3D_CODE", "") + "\\n")
print(json.dumps({{"ready": True}}), flush=True)
for line in sys.stdin:
    job = json.loads(line)
    with open({str(tmp_path / "sf3d.log")!r}, "a") as log:
        log.write("job|" + str(job["remove"]) + "\\n")
    if not {fail!r}:
        shutil.copy({str(glb)!r}, job["output"])
    print(json.dumps({{"ok": not {fail!r}}}), flush=True)
""")
    python = home / "venv" / "bin" / "python"
    python.write_text(f'#!/bin/sh\n[ "$2" = "--serve" ] && exec {sys.executable} "{server}"\nexit 1\n')
    python.chmod(python.stat().st_mode | stat.S_IEXEC)
    return home


def job_folder(tmp_path: Path, name: str) -> Path:
    folder = tmp_path / name / "0-0"
    folder.mkdir(parents=True)
    Image.new("RGB", (32, 32), "white").save(folder.parent / "input.png")
    return folder


def test_sf3d_runs_first_then_local_triposr(tmp_path: Path) -> None:
    settings = Settings(data=tmp_path, sf3d_home=fake_sf3d_home(tmp_path), local_home=fake_home(tmp_path))
    assert [p.id for p in configured_providers(settings)] == ["sf3d-local", "triposr-local"]


def test_missing_sf3d_install_fails_at_startup(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="setup-local-sf3d"):
        Settings(data=tmp_path, sf3d_home=tmp_path / "nowhere")


def test_sf3d_runs_offline_without_token_and_keeps_the_model_loaded(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HF_TOKEN", "secret-token")
    home = fake_sf3d_home(tmp_path)
    provider = Provider("sf3d-local", "local", str(home), "sf3d", True)
    settings = Settings(data=tmp_path / "data")

    async def scenario() -> list[MeshInfo]:
        try:
            return [
                await sf3d_runner(provider, job_folder(tmp_path, f"job-{i}"), i == 0, settings, lambda _s: None)
                for i in range(2)
            ]
        finally:
            await WARM.stop()

    assert [i.appearance for i in asyncio.run(scenario())] == ["native_texture", "native_texture"]
    log = (tmp_path / "sf3d.log").read_text().splitlines()
    assert log == [f"serve|1|none|{home / 'stable-fast-3d'}", "job|True", "job|False"]


def test_sf3d_failure_is_provider_unavailable(tmp_path: Path) -> None:
    provider = Provider("sf3d-local", "local", str(fake_sf3d_home(tmp_path, fail=True)), "sf3d", True)

    async def scenario() -> None:
        try:
            await sf3d_runner(provider, job_folder(tmp_path, "job"), True, Settings(data=tmp_path), lambda _s: None)
        finally:
            await WARM.stop()

    with pytest.raises(Failure) as failure:
        asyncio.run(scenario())
    assert failure.value.error.code == "PROVIDER_UNAVAILABLE"


def test_only_one_model_stays_in_memory(tmp_path: Path) -> None:
    """Falling back to TripoSR replaces the SF3D process, so a small Mac never holds both models."""
    sf3d = Provider("sf3d-local", "local", str(fake_sf3d_home(tmp_path)), "sf3d", True)
    triposr = Provider("triposr-local", "local", str(fake_home(tmp_path)), "local", True)
    settings = Settings(data=tmp_path / "data")

    async def scenario() -> tuple[int, int]:
        try:
            await sf3d_runner(sf3d, job_folder(tmp_path, "a"), True, settings, lambda _s: None)
            first = WARM.process
            assert first is not None
            await local_runner(triposr, job_folder(tmp_path, "b"), False, settings, lambda _s: None)
            return first.returncode or 0, 0 if WARM.process and WARM.process.returncode is None else 1
        finally:
            await WARM.stop()

    sf3d_exit, triposr_alive = asyncio.run(scenario())
    assert sf3d_exit != 0 and triposr_alive == 0


def test_cancel_while_the_model_loads_does_not_desync_the_next_job(tmp_path: Path) -> None:
    """A job cancelled before the worker says ready must not leave that unread 'ready' line for the next job."""
    provider = Provider("sf3d-local", "local", str(fake_sf3d_home(tmp_path, ready_delay=1.0)), "sf3d", True)
    settings = Settings(data=tmp_path / "data")

    async def scenario() -> MeshInfo:
        try:
            with pytest.raises(TimeoutError):
                async with asyncio.timeout(0.2):
                    await sf3d_runner(provider, job_folder(tmp_path, "a"), True, settings, lambda _s: None)
            return await sf3d_runner(provider, job_folder(tmp_path, "b"), True, settings, lambda _s: None)
        finally:
            await WARM.stop()

    assert asyncio.run(scenario()).appearance == "native_texture"

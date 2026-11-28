"""Exercise backend restart with real Uvicorn and a disposable tunnel-process test double."""

import os
import signal
import socket
import subprocess
import sys
import time
from collections.abc import Callable
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def until(condition: Callable[[], bool], timeout: float = 22) -> None:
    end = time.monotonic() + timeout
    while not condition():
        assert time.monotonic() < end, "Supervisor did not recover within the test budget"
        time.sleep(0.15)


@pytest.mark.skipif(sys.platform != "darwin", reason="Vision3D Mac supervisor uses macOS tools")
def test_backend_restart_keeps_the_connector_then_connector_recovers(tmp_path: Path) -> None:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    state = tmp_path / "state"
    executable = tmp_path / "bin"
    executable.mkdir()
    for file, script in {
        "cloudflared": "exec sleep 90",
        "curl": 'case "$*" in *https://vision.example.com/*) exit 0;; esac\nexec /usr/bin/curl "$@"',
    }.items():
        path = executable / file
        path.write_text(f"#!/bin/sh\n{script}\n")
        path.chmod(0o700)
    envfile = tmp_path / "test.env"
    envfile.write_text("")
    env = {
        **os.environ,
        "PATH": f"{executable}:{os.environ['PATH']}",
        "VISION3D_ENV_FILE": str(envfile),
        "VISION3D_DATA_DIR": str(tmp_path / "data"),
        "VISION3D_STATE_DIR": str(state),
        "VISION3D_LOG_DIR": str(tmp_path / "logs"),
        "VISION3D_PORT": str(port),
        "VISION3D_RESTART_DELAY": "1",
        "VISION3D_READY_TIMEOUT": "12",
        "VISION3D_COMMUNITY_DEMO": "1",
        "CLOUDFLARE_TUNNEL_TOKEN": "fixture-tunnel-token",
        "VISION3D_TUNNEL_URL": "https://vision.example.com",
    }
    with (tmp_path / "supervisor.log").open("w") as log:
        proc = subprocess.Popen(["sh", str(ROOT / "scripts/start-mac.sh")], env=env, stdout=log, stderr=log)
        try:
            def pid(name: str) -> int:
                try:
                    return int((state / f"{name}.pid").read_text())
                except (FileNotFoundError, ValueError):
                    return 0

            until(lambda: (state / "tunnel-url").is_file())
            backend, connector = pid("backend"), pid("tunnel")
            assert backend and connector
            os.kill(backend, signal.SIGTERM)
            until(lambda: pid("backend") not in (0, backend))
            assert pid("tunnel") == connector
            os.kill(connector, signal.SIGTERM)
            until(lambda: pid("tunnel") not in (0, connector))
            assert (state / "tunnel-url").read_text().strip() == "https://vision.example.com"
        finally:
            proc.terminate()
            proc.wait(timeout=35)

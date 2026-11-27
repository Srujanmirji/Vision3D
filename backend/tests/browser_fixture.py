"""Start the real API with a deterministic runner for browser regression tests only."""

import asyncio
import json
import os
from collections.abc import Callable
from pathlib import Path

import uvicorn

from app.config import Settings
from app.main import create_app
from app.providers import Provider
from app.schemas import MeshInfo

PROJECT = Path(__file__).resolve().parents[2]
EVIDENCE = PROJECT / "verification" / "frontend-live"


async def archived_runner(
    provider: Provider,
    folder: Path,
    remove: bool,
    config: Settings,
    stage: Callable[[str], None],
) -> MeshInfo:
    assert (folder.parent / "input.png").is_file()
    stage("provider_generation")
    await asyncio.sleep(0.8)
    (folder / "model.glb").write_bytes((EVIDENCE / "generated.glb").read_bytes())
    return MeshInfo.model_validate(json.loads((EVIDENCE / "result.json").read_text())["metadata"])


if __name__ == "__main__":
    settings = Settings(
        data=Path(os.environ["VISION3D_BROWSER_STORE"]),
        public_app="https://vision3d.test:3446",
        community_demo=True,
    )
    uvicorn.run(create_app(settings, archived_runner), host="127.0.0.1", port=8316, access_log=False)

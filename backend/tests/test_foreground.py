import base64
from collections.abc import Callable
from io import BytesIO
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw
from test_backend import terminal
from test_local_sf3d import fake_sf3d_home
from test_local_triposr import textured_box

from app.config import Settings
from app.main import create_app
from app.mesh import finish_mesh
from app.providers import Provider
from app.schemas import MeshInfo
from local_sf3d.foreground import apply_mask, foreground_box, frame_foreground


def png(image: Image.Image) -> bytes:
    work = BytesIO()
    image.save(work, format="PNG")
    return work.getvalue()


def test_red_fringe_shadow_and_thin_strap() -> None:
    photo = Image.new("RGB", (48, 48), "#d01008")
    ImageDraw.Draw(photo).rectangle((16, 16, 30, 35), fill="#404448")
    photo.putpixel((31, 33), (32, 41, 66))
    photo.putpixel((36, 12), (39, 45, 65))
    mask = Image.new("L", photo.size)
    ImageDraw.Draw(mask).rectangle((16, 16, 30, 35), fill=255)
    mask.putpixel((15, 26), 88)  # contaminated edge
    mask.putpixel((31, 33), 197)  # sole with meaningful original RGB
    mask.putpixel((36, 12), 71)  # detached soft strap
    mask.putpixel((0, 46), 14)  # faint cast shadow
    cutout = apply_mask(photo, mask)
    assert cutout.getpixel((15, 26)) == (64, 68, 72, 88)
    assert cutout.getpixel((31, 33)) == (32, 41, 66, 197)
    assert cutout.getpixel((36, 12)) == (39, 45, 65, 71)
    assert cutout.getpixel((0, 0)) == (0, 0, 0, 0)
    assert foreground_box(mask) == (15, 12, 37, 36)
    assert not (np.asarray(frame_foreground(cutout))[:, :, 3] == 14).any()


def test_border_touching_detail_and_empty_masks() -> None:
    mask = Image.new("L", (16, 16))
    ImageDraw.Draw(mask).line((0, 0, 15, 15), fill=255, width=1)
    result = frame_foreground(apply_mask(Image.new("RGB", mask.size), mask))
    assert np.count_nonzero(np.asarray(result.getchannel("A"))) == 16
    with pytest.raises(ValueError, match="No foreground"):
        frame_foreground(Image.new("RGBA", (16, 16)))


def test_preview_and_reviewed_mask_job_use_only_local_sf3d(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    photo = Image.new("RGB", (40, 32), "red")
    mask = Image.new("L", photo.size)
    ImageDraw.Draw(mask).rectangle((10, 4, 19, 28), fill=255)

    async def segment(args: list[str], env: dict[str, str]) -> None:
        assert env["HF_HUB_OFFLINE"] == "1"
        mask.save(args[-1])

    async def run(
        provider: Provider, folder: Path, remove: bool, config: Settings, stage: Callable[[str], None],
    ) -> MeshInfo:
        assert provider.kind == "sf3d" and not remove
        with Image.open(folder.parent / "input.png") as framed:
            expected = frame_foreground(apply_mask(photo, mask))
            assert framed.tobytes() == expected.tobytes()
        textured_box(folder / "raw.glb")
        return finish_mesh(folder / "raw.glb", folder / "model.glb", config.max_model, False)

    monkeypatch.setattr("app.main.run_step", segment)
    settings = Settings(data=tmp_path / "data", sf3d_home=fake_sf3d_home(tmp_path), community_demo=True)
    upload = {"image": ("source.png", png(photo), "image/png")}
    with TestClient(create_app(settings, run)) as client:
        assert client.get("/health").json()["foreground_preview"]
        response = client.post("/v1/preprocessing/foreground", files=upload)
        assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
        result = response.json()
        assert result["crop"] == [10, 4, 20, 29]
        with Image.open(BytesIO(base64.b64decode(result["cutout_png"]))) as cutout:
            assert cutout.getpixel((0, 0)) == (0, 0, 0, 0)
        with Image.open(BytesIO(base64.b64decode(result["mask_png"]))) as returned_mask:
            assert returned_mask.tobytes() == mask.tobytes()

        mismatch = upload | {"foreground_mask": ("mask.png", png(Image.new("L", (16, 16), 255)), "image/png")}
        assert client.post("/v1/jobs", files=mismatch).json()["error"]["code"] == "INVALID_MASK"
        files = upload | {"foreground_mask": ("mask.png", png(mask), "image/png")}
        off = client.post("/v1/jobs", files=files, data={"remove_background": "false"})
        assert off.status_code == 422
        queued = client.post("/v1/jobs", files=files)
        assert queued.status_code == 202
        assert terminal(client, queued.json()["job_id"])["status"] == "succeeded"


def test_preview_requires_local_model(tmp_path: Path) -> None:
    data = png(Image.new("RGB", (32, 32)))
    with TestClient(create_app(Settings(data=tmp_path, community_demo=True))) as client:
        assert not client.get("/health").json()["foreground_preview"]
        response = client.post("/v1/preprocessing/foreground", files={"image": ("source.png", data, "image/png")})
        assert response.status_code == 503

"""Run local U²-Net, independently of the warmed reconstruction worker."""

import os
import sys
from pathlib import Path
from typing import Any

import rembg
from PIL import Image


def session() -> Any:
    cache = Path(os.getenv("U2NET_HOME", "~/.u2net")).expanduser()
    if not (cache / "u2net.onnx").is_file():
        raise FileNotFoundError("Run setup-local-sf3d.sh to install U²-Net")
    return rembg.new_session("u2net")


def segment(image: Image.Image, model: Any) -> Image.Image:
    if "A" in image.getbands() and image.getchannel("A").getextrema()[0] < 255:
        return image.getchannel("A")
    return model.predict(image.convert("RGB"))[0].convert("L")


if __name__ == "__main__":
    with Image.open(sys.argv[1]) as photo:
        local_model = session() if photo.mode != "RGBA" or photo.getchannel("A").getextrema()[0] == 255 else None
        segment(photo, local_model).save(sys.argv[2], format="PNG")

"""Background removal + framing for TripoSR, kept out of the torch process: rembg and torch
load two OpenMP runtimes and abort when imported together. Uses u2net (Apache-2.0); rembg's
newer default (bria-rmbg) is non-commercial.
Mirrors TripoSR run.py: rembg -> resize_foreground(0.85) -> composite on 50% grey.
Usage: prep.py <input> <output.png> [ratio]
       prep.py <input> <output.png> --cutout   (transparent RGBA cut-out, cropped; for round-object mode)"""

import os
import sys
import time

import numpy as np
import rembg
from PIL import Image


def resize_foreground(image: Image.Image, ratio: float) -> Image.Image:
    arr = np.array(image)
    alpha = np.where(arr[..., 3] > 0)
    y1, y2, x1, x2 = alpha[0].min(), alpha[0].max(), alpha[1].min(), alpha[1].max()
    fg = arr[y1:y2, x1:x2]
    size = max(fg.shape[0], fg.shape[1])
    ph0, pw0 = (size - fg.shape[0]) // 2, (size - fg.shape[1]) // 2
    fg = np.pad(fg, ((ph0, size - fg.shape[0] - ph0), (pw0, size - fg.shape[1] - pw0), (0, 0)))
    new = int(size / ratio)
    p0 = (new - size) // 2
    fg = np.pad(fg, ((p0, new - size - p0), (p0, new - size - p0), (0, 0)))
    return Image.fromarray(fg)


def main() -> None:
    source, target = sys.argv[1], sys.argv[2]
    cutout_only = len(sys.argv) > 3 and sys.argv[3] == "--cutout"
    ratio = float(sys.argv[3]) if len(sys.argv) > 3 and not cutout_only else 0.85
    t0 = time.perf_counter()
    image = Image.open(source).convert("RGB")
    cut = rembg.remove(image, session=rembg.new_session(os.environ.get("REMBG_MODEL", "u2net")))
    if cutout_only:
        box = cut.getchannel("A").point(lambda a: 255 if a > 127 else 0).getbbox()
        if box is None:
            sys.exit("no foreground object found")
        cut.crop(box).save(target)
        print(f"prep_seconds={time.perf_counter() - t0:.2f}")
        return
    framed = np.asarray(resize_foreground(cut, ratio)).astype(np.float32) / 255.0
    rgb = framed[..., :3] * framed[..., 3:4] + (1 - framed[..., 3:4]) * 0.5
    Image.fromarray((rgb * 255).astype(np.uint8)).save(target)
    print(f"prep_seconds={time.perf_counter() - t0:.2f}")


if __name__ == "__main__":
    main()

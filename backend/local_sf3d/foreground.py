"""Shared mask application and inclusive framing for local SF3D."""

import math

import numpy as np
from PIL import Image

FOREGROUND_RATIO = 0.85
VISIBLE_ALPHA = 48


def foreground_box(mask: Image.Image) -> tuple[int, int, int, int]:
    box = mask.point(lambda value: 255 if value >= VISIBLE_ALPHA else 0).getbbox()
    if box is None:
        raise ValueError("No foreground object found")
    return box


def apply_mask(image: Image.Image, mask: Image.Image) -> Image.Image:
    if mask.mode != "L" or image.size != mask.size:
        raise ValueError("Mask does not match the oriented photo")
    foreground_box(mask)
    pixels = np.array(image.convert("RGBA"))
    alpha = np.asarray(mask)
    rgb = pixels[:, :, :3]
    rgb[alpha == 0] = 0

    # Only replace colour on soft edges near known foreground. Preserve the original
    # RGB of isolated details such as straps that have no opaque neighbour.
    height, width = alpha.shape
    padded_alpha = np.pad(alpha, 2)
    padded_rgb = np.pad(rgb, ((2, 2), (2, 2), (0, 0)))
    edge = (alpha > 0) & (alpha < 192)
    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, -1),
                   (-1, 1), (1, 1), (-2, 0), (2, 0), (0, -2), (0, 2)):
        region = np.s_[2 + dy:2 + dy + height, 2 + dx:2 + dx + width]
        use = edge & (padded_alpha[region] >= 224)
        rgb[use] = padded_rgb[region][use]
        edge[use] = False
    pixels[:, :, 3] = alpha
    return Image.fromarray(pixels)


def frame_foreground(image: Image.Image) -> Image.Image:
    left, top, right, bottom = foreground_box(image.getchannel("A"))
    size = math.ceil(max(right - left, bottom - top) / FOREGROUND_RATIO)
    x = (left + right - size) // 2
    y = (top + bottom - size) // 2
    # Pillow's exclusive right and bottom keep the final row/column and pad transparently.
    return image.crop((x, y, x + size, y + size))

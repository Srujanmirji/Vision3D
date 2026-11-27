"""Box mode: a rectangular product (packaging, book, phone) from one front photo.

The front face is the photo itself, so printed text stays sharp. One photo cannot show the
other faces or the depth: the sides, back, top and bottom take the product's own colour at each
height, and the depth is an estimate (DEPTH_RATIO of the width).
"""

from pathlib import Path

import numpy as np
import trimesh
from PIL import Image

from .lathe import row_colours, silhouette

DEPTH_RATIO = 0.35
FACE = 1024  # texture size per atlas half: [front | other faces]


def build_box_object(cutout: Path, output: Path) -> None:
    with Image.open(cutout) as source:
        image = source.convert("RGBA")
    rgba = np.asarray(image, dtype=np.float64)
    rows, centre, half = silhouette(rgba[..., 3])
    top, bottom = int(rows[0]), int(rows[-1])
    left, right = int((centre - half).min()), int((centre + half).max())
    height = bottom - top + 1
    width = right - left + 1

    # Atlas: left half is the front photo; right half is the product's colour at each height.
    front = image.crop((left, top, right + 1, bottom + 1))
    backdrop = Image.new("RGBA", front.size, (0, 0, 0, 255))
    front = Image.alpha_composite(backdrop, front).convert("RGB").resize((FACE, FACE), Image.Resampling.LANCZOS)
    tex_y = np.linspace(top, bottom, FACE)
    bands = row_colours(
        rgba, np.interp(tex_y, rows, centre), np.interp(tex_y, rows, half), tex_y
    ).clip(0, 255).astype(np.uint8)
    atlas = Image.new("RGB", (2 * FACE, FACE))
    atlas.paste(front, (0, 0))
    atlas.paste(Image.fromarray(np.repeat(bands[:, None, :], FACE, axis=1)), (FACE, 0))

    w, d = width / height, DEPTH_RATIO * width / height
    x0, x1, z0, z1 = -w / 2, w / 2, -d / 2, d / 2
    front_uv = [(0.0, 0.0), (0.5, 0.0), (0.5, 1.0), (0.0, 1.0)]  # u in [0, 0.5]: photo
    side_uv = [(0.52, 0.0), (0.98, 0.0), (0.98, 1.0), (0.52, 1.0)]  # u in (0.5, 1]: colour bands
    top_uv = [(0.52, 0.995), (0.98, 0.995), (0.98, 0.999), (0.52, 0.999)]
    bottom_uv = [(0.52, 0.001), (0.98, 0.001), (0.98, 0.005), (0.52, 0.005)]
    # Each face: four corners counter-clockwise seen from outside, bottom-left first.
    faces = [
        ([(x0, 0, z1), (x1, 0, z1), (x1, 1, z1), (x0, 1, z1)], front_uv),  # front, facing +z
        ([(x1, 0, z0), (x0, 0, z0), (x0, 1, z0), (x1, 1, z0)], side_uv),  # back
        ([(x0, 0, z0), (x0, 0, z1), (x0, 1, z1), (x0, 1, z0)], side_uv),  # left
        ([(x1, 0, z1), (x1, 0, z0), (x1, 1, z0), (x1, 1, z1)], side_uv),  # right
        ([(x0, 1, z1), (x1, 1, z1), (x1, 1, z0), (x0, 1, z0)], top_uv),  # top
        ([(x0, 0, z0), (x1, 0, z0), (x1, 0, z1), (x0, 0, z1)], bottom_uv),  # bottom
    ]
    vertices = np.array([corner for quad, _ in faces for corner in quad], dtype=np.float64)
    uv = np.array([coord for _, coords in faces for coord in coords], dtype=np.float64)
    triangles = np.array([[4 * i, 4 * i + 1, 4 * i + 2] for i in range(6)] + [[4 * i, 4 * i + 2, 4 * i + 3] for i in range(6)])
    material = trimesh.visual.material.PBRMaterial(  # type: ignore[no-untyped-call]
        baseColorTexture=atlas, metallicFactor=0.0, roughnessFactor=0.7
    )
    trimesh.Trimesh(
        vertices=vertices,
        faces=triangles,
        visual=trimesh.visual.TextureVisuals(uv=uv, material=material),  # type: ignore[no-untyped-call]
        process=False,
    ).export(output, file_type="glb")

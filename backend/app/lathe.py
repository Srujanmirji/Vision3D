"""Round-object mode: turn a photo cut-out of a bottle, can or jar into a textured GLB.

The silhouette gives the radius at every height; the mesh is that profile spun around a
vertical axis. The front of the texture is the photo itself, sampled where each point of the
surface appears from the front, so labels stay sharp. The hidden sides and back blend into the
object's own colour at each height (no mirrored text), since one photo cannot show them.
"""

from pathlib import Path

import numpy as np
import trimesh
from PIL import Image

from .schemas import Failure

SEGMENTS = 128  # points around the circumference
RINGS = 160  # rows from top to bottom
TEXTURE_WIDTH = 2048
TEXTURE_HEIGHT = 1024
MIN_ROWS = 20
PHOTO_ANGLE = np.radians(50)  # photo is used as-is up to this angle from the front
BLEND_ANGLE = np.radians(75)  # ...and fully replaced by the row colour beyond this


def silhouette(alpha: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Rows covered by the object, with their centre and half-width in pixels."""
    mask = alpha > 127
    rows = np.flatnonzero(mask.any(axis=1))
    if len(rows) < MIN_ROWS:
        raise Failure("INVALID_IMAGE", "No clear round object was found in the photo.", 422)
    left = np.array([np.flatnonzero(mask[y])[0] for y in rows], dtype=np.float64)
    right = np.array([np.flatnonzero(mask[y])[-1] for y in rows], dtype=np.float64)
    return rows.astype(np.float64), (left + right) / 2, (right - left) / 2


def smooth(values: np.ndarray, median_window: int = 7, mean_window: int = 25) -> np.ndarray:
    """Median filter (ignores stray pixels), then a moving average: widths are whole pixels, and
    without it the 1-pixel steps between rows show up as shading bands on the surface."""
    pad = median_window // 2
    padded = np.pad(values, pad, mode="edge")
    filtered = np.median(np.lib.stride_tricks.sliding_window_view(padded, median_window), axis=1)
    window = min(mean_window, len(filtered) // 2 * 2 - 1)
    padded = np.pad(filtered, window // 2, mode="edge")
    return np.convolve(padded, np.ones(window) / window, mode="valid")


def sample(image: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Bilinear colour lookup at fractional pixel positions."""
    h, w = image.shape[:2]
    x = np.clip(x, 0, w - 1.001)
    y = np.clip(y, 0, h - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = (x - x0)[..., None], (y - y0)[..., None]
    top = image[y0, x0] * (1 - fx) + image[y0, x0 + 1] * fx
    bottom = image[y0 + 1, x0] * (1 - fx) + image[y0 + 1, x0 + 1] * fx
    result: np.ndarray = top * (1 - fy) + bottom * fy
    return result


def row_colours(rgba: np.ndarray, centre: np.ndarray, half_width: np.ndarray, rows: np.ndarray) -> np.ndarray:
    """The object's colour at each height: median of the middle half of each row (ignores logos),
    smoothed vertically. Used for surfaces the photo cannot see."""
    offsets = np.linspace(-0.5, 0.5, 33)
    middle = sample(
        rgba[..., :3],
        centre[:, None] + half_width[:, None] * offsets[None, :],
        np.repeat(rows[:, None], len(offsets), axis=1),
    )
    colour = np.median(middle, axis=1)
    kernel = np.ones(15) / 15
    result: np.ndarray = np.stack(
        [np.convolve(np.pad(colour[:, ch], 7, mode="edge"), kernel, mode="valid") for ch in range(3)], axis=1
    )
    return result


def build_round_object(cutout: Path, output: Path) -> None:
    with Image.open(cutout) as source:
        rgba = np.asarray(source.convert("RGBA"), dtype=np.float64)
    rows, centre, radius = silhouette(rgba[..., 3])
    radius = smooth(radius)
    # A straight axis through the row centres: a slightly tilted photo still gives an upright model.
    slope, intercept = np.polyfit(rows, centre, 1)
    top, bottom = rows[0], rows[-1]
    height = bottom - top

    # Texture: column u is the angle around the object, row v the height.
    theta = (np.arange(TEXTURE_WIDTH) + 0.5) / TEXTURE_WIDTH * 2 * np.pi - np.pi  # 0 = facing the camera
    tex_y = top + (np.arange(TEXTURE_HEIGHT) + 0.5) / TEXTURE_HEIGHT * height
    tex_r = np.interp(tex_y, rows, radius)
    tex_c = intercept + slope * tex_y
    yy = np.repeat(tex_y[:, None], TEXTURE_WIDTH, axis=1)
    front = np.abs(theta) < np.pi / 2
    xx = tex_c[:, None] + tex_r[:, None] * np.where(front, np.sin(theta), 0)[None, :]
    photo = sample(rgba[..., :3], xx, yy)

    row_colour = row_colours(rgba, tex_c, tex_r, tex_y)
    weight = np.clip((BLEND_ANGLE - np.abs(theta)) / (BLEND_ANGLE - PHOTO_ANGLE), 0, 1)[None, :, None]
    blended = weight * photo + (1 - weight) * row_colour[:, None, :]
    texture = Image.fromarray(blended.clip(0, 255).astype(np.uint8))

    # Mesh: rings of the profile, spun around the vertical axis; units are "object heights".
    ring_y = np.linspace(top, bottom, RINGS)
    ring_r = np.maximum(np.interp(ring_y, rows, radius), height * 1e-3) / height
    angles = np.linspace(-np.pi, np.pi, SEGMENTS + 1)  # last column duplicates the first for the UV seam
    level = 1 - (ring_y - top) / height
    vertices = np.stack(
        [
            ring_r[:, None] * np.sin(angles)[None, :],
            np.repeat(level[:, None], SEGMENTS + 1, axis=1),
            ring_r[:, None] * np.cos(angles)[None, :],
        ],
        axis=-1,
    ).reshape(-1, 3)
    uv = np.stack(
        np.meshgrid((angles + np.pi) / (2 * np.pi), level), axis=-1
    ).reshape(-1, 2)

    cols = SEGMENTS + 1
    k, j = np.meshgrid(np.arange(RINGS - 1), np.arange(SEGMENTS), indexing="ij")
    a, b = k * cols + j, k * cols + j + 1
    c, d = (k + 1) * cols + j, (k + 1) * cols + j + 1
    side = np.concatenate([np.stack([a, c, b], -1), np.stack([b, c, d], -1)]).reshape(-1, 3)

    # Flat caps: a centre point joined to the top and bottom rings, coloured from the nearest texture row.
    top_centre, bottom_centre = len(vertices), len(vertices) + 1
    vertices = np.vstack([vertices, [[0, 1, 0], [0, 0, 0]]])
    uv = np.vstack([uv, [[0.5, 1.0], [0.5, 0.0]]])
    ring = np.arange(SEGMENTS)
    last = (RINGS - 1) * cols
    caps = np.concatenate(
        [
            np.stack([np.full(SEGMENTS, top_centre), ring + 1, ring], -1),
            np.stack([np.full(SEGMENTS, bottom_centre), last + ring, last + ring + 1], -1),
        ]
    )
    faces = np.concatenate([side, caps])

    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
    # Make the side face outward whichever way the rings were wound.
    sample_face = side[len(side) // 2]
    centroid = vertices[sample_face].mean(axis=0)
    if np.dot(mesh.face_normals[len(side) // 2], [centroid[0], 0, centroid[2]]) < 0:
        faces = faces[:, ::-1]
    material = trimesh.visual.material.PBRMaterial(  # type: ignore[no-untyped-call]
        baseColorTexture=texture, metallicFactor=0.0, roughnessFactor=0.6
    )
    trimesh.Trimesh(
        vertices=vertices,
        faces=faces,
        visual=trimesh.visual.TextureVisuals(uv=uv, material=material),  # type: ignore[no-untyped-call]
        process=False,
    ).export(output, file_type="glb")

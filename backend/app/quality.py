"""Opt-in reconstruction diagnostics for already-generated GLBs."""

import argparse
import json
from pathlib import Path
from typing import TypedDict

import numpy as np
import trimesh
from PIL import Image

from .mesh import document, load_mesh


class GeometryMetrics(TypedDict):
    vertices: int
    triangles: int
    degenerate_triangles: int
    bounds_extent: list[float]


class Estimates(TypedDict):
    smallest_to_largest_pca_extent: float
    dominant_normal_area_fraction: float
    front_silhouette_iou: float | None
    flags: list[str]


class QualityReport(TypedDict):
    measured_geometry: GeometryMetrics
    estimates: Estimates


def silhouette(path: Path) -> Image.Image:
    with Image.open(path) as image:
        if "A" in image.getbands():
            return image.getchannel("A")
        if image.mode in ("1", "L"):
            return image.convert("L")
        raise ValueError("Use an alpha PNG or grayscale mask for the silhouette comparison")


def normalized_mask(mask: Image.Image, size: int = 256) -> np.ndarray[tuple[int, int], np.dtype[np.bool_]]:
    mask = mask.point(lambda value: 255 if value >= 128 else 0)
    bounds = mask.getbbox()
    if bounds is None:
        raise ValueError("Silhouette is empty")
    crop = mask.crop(bounds)
    scale = size / max(crop.size)
    width, height = (max(1, round(edge * scale)) for edge in crop.size)
    fitted = Image.new("L", (size, size))
    fitted.paste(crop.resize((width, height), Image.Resampling.NEAREST), ((size - width) // 2, (size - height) // 2))
    return np.asarray(fitted, dtype=np.bool_)


def quality_report(
    mesh: trimesh.Trimesh, input_mask: Image.Image | None = None, front_render: Image.Image | None = None
) -> QualityReport:
    if (input_mask is None) != (front_render is None):
        raise ValueError("Supply both the input mask and the front render")
    vertices = mesh.vertices[mesh.faces.ravel()]
    extents = np.ptp(vertices, axis=0)
    max_extent = float(max(extents))
    area = mesh.area_faces
    usable = area > max_extent**2 * 1e-12
    if not np.any(usable):
        raise ValueError("Mesh has no usable triangles")

    # PCA thickness handles a billboard turned diagonally relative to world axes.
    positions = np.unique(vertices, axis=0)
    _, basis = np.linalg.eigh(np.cov(positions.T))
    spans = np.ptp((positions - positions.mean(axis=0)) @ basis, axis=0)
    thickness = float(min(spans) / max(spans))
    normals = mesh.face_normals[usable]
    weights = area[usable]
    _, axes = np.linalg.eigh(normals.T @ (normals * weights[:, None]))
    aligned = np.abs(normals @ axes[:, -1]) >= np.cos(np.deg2rad(15))
    flat_area = float(weights[aligned].sum() / weights.sum())

    overlap = None
    flags: list[str] = []
    degenerate_count = int(np.count_nonzero(~usable))
    if thickness < 0.025:
        flags.append("near_planar_geometry")
    elif thickness < 0.12:
        flags.append("limited_thickness")
    if flat_area > 0.75:
        flags.append("dominant_parallel_surface")
    if degenerate_count:
        flags.append("degenerate_or_tiny_triangles")
    if input_mask is not None and front_render is not None:
        expected, actual = normalized_mask(input_mask), normalized_mask(front_render)
        overlap = float(np.count_nonzero(expected & actual) / np.count_nonzero(expected | actual))
        if overlap < 0.65:
            flags.append("low_front_silhouette_overlap")

    return {
        "measured_geometry": {
            "vertices": len(mesh.vertices),
            "triangles": len(mesh.faces),
            "degenerate_triangles": degenerate_count,
            "bounds_extent": extents.tolist(),
        },
        "estimates": {
            "smallest_to_largest_pca_extent": thickness,
            "dominant_normal_area_fraction": flat_area,
            "front_silhouette_iou": overlap,
            "flags": flags,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("glb", type=Path)
    parser.add_argument("--input-mask", type=Path)
    parser.add_argument("--front-render", type=Path)
    args = parser.parse_args()
    if (args.input_mask is None) != (args.front_render is None):
        parser.error("--input-mask and --front-render must be supplied together")
    document(args.glb, 10_000_000)
    report = quality_report(
        load_mesh(args.glb),
        silhouette(args.input_mask) if args.input_mask else None,
        silhouette(args.front_render) if args.front_render else None,
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

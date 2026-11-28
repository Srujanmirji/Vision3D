import numpy as np
import pytest
import trimesh
from PIL import Image, ImageDraw

from app.quality import quality_report


def test_diagonally_rotated_billboard_vs_volumetric_box() -> None:
    thin = trimesh.creation.box(extents=(2, 1, 0.003))
    angle = 0.75
    c, s = float(np.cos(angle)), float(np.sin(angle))
    thin.apply_transform(np.array([[c, 0, s, 0], [0, 1, 0, 0], [-s, 0, c, 0], [0, 0, 0, 1]]))
    report = quality_report(thin)
    assert report["measured_geometry"]["triangles"] == 12
    assert "near_planar_geometry" in report["estimates"]["flags"]
    assert "dominant_parallel_surface" in report["estimates"]["flags"]
    assert quality_report(trimesh.creation.box())["estimates"]["flags"] == []


def test_silhouette_overlap_and_degenerate_triangle_are_separate() -> None:
    mask = Image.new("L", (40, 40))
    ImageDraw.Draw(mask).ellipse((2, 3, 32, 33), fill=255)
    other = Image.new("L", (40, 40))
    ImageDraw.Draw(other).rectangle((3, 2, 9, 37), fill=255)
    cube = trimesh.creation.box()
    mesh = trimesh.Trimesh(cube.vertices, np.vstack([cube.faces, [0, 0, 1]]), process=False)
    assert quality_report(mesh, mask, mask)["estimates"]["front_silhouette_iou"] == 1
    report = quality_report(mesh, mask, other)
    assert report["measured_geometry"]["degenerate_triangles"] == 1
    assert "low_front_silhouette_overlap" in report["estimates"]["flags"]
    with pytest.raises(ValueError, match="empty"):
        quality_report(mesh, mask, Image.new("L", (40, 40)))

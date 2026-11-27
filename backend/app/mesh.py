import json
import struct
from io import BytesIO
from pathlib import Path
from typing import Any

import fast_simplification  # type: ignore[import-untyped]
import numpy as np
import trimesh
import xatlas  # type: ignore[import-not-found]
from PIL import Image

from .schemas import Appearance, Failure, MeshInfo

MAX_TRIANGLES = 100_000


def document(path: Path, limit: int) -> dict[str, Any]:
    try:
        size = path.stat().st_size
        with path.open("rb") as file:
            magic, version, length, count, tag = struct.unpack("<4sIII4s", file.read(20))
            if (
                (magic, version, length, tag) != (b"glTF", 2, size, b"JSON")
                or not 0 < count <= size - 28
                or count % 4
                or size > limit
            ):
                raise ValueError
            data = json.loads(file.read(count))
            binary_size, binary_tag = struct.unpack("<I4s", file.read(8))
        if binary_tag != b"BIN\0" or binary_size % 4 or 28 + count + binary_size != size:
            raise ValueError
        if (
            data["asset"]["version"] != "2.0"
            or data.get("extensionsRequired")
            or len(data.get("nodes", [])) > 128
            or len(data.get("meshes", [])) > 32
        ):
            raise ValueError
        buffers = data["buffers"]
        if len(buffers) != 1 or not 0 <= binary_size - buffers[0]["byteLength"] <= 3:
            raise ValueError
        if any("uri" in item for group in ("buffers", "images") for item in data.get(group, [])):
            raise ValueError
        views = data.get("bufferViews", [])
        for view in views:
            start = view.get("byteOffset", 0)
            if view["buffer"] != 0 or not 0 <= start <= start + view["byteLength"] <= binary_size:
                raise ValueError
        accessors = data["accessors"]
        if sum(item["count"] for item in accessors) > 5_000_000:
            raise ValueError
        if any(not 0 < item["count"] <= 2_000_000 or "sparse" in item for item in accessors):
            raise ValueError
        if any(p.get("mode", 4) != 4 for mesh in data["meshes"] for p in mesh["primitives"]):
            raise ValueError
        result: dict[str, Any] = data
        return result
    except (IndexError, KeyError, TypeError, ValueError, OSError, struct.error) as exc:
        raise Failure("INVALID_MODEL", "Provider output is not a supported embedded GLB.") from exc


def load_mesh(path: Path) -> trimesh.Trimesh:
    try:
        scene = trimesh.load_scene(path, file_type="glb", process=False, skip_materials=True)
        mesh: trimesh.Trimesh = scene.to_mesh()
        if (
            not len(mesh.faces)
            or mesh.faces.min() < 0
            or mesh.faces.max() >= len(mesh.vertices)
            or not np.isfinite(mesh.vertices).all()
            or not (np.ptp(mesh.vertices[mesh.faces.ravel()], axis=0) > 0).all()
            or not (mesh.area_faces > 1e-12).any()
        ):
            raise ValueError
        return mesh
    except (IndexError, KeyError, ValueError, TypeError, OverflowError, RuntimeError) as exc:
        raise Failure("INVALID_MODEL", "Provider output does not contain valid triangles.") from exc


def verify_embedded_textures(path: Path, data: dict[str, Any]) -> None:
    """Validate the bytes behind every referenced base-color map."""
    checked: set[int] = set()
    try:
        with path.open("rb") as file:
            file.seek(12)
            binary_offset = 28 + int.from_bytes(file.read(4), "little")
            for material in data.get("materials", []):
                texture = material.get("pbrMetallicRoughness", {}).get("baseColorTexture")
                if texture is None:
                    continue
                index = texture["index"]
                if not 0 <= index < len(data["textures"]):
                    raise ValueError
                source = data["textures"][index]["source"]
                if source in checked:
                    continue
                if not 0 <= source < len(data["images"]):
                    raise ValueError
                description = data["images"][source]
                view_index = description["bufferView"]
                if not 0 <= view_index < len(data["bufferViews"]):
                    raise ValueError
                view = data["bufferViews"][view_index]
                file.seek(binary_offset + view.get("byteOffset", 0))
                with Image.open(BytesIO(file.read(view["byteLength"]))) as image:
                    expected = {"PNG": "image/png", "JPEG": "image/jpeg"}.get(image.format or "")
                    if (
                        expected is None
                        or description.get("mimeType") != expected
                        or min(image.size) < 1
                        or max(image.size) > 4096
                    ):
                        raise ValueError
                    image.verify()
                checked.add(source)
        if not checked:
            raise ValueError
    except (IndexError, KeyError, ValueError, TypeError, OSError, Image.DecompressionBombError) as exc:
        raise Failure("INVALID_MODEL", "The embedded base-color texture is invalid.") from exc


def _texture(
    uvs: np.ndarray[Any, Any],
    faces: np.ndarray[Any, Any],
    colors: np.ndarray[Any, Any],
    size: int = 1024,
) -> Image.Image:
    points = uvs * (size - 1)
    points[:, 1] = (size - 1) - points[:, 1]
    pixels = np.zeros((size, size, 3), dtype=np.uint8)
    mask = np.zeros((size, size), dtype=bool)
    triangles = points[faces]
    starts = np.floor(triangles.min(axis=1)).astype(int).clip(0, size)
    ends = (np.ceil(triangles.max(axis=1)).astype(int) + 1).clip(0, size)
    edges = triangles[:, 1:] - triangles[:, :1]
    determinants = edges[:, 0, 0] * edges[:, 1, 1] - edges[:, 0, 1] * edges[:, 1, 0]
    samples = np.arange(size)
    face_colors = colors[faces].astype(np.float32)
    for index in range(len(faces)):
        a = triangles[index, 0]
        x0, y0 = starts[index]
        x1, y1 = ends[index]
        ab, ac = edges[index]
        det = determinants[index]
        xx, yy = samples[None, x0:x1], samples[y0:y1, None]
        if abs(det) < 1e-8:
            continue
        u = ((xx - a[0]) * ac[1] - (yy - a[1]) * ac[0]) / det
        v = ((yy - a[1]) * ab[0] - (xx - a[0]) * ab[1]) / det
        inside = (u >= -1e-5) & (v >= -1e-5) & (u + v <= 1.00001)
        if not inside.any():
            continue
        ca, cb, cc = face_colors[index]
        rgb = ca + u[inside, None] * (cb - ca) + v[inside, None] * (cc - ca)
        pixels[y0:y1, x0:x1][inside] = np.rint(rgb).clip(0, 255)
        mask[y0:y1, x0:x1] |= inside
    if not mask.any():
        raise Failure("INVALID_MODEL", "The vertex colors could not be baked into a texture.")
    # Extend the chart borders by two texels for linear sampling.
    for _ in range(2):
        known = mask.copy()
        for dest, src in (
            (np.s_[1:, :], np.s_[:-1, :]),
            (np.s_[:-1, :], np.s_[1:, :]),
            (np.s_[:, 1:], np.s_[:, :-1]),
            (np.s_[:, :-1], np.s_[:, 1:]),
        ):
            fill = ~mask[dest] & known[src]
            pixels[dest][fill] = pixels[src][fill]
            mask[dest][fill] = True
    return Image.fromarray(pixels)


def simplify_colored(mesh: trimesh.Trimesh, visual: trimesh.visual.ColorVisuals) -> trimesh.Trimesh:
    points = np.ascontiguousarray(mesh.vertices, dtype=np.float32)
    faces = np.ascontiguousarray(mesh.faces, dtype=np.int32)
    _, _, collapses = fast_simplification.simplify(
        points,
        faces,
        target_count=int(MAX_TRIANGLES * 0.99),
        return_collapses=True,
    )
    vertices, reduced, mapping = fast_simplification.replay_simplification(points, faces, collapses)
    colors = visual.vertex_colors
    valid = (mapping >= 0) & (mapping < len(vertices))
    indices = mapping[valid]
    counts = np.bincount(indices, minlength=len(vertices))
    totals = np.stack(
        [np.bincount(indices, weights=channel[valid], minlength=len(vertices)) for channel in colors.T],
        axis=1,
    )
    reduced_colors = np.rint(totals / np.maximum(counts[:, None], 1)).astype(np.uint8)
    result = trimesh.Trimesh(vertices=vertices, faces=reduced, vertex_colors=reduced_colors, process=False)
    result.update_faces((result.area_faces > 1e-12) & result.unique_faces())
    result.remove_unreferenced_vertices()
    return result


def finish_mesh(source: Path, output: Path, limit: int, allow_shape: bool) -> MeshInfo:
    data = document(source, limit)
    mesh = load_mesh(source)
    primitives = [p for item in data["meshes"] for p in item["primitives"]]
    materials = data.get("materials", [])
    native = all(
        "TEXCOORD_0" in p["attributes"]
        and "material" in p
        and "baseColorTexture" in materials[p["material"]].get("pbrMetallicRoughness", {})
        for p in primitives
    )
    if native:
        output.write_bytes(source.read_bytes())
        appearance: Appearance = "native_texture"
    else:
        mesh.update_faces((mesh.area_faces > 1e-12) & mesh.unique_faces())
        mesh.remove_unreferenced_vertices()
        colored = all("COLOR_0" in p["attributes"] for p in primitives)
        if colored:
            visual = mesh.visual
            if isinstance(visual, trimesh.visual.ColorVisuals) and len(mesh.faces) > MAX_TRIANGLES:
                mesh = simplify_colored(mesh, visual)
                visual = mesh.visual
            if (
                not isinstance(visual, trimesh.visual.ColorVisuals)
                or not 0 < len(mesh.faces) <= MAX_TRIANGLES
            ):
                raise Failure("INVALID_MODEL", "Vertex colors or geometry could not be prepared.")
            remap, indices, uvs = xatlas.parametrize(
                np.ascontiguousarray(mesh.vertices, dtype=np.float32),
                np.ascontiguousarray(mesh.faces, dtype=np.uint32),
            )
            texture = _texture(uvs, indices, visual.vertex_colors[remap, :3])
            material = trimesh.visual.material.PBRMaterial(  # type: ignore[no-untyped-call]
                baseColorTexture=texture,
                metallicFactor=0.0,
                roughnessFactor=1.0,
            )
            mesh = trimesh.Trimesh(
                vertices=mesh.vertices[remap],
                faces=indices,
                visual=trimesh.visual.TextureVisuals(uv=uvs, material=material),  # type: ignore[no-untyped-call]
                process=False,
            )
            appearance = "baked_texture"
        elif allow_shape:
            mesh.merge_vertices()
            if len(mesh.faces) > MAX_TRIANGLES:
                mesh = mesh.simplify_quadric_decimation(face_count=MAX_TRIANGLES - 100)
            mesh.update_faces((mesh.area_faces > 1e-12) & mesh.unique_faces())
            mesh.remove_unreferenced_vertices()
            appearance = "shape_only"
        else:
            raise Failure(
                "INVALID_MODEL", "Provider output has neither an embedded texture nor vertex colors."
            )
        mesh.export(output, file_type="glb")
    final = document(output, limit)
    mesh = load_mesh(output)
    if len(mesh.faces) > MAX_TRIANGLES or not (mesh.area_faces > 1e-12).all():
        raise Failure("INVALID_MODEL", "Model exceeds the triangle budget or contains degenerate faces.")
    if appearance != "shape_only":
        verify_embedded_textures(output, final)
    extent = mesh.extents.tolist()
    return MeshInfo(
        vertices=len(mesh.vertices),
        triangles=len(mesh.faces),
        bounds_extent=(extent[0], extent[1], extent[2]),
        appearance=appearance,
        byte_size=output.stat().st_size,
    )

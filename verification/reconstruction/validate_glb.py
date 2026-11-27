"""Inspect a downloaded GLB and report independently parsed mesh geometry."""

import argparse
import json
import struct
from pathlib import Path
from typing import Any

import numpy as np
import trimesh


def inspect_glb(path: Path) -> dict[str, Any]:
    raw = path.read_bytes()
    if len(raw) < 20:
        raise ValueError("Truncated GLB")
    magic, version, length, json_length, kind = struct.unpack_from("<4sIII4s", raw)
    if (magic, version, length, kind) != (b"glTF", 2, len(raw), b"JSON"):
        raise ValueError("Invalid GLB v2 header")
    if json_length % 4 or json_length > length - 20:
        raise ValueError("Invalid GLB JSON chunk length")
    document = json.loads(raw[20 : 20 + json_length])
    scene = trimesh.load_scene(path, process=False, skip_materials=True)
    mesh = scene.to_mesh()
    if not len(mesh.faces) or not np.isfinite(mesh.vertices).all():
        raise ValueError("Expected triangles and finite vertices")
    if mesh.faces.min() < 0 or mesh.faces.max() >= len(mesh.vertices):
        raise ValueError("Triangle indices are outside the vertex buffer")
    nondegenerate = int(np.count_nonzero(mesh.area_faces > 0))
    extents = np.ptp(mesh.vertices[mesh.faces.flatten()], axis=0)
    if not nondegenerate or not (extents > 0).all():
        raise ValueError(
            "Expected nondegenerate triangles and three-dimensional bounds"
        )
    return {
        "bytes": length,
        "vertices": len(mesh.vertices),
        "triangles": len(mesh.faces),
        "nondegenerate_triangles": nondegenerate,
        "bounds_extent": extents.tolist(),
        "base_color_textures": sum(
            "baseColorTexture" in material.get("pbrMetallicRoughness", {})
            for material in document.get("materials", [])
        ),
        "color_vertex_primitives": sum(
            "COLOR_0" in primitive.get("attributes", {})
            for gltf_mesh in document.get("meshes", [])
            for primitive in gltf_mesh.get("primitives", [])
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mesh", type=Path)
    args = parser.parse_args()
    print(json.dumps(inspect_glb(args.mesh), indent=2))


if __name__ == "__main__":
    main()

"""Run anonymous image-to-mesh smoke tests against inspected Gradio Space APIs."""

import argparse
import hashlib
import json
import os
import shutil
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Any

os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"
from gradio_client import Client, handle_file  # type: ignore[import-untyped]

ROOT = Path(__file__).resolve().parent
SPACES = {
    "sf3d": "stabilityai/stable-fast-3d",
    "triposr": "stabilityai/TripoSR",
    "triposr-community": "AleenDG/3DGenTripoSR",
    "instantmesh": "TencentARC/InstantMesh",
    "hunyuan": "tencent/Hunyuan3D-2",
    "hunyuan-shape": "tencent/Hunyuan3D-2",
    "trellis": "trellis-community/TRELLIS",
    "trellis2": "microsoft/TRELLIS.2",
    "triposg": "VAST-AI/TripoSG",
}


def probe(provider: str, image: Path) -> bool:
    run = ROOT / "runs" / f"{provider}-{image.stem}-{time.time_ns()}"
    run.mkdir(parents=True)
    record: dict[str, Any] = {
        "space": SPACES[provider],
        "input": image.name,
        "input_sha256": hashlib.sha256(image.read_bytes()).hexdigest(),
        "started_at": datetime.now().astimezone().isoformat(),
        "steps": [],
        "meshes": [],
    }
    started = time.monotonic()
    client: Client | None = None

    def call(endpoint: str, *args: Any, **kwargs: Any) -> Any:
        if endpoint not in schema["named_endpoints"]:
            raise ValueError(f"Endpoint missing from live schema: {endpoint}")
        begun = time.monotonic()
        step: dict[str, Any] = {"endpoint": endpoint}
        record["steps"].append(step)
        if client is None:
            raise RuntimeError("Gradio client is unavailable")
        job = client.submit(*args, api_name=endpoint, **kwargs)
        try:
            return job.result(timeout=180)
        except TimeoutError:
            job.cancel()
            raise
        finally:
            step["seconds"] = round(time.monotonic() - begun, 2)

    try:
        client = Client(
            SPACES[provider],
            analytics_enabled=False,
            verbose=False,
            download_files=run / "downloads",
        )
        schema = client.view_api(return_format="dict", print_info=False)
        photo = handle_file(str(image))
        if provider == "instantmesh":
            processed = call("/preprocess", photo)
            call("/generate_mvs", handle_file(processed))
            result = call("/make3d")
        elif provider == "sf3d":
            call("/requires_bg_remove", photo)
            result = call("/run_button", photo)
            if not mesh_paths(result):
                result = call("/run_button", photo)
        elif provider in {"triposr", "triposr-community"}:
            processed = call("/preprocess", photo, True, 0.85)
            result = call("/generate", handle_file(processed))
        elif provider == "hunyuan":
            result = call("/generation_all", image=photo, randomize_seed=False)
        elif provider == "hunyuan-shape":
            result = call("/shape_generation", image=photo, randomize_seed=False)
        elif provider == "trellis":
            call("/start_session")
            processed = call("/preprocess_image", photo)
            result = call("/generate_and_extract_glb", handle_file(processed))
        elif provider == "trellis2":
            call("/start_session")
            processed = call("/preprocess_image", photo)
            call("/image_to_3d", handle_file(processed))
            result = call("/extract_glb")
        else:
            call("/start_session")
            processed = call("/run_segmentation", photo)
            result = call("/image_to_3d", handle_file(processed))
            for path in mesh_paths(result):
                try:
                    textured = call(
                        "/run_texture", handle_file(processed), handle_file(str(path))
                    )
                    result = (result, textured)
                except Exception as exc:  # noqa: BLE001
                    record["texture_error"] = f"{type(exc).__name__}: {exc}"
        for index, path in enumerate(dict.fromkeys(mesh_paths(result))):
            target = run / f"mesh-{index}{path.suffix.lower()}"
            shutil.copyfile(path, target)
            record["meshes"].append(
                {
                    "file": target.name,
                    "bytes": target.stat().st_size,
                    "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
                }
            )
        if not record["meshes"]:
            raise ValueError(f"No downloadable mesh returned: {str(result)[:700]}")
    except Exception as exc:  # noqa: BLE001
        record["error"] = f"{type(exc).__name__}: {exc}"
    finally:
        record["seconds"] = round(time.monotonic() - started, 2)
        (run / "result.json").write_text(json.dumps(record, indent=2) + "\n")
        print(
            provider,
            image.stem,
            record["seconds"],
            record.get("error", record["meshes"]),
            flush=True,
        )
        if client is not None:
            client.close()
    return bool(record["meshes"])


def mesh_paths(value: Any) -> list[Path]:
    if isinstance(value, str):
        path = Path(value)
        if (
            path.suffix.lower() in {".glb", ".gltf", ".obj", ".ply", ".stl", ".usdz"}
            and path.is_file()
        ):
            return [path]
    if isinstance(value, dict):
        return mesh_paths(list(value.values()))
    if isinstance(value, (tuple, list)):
        return [path for item in value for path in mesh_paths(item)]
    return []


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("case", nargs="+", help="provider:image.jpg")
    args = parser.parse_args()
    cases = []
    for case in args.case:
        provider, _, filename = case.partition(":")
        image = Path(filename)
        if provider not in SPACES or not image.is_file():
            parser.error(f"Invalid provider or image: {case}")
        cases.append((provider, image.resolve()))
    with ThreadPoolExecutor(max_workers=4) as workers:
        results = list(workers.map(lambda case: probe(*case), cases))
    raise SystemExit(0 if all(results) else 1)


if __name__ == "__main__":
    main()

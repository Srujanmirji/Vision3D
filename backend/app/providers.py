import json
import os
import signal
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, cast
from urllib.parse import quote, urlsplit

import httpx

from .mesh import finish_mesh
from .schemas import Failure

Kind = Literal["triposr", "hunyuan"]
COMMUNITY = "AleenDG/3DGenTripoSR"
HUNYUAN = "tencent/Hunyuan3D-2"


@dataclass(frozen=True)
class Provider:
    id: str
    label: str
    space: str
    kind: Kind
    verified: bool
    use_token: bool = False


def send(**message: Any) -> None:
    print(json.dumps(message), flush=True)


def file_data(result: Any, extension: str | None = None) -> dict[str, Any]:
    values = result if isinstance(result, (tuple, list)) else [result]
    for item in values:
        if (
            isinstance(item, dict)
            and isinstance(item.get("path"), str)
            and (extension is None or Path(item["path"]).suffix.lower() == extension)
        ):
            return item
    raise Failure("INVALID_MODEL", "The provider returned no downloadable asset.")


def download(client: Any, data: dict[str, Any], output: Path, limit: int) -> None:
    url = data.get("url") or f"{client.src_prefixed}file={quote(data['path'], safe='/')}"
    destination, upstream = urlsplit(url), urlsplit(client.src)
    if (
        destination.scheme != "https"
        or destination.netloc != upstream.netloc
        or not destination.path.startswith(("/file=", "/gradio_api/file="))
    ):
        raise Failure("INVALID_MODEL", "The provider returned an unexpected asset URL.")
    with httpx.stream("GET", url, headers=client.headers, timeout=20, follow_redirects=False) as response:
        response.raise_for_status()
        size = 0
        with output.open("wb") as file:
            for chunk in response.iter_bytes():
                size += len(chunk)
                if size > limit:
                    raise Failure("INVALID_MODEL", "The provider asset exceeds the file limit.")
                file.write(chunk)


def invoke(kind: Kind, space: str, image: Path, folder: Path, remove: bool, limit: int) -> None:
    # Gradio imports and credentials are isolated to this short-lived worker.
    os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"
    from gradio_client import Client, handle_file  # type: ignore[import-untyped]

    send(stage="contacting_provider")
    client = Client(
        space,
        token=os.getenv("HF_TOKEN"),
        verbose=False,
        analytics_enabled=False,
        download_files=False,
    )
    try:
        schema = client.view_api(return_format="dict", print_info=False)["named_endpoints"]

        def call(endpoint: str, *args: Any, **kwargs: Any) -> Any:
            if endpoint not in schema:
                raise Failure("PROVIDER_UNAVAILABLE", "The provider API contract changed.", 503)
            job = client.submit(*args, api_name=endpoint, **kwargs)

            def stop(_signum: int, _frame: Any) -> None:
                try:
                    job.cancel()
                finally:
                    raise SystemExit(143)

            previous = signal.signal(signal.SIGTERM, stop)
            try:
                last = None
                while not job.done():
                    remote = job.status().code.name
                    stage = {
                        "IN_QUEUE": "provider_queued",
                        "PROCESSING": "provider_running",
                        "ITERATING": "provider_running",
                    }.get(remote)
                    if stage and stage != last:
                        send(stage=stage)
                        last = stage
                    time.sleep(0.2)
                return job.result()
            finally:
                signal.signal(signal.SIGTERM, previous)

        if kind == "triposr":
            if not {"/preprocess", "/generate"} <= schema.keys():
                raise Failure("PROVIDER_UNAVAILABLE", "The TripoSR API contract changed.", 503)
            send(stage="provider_preprocessing")
            prepared = call("/preprocess", handle_file(str(image)), remove, 0.85)
            path = folder / "foreground.png"
            download(client, file_data(prepared), path, limit)
            send(stage="provider_generation")
            result = call("/generate", handle_file(str(path)))
        else:
            send(stage="provider_generation")
            result = call(
                "/shape_generation",
                image=handle_file(str(image)),
                check_box_rembg=remove,
                randomize_seed=False,
            )
        send(stage="downloading")
        raw = folder / "raw.glb"
        download(client, file_data(result, ".glb"), raw, limit)
    finally:
        client.close()
    send(stage="validating")
    info = finish_mesh(raw, folder / "model.glb", limit, allow_shape=kind == "hunyuan")
    send(info=info.model_dump())


def main() -> None:
    kind, space, filename, folder, remove, limit = sys.argv[1:]
    try:
        if kind not in ("triposr", "hunyuan"):
            raise ValueError("Unknown provider kind")
        invoke(cast(Kind, kind), space, Path(filename), Path(folder), remove == "1", int(limit))
    except Failure as exc:
        send(error=exc.error.code)
        sys.exit(1)
    except Exception as exc:  # noqa: BLE001 - isolate upstream errors and credentials
        message = str(exc).lower()
        status = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else None
        if "quota" in message or status == 429:
            code = "QUOTA_EXCEEDED"
        elif isinstance(exc, (httpx.TimeoutException, TimeoutError)):
            code = "TIMEOUT"
        elif isinstance(exc, httpx.TransportError) or status in {502, 503, 504}:
            code = "TRANSIENT_PROVIDER_ERROR"
        else:
            code = "PROVIDER_UNAVAILABLE"
        send(error=code, diagnostic=type(exc).__name__)
        sys.exit(1)


if __name__ == "__main__":
    main()

import asyncio
import json
import logging
import os
import shutil
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Protocol

from .config import Settings
from .providers import Provider
from .schemas import Failure, MeshInfo
from .storage import Storage

logger = logging.getLogger("uvicorn.error")
ERRORS = {
    "PROVIDER_UNAVAILABLE": "The generation provider is unavailable.",
    "QUOTA_EXCEEDED": "The generation provider has no quota available.",
    "QUEUE_TIMEOUT": "The job waited too long for a worker. Please try again.",
    "TIMEOUT": "Generation exceeded its time limit.",
    "INVALID_MODEL": "The provider output could not be validated and processed.",
    "CANCELLED": "Generation was cancelled.",
    "INTERRUPTED": "The backend shut down before generation finished.",
    "UNKNOWN_ERROR": "Generation failed because of an internal error.",
}


def event(name: str, **fields: str) -> None:
    logger.info(json.dumps({"event": name, **fields}))


class Runner(Protocol):
    async def __call__(
        self,
        provider: Provider,
        folder: Path,
        remove: bool,
        config: Settings,
        stage: Callable[[str], None],
    ) -> MeshInfo: ...


def stderr_category(tail: bytes) -> str:
    # Provider output can contain secrets or signed URLs. Only log fixed classifications.
    for marker, label in (
        (b"Traceback", "traceback"),
        (b"Warning", "warning"),
        (b"Error", "error"),
    ):
        if marker in tail:
            return label
    return "unclassified" if tail else "empty"


async def stderr_tail(stream: asyncio.StreamReader) -> bytes:
    tail = b""
    while chunk := await stream.read(4096):
        tail = (tail + chunk)[-4096:]
    return tail


async def subprocess_runner(
    provider: Provider,
    folder: Path,
    remove: bool,
    config: Settings,
    stage: Callable[[str], None],
) -> MeshInfo:
    env = dict(os.environ)
    env.pop("HF_TOKEN", None)
    if provider.use_token and config.hf_token:
        env["HF_TOKEN"] = config.hf_token
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "app.providers",
        provider.kind,
        provider.space,
        str(folder.parent / "input.png"),
        str(folder),
        str(int(remove)),
        str(config.max_model),
        cwd=Path(__file__).resolve().parents[1],
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    assert process.stderr is not None
    diagnostics = asyncio.create_task(stderr_tail(process.stderr))
    try:
        assert process.stdout is not None
        info = None
        error = "PROVIDER_UNAVAILABLE"
        async for line in process.stdout:
            try:
                message = json.loads(line)
            except ValueError:
                continue
            if "stage" in message:
                stage(str(message["stage"]))
            elif "info" in message:
                info = MeshInfo.model_validate(message["info"])
            elif "error" in message:
                error = message["error"]
                diagnostic = message.get("diagnostic")
                if isinstance(diagnostic, str) and diagnostic in {
                    "AppError",
                    "HTTPStatusError",
                    "ReadTimeout",
                    "ConnectTimeout",
                    "ConnectError",
                    "RuntimeError",
                    "ValueError",
                    "OSError",
                    "TypeError",
                    "TimeoutError",
                    "RemoteProtocolError",
                }:
                    event("provider_worker_error", provider=provider.id, exception=diagnostic)

        if await process.wait() == 0 and info and (folder / "model.glb").is_file():
            return info
        raise Failure(error, ERRORS.get(error, ERRORS["PROVIDER_UNAVAILABLE"]))
    finally:
        if process.returncode is None:
            try:
                process.terminate()
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(process.wait(), timeout=1)
            except TimeoutError:
                try:
                    process.kill()
                except ProcessLookupError:
                    pass
                await process.wait()

        tail = await diagnostics
        if process.returncode != 0:
            event(
                "provider_worker_exit",
                provider=provider.id,
                exit_code=str(process.returncode),
                stderr_category=stderr_category(tail),
            )


class Jobs:
    def __init__(self, store: Storage, config: Settings, runner: Runner) -> None:
        self.store = store
        self.config = config
        self.runner = runner
        self.gate = asyncio.Semaphore(1)
        self.active: dict[str, asyncio.Task[None]] = {}

    def enqueue(self, key: str, owner: str, providers: tuple[Provider, ...], remove: bool) -> None:
        task = asyncio.create_task(self.run(key, owner, providers, remove))
        self.active[key] = task

        def finished(_: asyncio.Task[None]) -> None:
            self.active.pop(key, None)
            shutil.rmtree(self.store.work / key, ignore_errors=True)

        task.add_done_callback(finished)

    def fail(self, key: str, code: str) -> None:
        stage = "cancelled" if code == "CANCELLED" else "failed"
        if self.store.transition(key, "failed", stage, error={"code": code, "message": ERRORS[code]}):
            event("job_failed", job_id=key, code=code)

    async def run(self, key: str, owner: str, providers: tuple[Provider, ...], remove: bool) -> None:
        try:
            try:
                async with asyncio.timeout(self.config.queue_timeout):
                    await self.gate.acquire()
            except TimeoutError:
                self.fail(key, "QUEUE_TIMEOUT")
                return
            try:
                async with asyncio.timeout(self.config.deadline):
                    await self.execute(key, owner, providers, remove)
            finally:
                self.gate.release()

        except TimeoutError:
            self.fail(key, "TIMEOUT")
        except asyncio.CancelledError:
            self.fail(key, "INTERRUPTED")
            raise
        except Exception as exc:  # noqa: BLE001 - keep external error payloads generic
            event("job_internal_error", job_id=key, exception=type(exc).__name__)
            self.fail(key, "UNKNOWN_ERROR")

    async def execute(self, key: str, owner: str, providers: tuple[Provider, ...], remove: bool) -> None:
        failure = "PROVIDER_UNAVAILABLE"
        for index, provider in enumerate(providers):

            def stage(value: str, provider_id: str = provider.id) -> None:
                self.store.transition(key, "processing", value, provider=provider_id)

            for retry in range(2):
                inside = self.store.work / key / f"{index}-{retry}"
                inside.mkdir()
                stage("contacting_provider")
                try:
                    async with asyncio.timeout(self.config.attempt_timeout):
                        info = await self.runner(provider, inside, remove, self.config, stage)
                    self.store.publish(key, owner, provider.id, info, inside / "model.glb")
                    event("job_succeeded", job_id=key, provider=provider.id)
                    return
                except TimeoutError:
                    failure = "TIMEOUT"
                    break
                except Failure as exc:
                    if exc.error.code != "TRANSIENT_PROVIDER_ERROR":
                        failure = exc.error.code
                        break
                    failure = "PROVIDER_UNAVAILABLE"
                    if retry == 0:
                        stage("retrying")
                        await asyncio.sleep(0.5)
        self.fail(key, failure if failure in ERRORS else "PROVIDER_UNAVAILABLE")

    def cancel(self, key: str) -> None:
        self.fail(key, "CANCELLED")
        if task := self.active.get(key):
            task.cancel()

    async def close(self) -> None:
        active = list(self.active.items())
        for key, task in active:
            if not task.cancelling():
                self.fail(key, "INTERRUPTED")
                task.cancel()
        await asyncio.gather(*(task for _, task in active), return_exceptions=True)

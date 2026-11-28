import asyncio
import contextlib
import json
import logging
import os
import shutil
import signal
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Protocol

from .config import Settings
from .mesh import MAX_TRIANGLES, finish_mesh
from .providers import (
    LOCAL_MESH_RESOLUTION,
    LOCAL_SCRIPTS,
    LOCAL_TEXTURE_RESOLUTION,
    SF3D_SCRIPT,
    Provider,
    local_env,
    sf3d_env,
)
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


async def run_step(args: list[str], env: dict[str, str]) -> None:
    """One short local step (background removal); killed if the job is cancelled or times out."""
    process = await asyncio.create_subprocess_exec(
        *args, env=env, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
    )
    try:
        if await process.wait() != 0:
            raise Failure("PROVIDER_UNAVAILABLE", "Local background removal failed.", 503)
    finally:
        if process.returncode is None:
            process.kill()
            await process.wait()


class WarmModel:
    """One model process (TripoSR or SF3D) that stays loaded between jobs, saving its load time each job.

    Jobs run one at a time (the queue gate), so it handles one request at a time. Only one model is kept
    in memory: asking for the other one replaces it. If a request is cancelled or times out, its state
    is unknown: the process is killed and the next job starts a new one.
    """

    def __init__(self) -> None:
        self.process: asyncio.subprocess.Process | None = None
        self.command: tuple[str, ...] = ()
        self.loop: asyncio.AbstractEventLoop | None = None

    def forget_foreign(self) -> None:
        """A process started by another event loop cannot be awaited here: kill it by PID."""
        if self.process and self.loop is not asyncio.get_running_loop():
            with contextlib.suppress(ProcessLookupError):
                os.kill(self.process.pid, signal.SIGKILL)
            self.process = None

    async def start(self, command: tuple[str, ...], env: dict[str, str]) -> asyncio.subprocess.Process:
        self.forget_foreign()
        if self.process and self.process.returncode is None and self.command == command:
            return self.process
        await self.stop()
        self.process = await asyncio.create_subprocess_exec(
            *command,
            env=env,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        self.command = command
        self.loop = asyncio.get_running_loop()
        assert self.process.stdout is not None
        try:
            ready = await self.process.stdout.readline()
            started = bool(ready) and json.loads(ready).get("ready") is True
        except BaseException:
            # Cancelled or timed out while loading: the unread "ready" line would desync the next job.
            await self.stop()
            raise
        if not started:
            await self.stop()
            raise Failure("PROVIDER_UNAVAILABLE", "The local 3D model could not start.", 503)
        return self.process

    async def reconstruct(self, command: tuple[str, ...], env: dict[str, str], request: dict[str, object]) -> None:
        process = await self.start(command, env)
        assert process.stdin is not None and process.stdout is not None
        answered = False
        try:
            process.stdin.write((json.dumps(request) + "\n").encode())
            await process.stdin.drain()
            line = await process.stdout.readline()
            answered = True
        finally:
            if not answered:
                await self.stop()
        if not line:
            await self.stop()
            raise Failure("PROVIDER_UNAVAILABLE", "The local 3D model stopped unexpectedly.", 503)
        if not json.loads(line).get("ok"):
            raise Failure("PROVIDER_UNAVAILABLE", "The local 3D model failed on this photo.", 503)

    async def stop(self) -> None:
        self.forget_foreign()
        if self.process and self.process.returncode is None:
            self.process.kill()
            await self.process.wait()
        self.process = None


WARM = WarmModel()


async def local_runner(
    provider: Provider,
    folder: Path,
    remove: bool,
    config: Settings,
    stage: Callable[[str], None],
) -> MeshInfo:
    """TripoSR on this machine: background removal per job, reconstruction in the warm process."""
    home = Path(provider.space)
    prepared = folder.parent / "input.png"
    if remove:
        stage("provider_preprocessing")
        python = str(home / "venv" / "bin" / "python")
        cutout = folder / "foreground.png"
        await run_step([python, str(LOCAL_SCRIPTS / "prep.py"), str(prepared), str(cutout)], local_env(home))
        prepared = cutout
    stage("provider_running")
    raw = folder / "raw.glb"
    command = (str(home / "venv" / "bin" / "python"), str(LOCAL_SCRIPTS / "infer.py"), "--serve")
    request = {
        "input": str(prepared), "output": str(raw),
        "resolution": LOCAL_MESH_RESOLUTION, "texture": LOCAL_TEXTURE_RESOLUTION,
        "max_triangles": MAX_TRIANGLES,
    }
    await WARM.reconstruct(command, local_env(home), request)
    stage("validating")
    return await asyncio.to_thread(finish_mesh, raw, folder / "model.glb", config.max_model, False)


async def sf3d_runner(
    provider: Provider,
    folder: Path,
    remove: bool,
    config: Settings,
    stage: Callable[[str], None],
) -> MeshInfo:
    """Stable Fast 3D on this machine; its worker removes the background itself."""
    home = Path(provider.space)
    stage("provider_running")
    raw = folder / "raw.glb"
    command = (str(home / "venv" / "bin" / "python"), str(SF3D_SCRIPT), "--serve")
    request = {"input": str(folder.parent / "input.png"), "output": str(raw), "remove": remove}
    await WARM.reconstruct(command, sf3d_env(home), request)
    stage("validating")
    return await asyncio.to_thread(finish_mesh, raw, folder / "model.glb", config.max_model, False)


async def subprocess_runner(
    provider: Provider,
    folder: Path,
    remove: bool,
    config: Settings,
    stage: Callable[[str], None],
) -> MeshInfo:
    if provider.kind == "local":
        return await local_runner(provider, folder, remove, config, stage)
    if provider.kind == "sf3d":
        return await sf3d_runner(provider, folder, remove, config, stage)
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
            # Without this, a failing main model looks like poor quality from the fallback.
            event("provider_failed", job_id=key, provider=provider.id, code=failure)
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
        await WARM.stop()

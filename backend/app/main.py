import asyncio
import ipaddress
import logging
import math
import secrets
import shutil
import sqlite3
import time
from collections import OrderedDict, deque
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import Cookie, Depends, FastAPI, File, Form, Query, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException

from .config import Settings
from .images import prepare_image
from .jobs import Jobs, Runner, event, subprocess_runner
from .middleware import UploadBodyLimit
from .providers import COMMUNITY, HUNYUAN, Provider
from .schemas import (
    Capability,
    Error,
    ErrorResponse,
    Failure,
    Health,
    History,
    Job,
    JobCreated,
    MeshInfo,
    Model,
    ModelList,
    Share,
    SharedAsset,
)
from .storage import Storage, utc

COOKIE = "vision3d_session"
GLB = "model/gltf-binary"
DOWNLOAD: dict[int | str, dict[str, Any]] = {
    200: {"content": {GLB: {"schema": {"type": "string", "format": "binary"}}}},
    206: {
        "description": "Byte range of the GLB",
        "content": {GLB: {"schema": {"type": "string", "format": "binary"}}},
    },
}


def api_errors(*codes: int) -> dict[int | str, dict[str, Any]]:
    return {code: {"model": ErrorResponse} for code in codes}


Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]


def configured_providers(settings: Settings) -> tuple[Provider, ...]:
    if settings.primary_space:
        primary = Provider("triposr", "TripoSR", settings.primary_space, "triposr", False, True)
    elif settings.community_demo:
        primary = Provider("triposr", "TripoSR community demo", COMMUNITY, "triposr", True)
    else:
        return ()
    if settings.shape_fallback:
        return primary, Provider("hunyuan-shape", "Hunyuan3D-2 shape only", HUNYUAN, "hunyuan", True)
    return (primary,)


def upload_peer(request: Request, trusted: tuple[str, ...]) -> str:
    peer = request.client.host if request.client else "local"
    if peer in trusted:
        forwarded = request.headers.getlist("x-vision3d-client-ip")
        if len(forwarded) == 1 and "%" not in forwarded[0]:
            try:
                return str(ipaddress.ip_address(forwarded[0]))
            except ValueError:
                pass
    return peer


class UploadRate:
    def __init__(self, cap: int) -> None:
        self.cap = cap
        self.clients: OrderedDict[str, deque[float]] = OrderedDict()

    def check(self, key: str) -> None:
        now = time.monotonic()
        while self.clients and next(iter(self.clients.values()))[-1] <= now - 60:
            self.clients.popitem(last=False)
        if key not in self.clients and len(self.clients) >= 4096:
            raise Failure("RATE_LIMITED", "The upload service is busy.", 429)
        times = self.clients.setdefault(key, deque())
        while times and times[0] <= now - 60:
            times.popleft()
        if len(times) >= self.cap:
            raise Failure("RATE_LIMITED", "Too many uploads. Try again shortly.", 429)
        times.append(now)
        self.clients.move_to_end(key)


def create_app(
    config: Settings | None = None,
    runner: Runner = subprocess_runner,
) -> FastAPI:
    settings = config or Settings.from_env()
    providers = configured_providers(settings)
    rate = UploadRate(settings.uploads_per_minute)

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        storage = Storage(settings)
        jobs = Jobs(storage, settings, runner)
        application.state.storage = storage
        application.state.jobs = jobs

        async def prune_periodically() -> None:
            while True:
                await asyncio.sleep(settings.prune_interval)
                try:
                    storage.prune()
                except (OSError, sqlite3.Error) as exc:
                    event("retention_prune_failed", exception=type(exc).__name__)

        maintenance = asyncio.create_task(prune_periodically())
        event("backend_started", providers=",".join(p.id for p in providers))
        try:
            yield
        finally:
            maintenance.cancel()
            await asyncio.gather(maintenance, return_exceptions=True)
            await jobs.close()
            storage.close()

    api = FastAPI(
        title="Vision3D API",
        version="1.0.0",
        lifespan=lifespan,
        responses=api_errors(500),
        description="Session-scoped photo reconstruction jobs, model storage and expiring read-only shares.",
    )
    allowed_origin = settings.public_app.rstrip("/") if settings.public_app else settings.local_origin
    api.add_middleware(UploadBodyLimit, limit=settings.max_upload + 64 * 1024)
    api.add_middleware(
        CORSMiddleware,
        allow_origins=[allowed_origin],
        allow_credentials=True,
        allow_methods=["GET", "HEAD", "POST", "DELETE"],
        allow_headers=["Content-Type", "Range"],
        expose_headers=["Content-Disposition", "Content-Range"],
    )

    def error_response(status: int, code: str, message: str) -> JSONResponse:
        return JSONResponse(
            status_code=status,
            content=ErrorResponse(error=Error(code=code, message=message)).model_dump(),
            headers={"Cache-Control": "no-store"},
        )

    @api.exception_handler(Failure)
    async def failure_handler(_: Request, exc: Failure) -> JSONResponse:
        return error_response(exc.status, exc.error.code, exc.error.message)

    @api.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, _: RequestValidationError) -> JSONResponse:
        code = (
            "INVALID_IMAGE"
            if request.url.path == "/v1/jobs" and request.method == "POST"
            else "INVALID_REQUEST"
        )
        return error_response(422, code, "The request fields are missing or invalid.")

    @api.exception_handler(HTTPException)
    async def http_handler(_: Request, exc: HTTPException) -> JSONResponse:
        code, message = {
            400: ("INVALID_REQUEST", "The request could not be parsed."),
            404: ("NOT_FOUND", "The resource was not found."),
            405: ("INVALID_REQUEST", "This method is not available."),
            413: ("INVALID_IMAGE", "The upload exceeds the size limit."),
        }.get(exc.status_code, ("INVALID_REQUEST", "The request could not be completed."))
        return error_response(exc.status_code, code, message)

    @api.exception_handler(Exception)
    async def unknown_handler(_: Request, exc: Exception) -> JSONResponse:
        logging.getLogger("uvicorn.error").error(
            '{"event":"request_internal_error","exception":"%s"}', type(exc).__name__
        )
        return error_response(500, "UNKNOWN_ERROR", "The request could not be completed.")

    def storage(request: Request) -> Storage:
        result: Storage = request.app.state.storage
        return result

    def jobs(request: Request) -> Jobs:
        result: Jobs = request.app.state.jobs
        return result

    # Async dependency keeps SQLite operations on the single application thread.
    async def owner(
        request: Request,
        response: Response,
        session: Annotated[
            str | None, Cookie(alias=COOKIE, description="Anonymous session set by Vision3D.")
        ] = None,
    ) -> str:
        origin = request.headers.get("origin")
        if request.method in {"POST", "DELETE"} and origin and origin != allowed_origin:
            raise Failure("ORIGIN_FORBIDDEN", "This origin cannot modify Vision3D data.", 403)
        key, cookie = storage(request).owner(session)
        if cookie:
            response.set_cookie(
                COOKIE,
                cookie,
                httponly=True,
                secure=bool(settings.public_app),
                samesite="lax",
                max_age=settings.retention_days * 86400,
            )
        response.headers["Cache-Control"] = "no-store"
        return key

    Owner = Annotated[str, Depends(owner)]

    def require_job(request: Request, job_id: str, key: str) -> Job:
        if result := storage(request).job(job_id, key):
            return result
        raise Failure("NOT_FOUND", "Generation job not found.", 404)

    def require_model(request: Request, model_id: str, key: str) -> Model:
        if result := storage(request).model(model_id, key):
            return result
        raise Failure("NOT_FOUND", "Model not found.", 404)

    @api.get("/health", tags=["Health"])
    async def health(response: Response) -> Health:
        response.headers["Cache-Control"] = "no-store"
        capabilities = [
            Capability(id=p.id, label=p.label, verified=p.verified, operator_configured=p.use_token)
            for p in providers
        ]
        return Health(
            status="ok" if providers else "degraded",
            providers=capabilities[:1],
            fallback_provider=capabilities[1] if len(capabilities) > 1 else None,
            max_upload_bytes=settings.max_upload,
            retention_days=settings.retention_days,
            share_ttl_seconds=settings.share_ttl,
            poll_timeout_seconds=math.ceil(settings.queue_timeout + settings.deadline + 30),
        )

    @api.get("/health/live", tags=["Health"])
    async def liveness() -> dict[str, str]:
        return {"status": "ok"}

    @api.get("/health/ready", tags=["Health"], responses=api_errors(503))
    async def readiness(request: Request) -> dict[str, str]:
        storage(request).db.execute("SELECT 1")
        if not providers or not storage(request).work.is_dir():
            raise Failure(
                "PROVIDER_UNAVAILABLE", "No generation provider is configured or storage is unavailable.", 503
            )
        return {"status": "ok"}

    @api.post("/v1/jobs", status_code=202, tags=["Jobs"], responses=api_errors(400, 403, 413, 422, 429, 503))
    async def submit(
        request: Request,
        key: Owner,
        image: Annotated[UploadFile, File(description="One JPEG, PNG or WebP image.")],
        allow_external_processing: Annotated[
            bool, Form(description="Consent to send the stripped photo to Hugging Face.")
        ] = False,
        remove_background: Annotated[bool, Form(description="Run provider background removal.")] = True,
        provider: Annotated[
            str | None, Form(description="Configured primary provider ID; fallback is automatic if enabled.")
        ] = None,
    ) -> JobCreated:
        rate.check(upload_peer(request, settings.trusted_proxy_ips))
        if not providers:
            raise Failure("PROVIDER_UNAVAILABLE", "No generation provider is configured.", 503)
        if not allow_external_processing:
            raise Failure(
                "CONSENT_REQUIRED",
                "This provider requires permission to send your photo to Hugging Face.",
                403,
            )
        if provider is not None and provider != providers[0].id:
            raise Failure("INVALID_REQUEST", "The requested primary provider is unavailable.", 422)
        queue = jobs(request)
        if len(queue.active) >= settings.queue_limit:
            raise Failure("QUEUE_FULL", "The generation queue is full.", 429)
        if image.size is not None and image.size > settings.max_upload:
            raise Failure("INVALID_IMAGE", "The upload exceeds the size limit.", 413)
        raw = await image.read(settings.max_upload + 1)
        if len(raw) > settings.max_upload:
            raise Failure("INVALID_IMAGE", "The upload exceeds the size limit.", 413)
        job_id = secrets.token_hex(16)
        store = storage(request)
        folder = store.work / job_id
        folder.mkdir(mode=0o700)
        try:
            await run_in_threadpool(prepare_image, raw, folder / "input.png")
            if len(queue.active) >= settings.queue_limit:
                raise Failure("QUEUE_FULL", "The generation queue is full.", 429)
            store.new_job(job_id, key)
            queue.enqueue(job_id, key, providers, remove_background)
        except BaseException:
            shutil.rmtree(folder, ignore_errors=True)
            raise
        event("job_queued", job_id=job_id)
        return JobCreated(job_id=job_id, status="queued")

    @api.get("/v1/jobs", tags=["Jobs"], responses=api_errors(422))
    async def history(request: Request, key: Owner, limit: Limit = 50, offset: Offset = 0) -> History:
        return History(jobs=storage(request).jobs(key, limit, offset))

    @api.get("/v1/jobs/{job_id}", tags=["Jobs"], responses=api_errors(404))
    async def read_job(request: Request, job_id: str, key: Owner) -> Job:
        return require_job(request, job_id, key)

    @api.delete("/v1/jobs/{job_id}", tags=["Jobs"], responses=api_errors(403, 404, 409))
    async def cancel_job(request: Request, job_id: str, key: Owner) -> Job:
        current = require_job(request, job_id, key)
        if current.stage == "cancelled":
            return current
        if current.status not in ("queued", "processing"):
            raise Failure("JOB_FINISHED", "The job has already finished.", 409)
        jobs(request).cancel(job_id)
        return require_job(request, job_id, key)

    @api.get("/v1/models", tags=["Models"], responses=api_errors(422))
    async def list_models(request: Request, key: Owner, limit: Limit = 50, offset: Offset = 0) -> ModelList:
        return ModelList(models=storage(request).list_models(key, limit, offset))

    @api.get("/v1/models/{model_id}", tags=["Models"], responses=api_errors(404))
    async def model(request: Request, model_id: str, key: Owner) -> Model:
        return require_model(request, model_id, key)

    def glb_response(request: Request, model_id: str, attachment: bool = False) -> FileResponse:
        path = storage(request).path(model_id)
        if not path.is_file():
            raise Failure("NOT_FOUND", "Model asset not found.", 404)
        return FileResponse(
            path,
            media_type=GLB,
            filename=f"vision3d-{model_id}.glb",
            content_disposition_type="attachment" if attachment else "inline",
            headers={"Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer"},
        )

    @api.head(
        "/v1/models/{model_id}/glb", response_class=FileResponse, tags=["Models"], responses=api_errors(404)
    )
    @api.get(
        "/v1/models/{model_id}/glb",
        response_class=FileResponse,
        responses={**DOWNLOAD, **api_errors(404, 422)},
        tags=["Models"],
    )
    async def model_glb(request: Request, model_id: str, key: Owner, download: bool = False) -> FileResponse:
        require_model(request, model_id, key)
        return glb_response(request, model_id, download)

    @api.delete("/v1/models/{model_id}", status_code=204, tags=["Models"], responses=api_errors(403, 404))
    async def delete_model(request: Request, model_id: str, key: Owner) -> None:
        if not storage(request).delete(model_id, key):
            raise Failure("NOT_FOUND", "Model not found.", 404)

    @api.post("/v1/models/{model_id}/share", tags=["Shares"], responses=api_errors(403, 404, 503))
    async def create_share(request: Request, model_id: str, key: Owner) -> Share:
        require_model(request, model_id, key)
        if not settings.public_app:
            raise Failure("SHARING_UNAVAILABLE", "Sharing requires a configured public HTTPS origin.", 503)
        token, expiry = storage(request).share(model_id)
        return Share(
            token=token, mobile_url=f"{settings.public_app.rstrip('/')}/ar/{token}", expires_at=utc(expiry)
        )

    def shared_asset(request: Request, token: str) -> SharedAsset:
        record = storage(request).shared(token)
        if not record:
            raise Failure("NOT_FOUND", "Share link not found.", 404)
        if record["expires"] <= time.time():
            raise Failure("EXPIRED", "The share link expired.", 410)
        return SharedAsset(
            model_id=record["id"],
            name=record["name"],
            expires_at=utc(record["expires"]),
            appearance=MeshInfo.model_validate_json(record["info"]).appearance,
            glb_url=f"{settings.base}/v1/share/{token}/glb",
        )

    @api.get("/v1/share/{token}", tags=["Shares"], responses=api_errors(404, 410))
    async def share(request: Request, token: str, response: Response) -> SharedAsset:
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
        return shared_asset(request, token)

    @api.head(
        "/v1/share/{token}/glb", response_class=FileResponse, tags=["Shares"], responses=api_errors(404, 410)
    )
    @api.get(
        "/v1/share/{token}/glb",
        response_class=FileResponse,
        responses={**DOWNLOAD, **api_errors(404, 410)},
        tags=["Shares"],
    )
    async def share_glb(request: Request, token: str, download: bool = False) -> FileResponse:
        response = glb_response(request, shared_asset(request, token).model_id, download)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
        return response

    return api


app = create_app()

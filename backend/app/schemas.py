from typing import Literal

from pydantic import BaseModel

Status = Literal["queued", "processing", "succeeded", "failed"]
Appearance = Literal["baked_texture", "native_texture", "shape_only"]


class Error(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: Error


class Failure(Exception):
    def __init__(self, code: str, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.error = Error(code=code, message=message)
        self.status = status


class JobCreated(BaseModel):
    job_id: str
    status: Status


class Job(JobCreated):
    stage: str
    progress: None = None
    error: Error | None = None
    model_id: str | None = None
    provider: str | None = None
    created_at: str
    updated_at: str


class History(BaseModel):
    jobs: list[Job]


class MeshInfo(BaseModel):
    vertices: int
    triangles: int
    bounds_extent: tuple[float, float, float]
    appearance: Appearance
    byte_size: int


class Model(MeshInfo):
    id: str
    name: str
    provider: str
    glb_url: str
    usdz_url: None = None
    created_at: str
    is_sample: Literal[False] = False


class ModelList(BaseModel):
    models: list[Model]


class Share(BaseModel):
    token: str
    mobile_url: str
    expires_at: str


class SharedAsset(BaseModel):
    model_id: str
    name: str
    glb_url: str
    expires_at: str
    appearance: Appearance
    usdz_url: None = None
    is_sample: Literal[False] = False


class Capability(BaseModel):
    id: str
    label: str
    verified: bool
    operator_configured: bool = False
    supports_background_removal: bool = True


class Health(BaseModel):
    status: str
    providers: list[Capability]
    fallback_provider: Capability | None = None
    max_upload_bytes: int
    retention_days: int
    share_ttl_seconds: int
    poll_timeout_seconds: int
    # True when a hosted provider is configured, so photos may leave this machine.
    external_processing: bool = True
    # Round-object mode (bottles, cans, jars): needs the local background-removal model.
    round_mode: bool = False


class CaptureSession(BaseModel):
    token: str
    capture_url: str
    expires_at: str


class CaptureInfo(BaseModel):
    expires_at: str
    received: bool


class CaptureJob(BaseModel):
    job_id: str | None = None

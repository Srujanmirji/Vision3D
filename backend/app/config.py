import ipaddress
import math
import os
import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit


@dataclass(frozen=True)
class Settings:
    data: Path = Path("data")
    primary_space: str | None = None
    local_home: Path | None = None
    community_demo: bool = False
    shape_fallback: bool = False
    hf_token: str | None = None
    public_app: str | None = None
    api_base: str = "http://localhost:8000"
    local_origin: str = "http://localhost:3000"
    max_upload: int = 10_000_000
    max_model: int = 10_000_000
    deadline: float = 300
    queue_timeout: float = 1200
    prune_interval: float = 3600
    trusted_proxy_ips: tuple[str, ...] = ()
    attempt_timeout: float = 190
    queue_limit: int = 5
    uploads_per_minute: int = 8
    retention_days: int = 7
    share_ttl: int = 3600

    def __post_init__(self) -> None:
        for peer in self.trusted_proxy_ips:
            ipaddress.ip_address(peer)
        if not all(
            math.isfinite(value)
            for value in (self.deadline, self.queue_timeout, self.attempt_timeout, self.prune_interval)
        ):
            raise ValueError("Backend time limits must be finite")
        if self.local_home and not (
            (self.local_home / "venv" / "bin" / "python").is_file() and (self.local_home / "TripoSR").is_dir()
        ):
            raise ValueError(
                "LOCAL_TRIPOSR_HOME must contain venv/ and TripoSR/; run scripts/setup-local-triposr.sh"
            )
        if self.primary_space and not re.fullmatch(r"[\w.-]+/[\w.-]+", self.primary_space, re.ASCII):
            raise ValueError("TRIPOSR_SPACE must be a Hugging Face Space ID")
        if self.public_app:
            public = urlsplit(self.public_app)
            if (
                public.scheme != "https"
                or not public.hostname
                or "." not in public.hostname
                or public.hostname.endswith((".local", ".localhost"))
                or public.path not in ("", "/")
                or public.username
                or public.query
                or public.fragment
            ):
                raise ValueError("PUBLIC_APP_URL must be the public HTTPS origin")
            try:
                address = ipaddress.ip_address(public.hostname)
            except ValueError:
                pass
            else:
                if not address.is_global:
                    raise ValueError("PUBLIC_APP_URL must be reachable on the public internet")
        if (
            min(
                self.max_upload,
                self.max_model,
                self.deadline,
                self.queue_timeout,
                self.prune_interval,
                self.attempt_timeout,
                self.queue_limit,
                self.uploads_per_minute,
                self.retention_days,
                self.share_ttl,
            )
            <= 0
        ):
            raise ValueError("Backend limits must be positive")

    @property
    def base(self) -> str:
        return f"{self.public_app.rstrip('/')}/api" if self.public_app else self.api_base.rstrip("/")

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            data=Path(os.getenv("VISION3D_DATA_DIR", "data")),
            primary_space=os.getenv("TRIPOSR_SPACE") or None,
            local_home=Path(os.environ["LOCAL_TRIPOSR_HOME"]).expanduser() if os.getenv("LOCAL_TRIPOSR_HOME") else None,
            community_demo=os.getenv("VISION3D_COMMUNITY_DEMO") == "1",
            shape_fallback=os.getenv("VISION3D_SHAPE_FALLBACK") == "1",
            hf_token=os.getenv("HF_TOKEN") or None,
            public_app=os.getenv("PUBLIC_APP_URL") or None,
            api_base=os.getenv("BACKEND_API_BASE_URL", "http://localhost:8000"),
            local_origin=os.getenv("LOCAL_FRONTEND_ORIGIN", "http://localhost:3000"),
            max_upload=int(os.getenv("MAX_UPLOAD_BYTES", "10000000")),
            max_model=int(os.getenv("MAX_MODEL_BYTES", "10000000")),
            queue_timeout=float(os.getenv("QUEUE_TIMEOUT_SECONDS", "1200")),
            prune_interval=float(os.getenv("PRUNE_INTERVAL_SECONDS", "3600")),
            trusted_proxy_ips=tuple(
                ip.strip() for ip in os.getenv("TRUSTED_PROXY_IPS", "").split(",") if ip.strip()
            ),
            deadline=float(os.getenv("JOB_TIMEOUT_SECONDS", "300")),
            attempt_timeout=float(os.getenv("PROVIDER_TIMEOUT_SECONDS", "190")),
            queue_limit=int(os.getenv("QUEUE_LIMIT", "5")),
            uploads_per_minute=int(os.getenv("UPLOADS_PER_MINUTE", "8")),
            retention_days=int(os.getenv("RETENTION_DAYS", "7")),
            share_ttl=int(os.getenv("SHARE_TTL_SECONDS", "3600")),
        )

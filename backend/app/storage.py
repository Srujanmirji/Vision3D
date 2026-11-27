import fcntl
import hashlib
import hmac
import json
import secrets
import shutil
import sqlite3
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .config import Settings
from .schemas import Job, MeshInfo, Model

CAPTURE_TTL = 600  # seconds a phone-capture QR stays usable
CAPTURE_GRACE = 600  # keep used rows a little longer so the desktop can still read the job ID


def utc(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, UTC).isoformat()


class Storage:
    def __init__(self, config: Settings) -> None:
        self.config = config
        root = config.data.resolve()
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.work = root / "work"
        self.models = root / "models"
        self.models.mkdir(exist_ok=True, mode=0o700)
        self.lock = (root / ".lock").open("ab")
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            self.lock.close()
            raise RuntimeError("Another backend process owns this data directory") from None
        database_path = root / "vision3d.sqlite3"
        database_path.touch(mode=0o600, exist_ok=True)
        database_path.chmod(0o600)
        self.db = sqlite3.connect(database_path)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            PRAGMA foreign_keys=ON;
            CREATE TABLE IF NOT EXISTS models (
                id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, provider TEXT NOT NULL,
                info TEXT NOT NULL, created REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY, owner TEXT NOT NULL, status TEXT NOT NULL, stage TEXT NOT NULL,
                error TEXT, provider TEXT, model_id TEXT REFERENCES models(id) ON DELETE SET NULL,
                created REAL NOT NULL, updated REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS shares (
                hash TEXT PRIMARY KEY, model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
                expires REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS captures (
                hash TEXT PRIMARY KEY, owner TEXT NOT NULL, expires REAL NOT NULL, job_id TEXT
            );
            CREATE INDEX IF NOT EXISTS jobs_owner_created ON jobs(owner, created);
            CREATE INDEX IF NOT EXISTS models_owner_created ON models(owner, created);
        """)
        secret_path = root / "session.key"
        if not secret_path.exists():
            # The entire data directory is private.
            secret_path.write_bytes(secrets.token_bytes(32))
            secret_path.chmod(0o600)
        self.secret = secret_path.read_bytes()
        self.recover()

    def recover(self) -> None:
        now = time.time()
        error = json.dumps(
            {"code": "INTERRUPTED", "message": "The backend restarted before this job finished."}
        )
        with self.db:
            self.db.execute(
                "UPDATE jobs SET status='failed', stage='failed', error=?, updated=? "
                "WHERE status IN ('queued','processing')",
                (error, now),
            )
        self.prune(now)
        if self.work.exists():
            shutil.rmtree(self.work)
        self.work.mkdir(mode=0o700)
        known = {f"{row['id']}.glb" for row in self.db.execute("SELECT id FROM models")}
        for file in self.models.glob("*.glb"):
            if file.name not in known:
                file.unlink()

    def prune(self, now: float | None = None) -> None:
        now = time.time() if now is None else now
        cutoff = now - self.config.retention_days * 86400
        with self.db:
            self.db.execute(
                "DELETE FROM jobs WHERE created < ? AND status NOT IN ('queued','processing')", (cutoff,)
            )
            models = self.db.execute(
                "DELETE FROM models WHERE created < ? RETURNING id", (cutoff,)
            ).fetchall()
            self.db.execute("DELETE FROM shares WHERE expires <= ?", (now,))
            self.db.execute("DELETE FROM captures WHERE expires <= ?", (now - CAPTURE_GRACE,))
        for row in models:
            self.path(row["id"]).unlink(missing_ok=True)

    def close(self) -> None:
        self.db.close()
        self.lock.close()

    def owner(self, cookie: str | None) -> tuple[str, str | None]:
        if cookie and len(cookie) < 150:
            key, separator, signature = cookie.partition(".")
            if (
                separator
                and key.isascii()
                and signature.isascii()
                and hmac.compare_digest(signature, self.sign(key))
            ):
                return key, None
        key = secrets.token_urlsafe(24)
        return key, f"{key}.{self.sign(key)}"

    def sign(self, key: str) -> str:
        return hmac.new(self.secret, key.encode(), hashlib.sha256).hexdigest()

    def new_job(self, key: str, owner: str) -> None:
        now = time.time()
        with self.db:
            self.db.execute(
                "INSERT INTO jobs(id,owner,status,stage,created,updated) VALUES(?,?,'queued','queued',?,?)",
                (key, owner, now, now),
            )

    def transition(
        self,
        key: str,
        status: str,
        stage: str,
        *,
        error: dict[str, str] | None = None,
        provider: str | None = None,
    ) -> bool:
        with self.db:
            result = self.db.execute(
                "UPDATE jobs SET status=?,stage=?,error=?,provider=COALESCE(?,provider),updated=? "
                "WHERE id=? AND status IN ('queued','processing')",
                (status, stage, json.dumps(error) if error else None, provider, time.time(), key),
            )
        return result.rowcount == 1

    def job(self, key: str, owner: str) -> Job | None:
        row = self.db.execute("SELECT * FROM jobs WHERE id=? AND owner=?", (key, owner)).fetchone()
        return self.read_job(row) if row else None

    def jobs(self, owner: str, limit: int, offset: int) -> list[Job]:
        return [
            self.read_job(row)
            for row in self.db.execute(
                "SELECT * FROM jobs WHERE owner=? ORDER BY created DESC LIMIT ? OFFSET ?",
                (owner, limit, offset),
            )
        ]

    @staticmethod
    def read_job(row: sqlite3.Row) -> Job:
        return Job(
            job_id=row["id"],
            status=row["status"],
            stage=row["stage"],
            provider=row["provider"],
            error=json.loads(row["error"]) if row["error"] else None,
            model_id=row["model_id"],
            created_at=utc(row["created"]),
            updated_at=utc(row["updated"]),
        )

    def path(self, key: str) -> Path:
        return self.models / f"{key}.glb"

    def publish(self, job: str, owner: str, provider: str, info: MeshInfo, file: Path) -> None:
        model = secrets.token_hex(16)
        dest = self.path(model)
        file.replace(dest)
        try:
            with self.db:
                now = time.time()
                self.db.execute(
                    "INSERT INTO models VALUES(?,?,?,?,?,?)",
                    (model, owner, f"Model {model[:8]}", provider, info.model_dump_json(), now),
                )
                result = self.db.execute(
                    "UPDATE jobs SET status='succeeded',stage='complete',model_id=?,updated=? "
                    "WHERE id=? AND status='processing'",
                    (model, now, job),
                )
                if result.rowcount != 1:
                    raise RuntimeError("Job is no longer active")
        except BaseException:
            dest.unlink(missing_ok=True)
            raise

    def read_model(self, row: sqlite3.Row) -> Model:
        return Model(
            **json.loads(row["info"]),
            id=row["id"],
            name=row["name"],
            provider=row["provider"],
            created_at=utc(row["created"]),
            glb_url=f"{self.config.base}/v1/models/{row['id']}/glb",
        )

    def model(self, key: str, owner: str) -> Model | None:
        row = self.db.execute("SELECT * FROM models WHERE id=? AND owner=?", (key, owner)).fetchone()
        return self.read_model(row) if row else None

    def list_models(self, owner: str, limit: int, offset: int) -> list[Model]:
        return [
            self.read_model(row)
            for row in self.db.execute(
                "SELECT * FROM models WHERE owner=? ORDER BY created DESC LIMIT ? OFFSET ?",
                (owner, limit, offset),
            )
        ]

    def delete(self, key: str, owner: str) -> bool:
        with self.db:
            result = self.db.execute("DELETE FROM models WHERE id=? AND owner=?", (key, owner))
        if result.rowcount == 1:
            self.path(key).unlink(missing_ok=True)
            return True
        return False

    def share(self, model: str) -> tuple[str, float]:
        token = secrets.token_urlsafe(24)
        expires = time.time() + self.config.share_ttl
        with self.db:
            self.db.execute("INSERT INTO shares VALUES(?,?,?)", (digest(token), model, expires))
        return token, expires

    def shared(self, token: str) -> dict[str, Any] | None:
        row = self.db.execute(
            "SELECT models.id, models.name, models.info, shares.expires FROM shares JOIN models "
            "ON shares.model_id=models.id WHERE shares.hash=?",
            (digest(token),),
        ).fetchone()
        return dict(row) if row else None


    def new_capture(self, owner: str) -> tuple[str, float]:
        token = secrets.token_urlsafe(24)
        expires = time.time() + CAPTURE_TTL
        with self.db:
            self.db.execute(
                "INSERT INTO captures(hash,owner,expires) VALUES(?,?,?)", (digest(token), owner, expires)
            )
        return token, expires

    def capture(self, token: str) -> dict[str, Any] | None:
        row = self.db.execute(
            "SELECT owner, expires, job_id FROM captures WHERE hash=?", (digest(token),)
        ).fetchone()
        return dict(row) if row else None

    def claim_capture(self, token: str, job_id: str) -> bool:
        """Bind the one phone upload to this capture link. False if expired or already used."""
        with self.db:
            result = self.db.execute(
                "UPDATE captures SET job_id=? WHERE hash=? AND job_id IS NULL AND expires>?",
                (job_id, digest(token), time.time()),
            )
        return result.rowcount == 1


def digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

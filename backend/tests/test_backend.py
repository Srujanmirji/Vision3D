import asyncio
import json
import sqlite3
import time
from collections.abc import Callable, Iterator
from contextlib import closing
from io import BytesIO
from pathlib import Path
from typing import Any

import numpy as np
import pytest
import trimesh
from fastapi.testclient import TestClient
from PIL import Image

from app.config import Settings
from app.images import prepare_image
from app.main import create_app
from app.mesh import document, finish_mesh
from app.providers import Provider, download
from app.schemas import Failure, MeshInfo


def photo(fmt: str = "JPEG") -> bytes:
    image = Image.new("RGB", (64, 32), "#d14c23")
    exif = image.getexif()
    exif[274] = 6
    exif[271] = "Private camera model"
    output = BytesIO()
    image.save(output, format=fmt, exif=exif)
    return output.getvalue()


def colored_box(path: Path) -> None:
    mesh = trimesh.creation.box()
    visual = mesh.visual
    assert isinstance(visual, trimesh.visual.ColorVisuals)
    visual.vertex_colors = np.array([[i * 30, 200 - i * 20, 70, 255] for i in range(len(mesh.vertices))])
    mesh.export(path)


def submit(client: TestClient, content: bytes | None = None, consent: bool = True) -> str:
    response = client.post(
        "/v1/jobs",
        files={"image": ("../../unsafe.jpg", content if content is not None else photo(), "image/jpeg")},
        data={"allow_external_processing": str(consent)},
    )
    assert response.status_code == 202, response.text
    return str(response.json()["job_id"])


def terminal(client: TestClient, key: str) -> dict[str, object]:
    until = time.monotonic() + 5
    while time.monotonic() < until:
        response = client.get(f"/v1/jobs/{key}")
        assert response.status_code == 200
        data: dict[str, object] = response.json()
        if data["status"] in ("failed", "succeeded"):
            return data
        time.sleep(0.01)
    pytest.fail("Job never finished")


@pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP"])
def test_decode_orientation_and_metadata_stripping(tmp_path: Path, fmt: str) -> None:
    result = tmp_path / "image.png"
    prepare_image(photo(fmt), result)
    with Image.open(result) as image:
        assert image.format == "PNG"
        assert image.size == (32, 64)
        assert not image.getexif()
        assert "exif" not in image.info


def test_unsafe_input_and_non_glb(tmp_path: Path) -> None:
    result = tmp_path / "reject.png"
    with pytest.raises(Failure, match="could not be decoded"):
        prepare_image(b"this is not an image", result)
    assert not result.exists()
    result.write_bytes(b"glTF")
    with pytest.raises(Failure, match="supported embedded GLB"):
        document(result, 10_000)


def test_texture_bake_retains_multiple_source_colors(tmp_path: Path) -> None:
    source, final = tmp_path / "source.glb", tmp_path / "final.glb"
    colored_box(source)
    result = finish_mesh(source, final, 10_000_000, allow_shape=False)
    assert result.triangles == 12
    assert result.appearance == "baked_texture"
    data = document(final, 10_000_000)
    texture = data["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"]["index"]
    image = data["images"][data["textures"][texture]["source"]]
    view = data["bufferViews"][image["bufferView"]]
    raw = final.read_bytes()
    binary = int.from_bytes(raw[12:16], "little") + 28
    start = binary + view.get("byteOffset", 0)
    with Image.open(BytesIO(raw[start : start + view["byteLength"]])) as raster:
        colors = np.asarray(raster)
        assert np.unique(colors.reshape(-1, 3), axis=0).shape[0] > 10


def test_shape_requires_explicit_permission(tmp_path: Path) -> None:
    source, output = tmp_path / "raw.glb", tmp_path / "final.glb"
    trimesh.creation.icosphere(subdivisions=1).export(source)
    with pytest.raises(Failure, match="neither"):
        finish_mesh(source, output, 10_000_000, allow_shape=False)
    assert finish_mesh(source, output, 10_000_000, allow_shape=True).appearance == "shape_only"


def test_provider_download_rejects_foreign_url(tmp_path: Path) -> None:
    class Client:
        src = "https://provider.hf.space/"
        src_prefixed = src

    with pytest.raises(Failure, match="unexpected asset URL"):
        download(Client(), {"url": "https://other.example/file=x"}, tmp_path / "out", 200)


async def fixture_runner(
    provider: Provider,
    folder: Path,
    remove: bool,
    config: Settings,
    stage: Callable[[str], None],
) -> MeshInfo:
    assert remove
    with Image.open(folder.parent / "input.png") as image:
        assert not image.getexif()
    stage("provider_generation")
    raw = folder / "raw.glb"
    colored_box(raw)
    stage("validating")
    return finish_mesh(raw, folder / "model.glb", config.max_model, False)


def test_session_share_download_deletion_and_restart(tmp_path: Path) -> None:
    config = Settings(data=tmp_path, community_demo=True, public_app="https://vision.example.com")
    with TestClient(create_app(config, fixture_runner), base_url="https://vision.example.com") as client:
        job_id = submit(client)
        job = terminal(client, job_id)
        assert job["status"] == "succeeded" and job["progress"] is None
        model = client.get(f"/v1/models/{job['model_id']}").json()
        assert model["triangles"] == 12
        assert model["glb_url"] == f"https://vision.example.com/api/v1/models/{model['id']}/glb"
        assert client.get("/v1/jobs").json()["jobs"][0]["job_id"] == job_id
        assert client.get("/v1/models").json() == {"models": [model]}
        key = model["id"]
        url = f"/v1/models/{key}/glb"
        assert client.head(url).status_code == 200
        assert client.get(url, headers={"Range": "bytes=0-3"}).content == b"glTF"
        assert client.get(url + "?download=true").headers["content-disposition"].startswith("attachment;")
        cookie = dict(client.cookies)
        share = client.post(f"/v1/models/{key}/share").json()
        public = f"/v1/share/{share['token']}"
        assert share["mobile_url"] == f"https://vision.example.com/ar/{share['token']}"
        with TestClient(create_app(Settings(data=tmp_path / "other")), base_url="https://vision.example.com"):
            pass
        client.cookies.clear()
        assert client.get(url).status_code == 404
        assert client.delete(f"/v1/models/{key}").status_code == 404
        assert client.get(public).json()["glb_url"] == f"https://vision.example.com/api{public}/glb"
        assert not client.cookies
        ranged = client.get(
            public + "/glb", headers={"Range": "bytes=0-3", "Origin": "https://external.example"}
        )
        assert ranged.status_code == 206
        assert ranged.content == b"glTF"
        assert ranged.headers["content-type"] == "model/gltf-binary"
        assert ranged.headers["access-control-allow-origin"] == "*"
        assert "no-store" in ranged.headers["cache-control"]
        assert client.head(public + "/glb").status_code == 200
        attachment = client.get(public + "/glb?download=true")
        assert attachment.headers["content-disposition"].startswith("attachment;")
        with closing(sqlite3.connect(tmp_path / "vision3d.sqlite3")) as conn, conn:
            assert share["token"] not in conn.execute("SELECT hash FROM shares").fetchone()[0]
            conn.execute("UPDATE shares SET expires=?", (time.time() - 1,))
        assert client.get(public + "/glb").status_code == 410
        assert client.head(public + "/glb").status_code == 410
    with TestClient(
        create_app(config, fixture_runner), base_url="https://vision.example.com", cookies=cookie
    ) as client:
        assert client.get(url).status_code == 200
        active = client.post(f"/v1/models/{key}/share").json()
        assert client.delete(f"/v1/models/{key}").status_code == 204
        assert client.get(f"/v1/share/{active['token']}/glb").status_code == 404
        assert client.get(f"/v1/jobs/{job_id}").json()["model_id"] is None
        assert not list((tmp_path / "models").glob("*.glb"))


def test_upload_limits_consent_rate_and_openapi(tmp_path: Path) -> None:
    config = Settings(data=tmp_path, community_demo=True, max_upload=1000, uploads_per_minute=3)
    with TestClient(create_app(config, fixture_runner)) as client:
        assert client.get("/health/ready").status_code == 200
        for content, consent, expected in (
            (photo(), "false", 403),
            (b"bad", "true", 422),
            (b"x" * 1001, "true", 413),
            (photo(), "true", 429),
        ):
            response = client.post(
                "/v1/jobs",
                files={"image": ("photo.jpg", content)},
                data={"allow_external_processing": consent},
            )
            assert response.status_code == expected, response.text
            assert set(response.json()["error"]) == {"code", "message"}
        oversized = client.post(
            "/v1/jobs",
            files={"image": ("photo.jpg", b"x" * 80_000)},
            data={"allow_external_processing": "true"},
        )
        assert oversized.status_code == 413
        assert oversized.json()["error"]["code"] == "INVALID_IMAGE"

        def multipart_chunks() -> Iterator[bytes]:
            yield b'--test\r\nContent-Disposition: form-data; name="image"; filename="x.jpg"\r\n\r\n'
            yield b"x" * 80_000
            yield b"\r\n--test--\r\n"

        streamed = client.post(
            "/v1/jobs",
            content=multipart_chunks(),
            headers={"Content-Type": "multipart/form-data; boundary=test"},
        )
        assert streamed.status_code == 413
        assert streamed.json()["error"]["code"] == "INVALID_IMAGE"
        assert (
            client.delete("/v1/jobs/nonexistent", headers={"Origin": "https://foreign.example"}).status_code
            == 403
        )
        spec = client.get("/openapi.json").json()
        assert "multipart/form-data" in spec["paths"]["/v1/jobs"]["post"]["requestBody"]["content"]
        assert (
            "model/gltf-binary"
            in spec["paths"]["/v1/models/{model_id}/glb"]["get"]["responses"]["200"]["content"]
        )
        assert "HF_TOKEN" not in json.dumps(spec)


def test_transient_retry_and_quota_fallback(tmp_path: Path) -> None:
    calls: list[str] = []

    async def attempt(
        provider: Provider,
        folder: Path,
        remove: bool,
        config: Settings,
        stage: Callable[[str], None],
    ) -> MeshInfo:
        calls.append(provider.id)
        if len(calls) == 1:
            raise Failure("TRANSIENT_PROVIDER_ERROR", "Network issue")
        if len(calls) == 2:
            raise Failure("QUOTA_EXCEEDED", "Quota exhausted")
        return await fixture_runner(provider, folder, remove, config, stage)

    config = Settings(data=tmp_path, community_demo=True, shape_fallback=True)
    with TestClient(create_app(config, attempt)) as client:
        job = terminal(client, submit(client))
        assert job["status"] == "succeeded"
        assert job["provider"] == "hunyuan-shape"
        assert calls == ["triposr", "triposr", "hunyuan-shape"]


def test_cancel_timeout_and_queue_limit(tmp_path: Path) -> None:
    async def slow(
        provider: Provider,
        folder: Path,
        remove: bool,
        config: Settings,
        stage: Callable[[str], None],
    ) -> MeshInfo:
        stage("provider_generation")
        await asyncio.sleep(20)
        raise AssertionError("test should timeout or cancel")

    config = Settings(
        data=tmp_path,
        community_demo=True,
        queue_limit=1,
        deadline=0.4,
        attempt_timeout=10,
    )
    with TestClient(create_app(config, slow)) as client:
        job_id = submit(client)
        blocked = client.post(
            "/v1/jobs",
            files={"image": ("image.jpg", photo())},
            data={"allow_external_processing": "true"},
        )
        assert blocked.status_code == 429
        cancelled = client.delete(f"/v1/jobs/{job_id}")
        assert cancelled.status_code == 200 and cancelled.json()["error"]["code"] == "CANCELLED"
        assert client.delete(f"/v1/jobs/{job_id}").status_code == 200
        later = terminal(client, submit(client))
        assert later["status"] == "failed"
        assert later["error"] == {"code": "TIMEOUT", "message": "Generation exceeded its time limit."}
        assert client.get("/v1/models").json() == {"models": []}


def test_restart_marks_interrupted_job_and_removes_work_files(tmp_path: Path) -> None:
    config = Settings(data=tmp_path, community_demo=True)
    with TestClient(create_app(config, fixture_runner)) as client:
        client.get("/v1/jobs")
        cookie = dict(client.cookies)
        owner = cookie["vision3d_session"].split(".")[0]
    with closing(sqlite3.connect(tmp_path / "vision3d.sqlite3")) as conn, conn:
        conn.execute(
            "INSERT INTO jobs(id,owner,status,stage,created,updated) VALUES(?,?,?,?,?,?)",
            ("interrupted", owner, "processing", "provider_generation", time.time(), time.time()),
        )
    abandoned = tmp_path / "work" / "interrupted"
    abandoned.mkdir()
    (abandoned / "input.png").write_bytes(photo())
    with TestClient(create_app(config, fixture_runner), cookies=cookie) as client:
        job = client.get("/v1/jobs/interrupted").json()
        assert job["status"] == "failed" and job["error"]["code"] == "INTERRUPTED"
        assert not abandoned.exists()


def test_queued_jobs_each_get_a_full_execution_window(tmp_path: Path) -> None:
    source = tmp_path / "source.glb"
    trimesh.creation.box().export(source)
    model = MeshInfo(
        vertices=8,
        triangles=12,
        bounds_extent=(1, 1, 1),
        appearance="shape_only",
        byte_size=source.stat().st_size,
    )

    async def slow(
        provider: Provider,
        folder: Path,
        remove: bool,
        config: Settings,
        stage: Callable[[str], None],
    ) -> MeshInfo:
        await asyncio.sleep(0.23)
        (folder / "model.glb").write_bytes(source.read_bytes())
        return model

    policy = Settings(data=tmp_path / "store", community_demo=True, deadline=0.4, queue_timeout=2)
    with TestClient(create_app(policy, slow)) as client:
        keys = [submit(client) for _ in range(3)]
        assert [terminal(client, key)["status"] for key in keys] == ["succeeded"] * 3


def test_queue_timeout_is_distinct_from_provider_timeout(tmp_path: Path) -> None:
    async def slow(
        provider: Provider,
        folder: Path,
        remove: bool,
        config: Settings,
        stage: Callable[[str], None],
    ) -> MeshInfo:
        await asyncio.sleep(10)
        raise AssertionError("The first job should be cancelled by the test")

    with TestClient(
        create_app(Settings(data=tmp_path, community_demo=True, queue_timeout=0.07), slow)
    ) as client:
        first, queued = submit(client), submit(client)
        job = terminal(client, queued)
        assert job["error"] == {
            "code": "QUEUE_TIMEOUT",
            "message": "The job waited too long for a worker. Please try again.",
        }
        assert client.get(f"/v1/jobs/{first}").json()["status"] == "processing"
        assert client.delete(f"/v1/jobs/{first}").status_code == 200


@pytest.mark.parametrize("trusted", [False, True])
def test_rate_limiter_only_uses_client_address_from_a_trusted_edge(tmp_path: Path, trusted: bool) -> None:
    settings = Settings(
        data=tmp_path,
        community_demo=True,
        uploads_per_minute=1,
        trusted_proxy_ips=("127.0.0.1",) if trusted else (),
    )
    with TestClient(create_app(settings, fixture_runner), client=("127.0.0.1", 5000)) as client:

        def upload(ip: str) -> int:
            return client.post(
                "/v1/jobs",
                files={"image": ("test.jpg", photo())},
                headers={"X-Vision3D-Client-IP": ip},
            ).status_code

        assert upload("192.0.2.1") == 403
        assert upload("192.0.2.1") == 429
        assert upload("192.0.2.2") == (403 if trusted else 429)


def test_live_retention_prunes_files_and_preserves_active_jobs(tmp_path: Path) -> None:
    config = Settings(
        data=tmp_path,
        community_demo=True,
        public_app="https://vision.example.com",
        prune_interval=0.04,
        retention_days=1,
    )
    with TestClient(create_app(config, fixture_runner), base_url="https://vision.example.com") as client:
        complete = terminal(client, submit(client))
        key = complete["model_id"]
        assert isinstance(key, str)
        share = client.post(f"/v1/models/{key}/share").json()
        with closing(sqlite3.connect(tmp_path / "vision3d.sqlite3")) as conn, conn:
            old = time.time() - (2 * 86400)
            owner = conn.execute("SELECT owner FROM jobs").fetchone()[0]
            conn.execute("UPDATE models SET created=?", (old,))
            conn.execute("UPDATE jobs SET created=?", (old,))
            conn.execute(
                "INSERT INTO jobs(id,owner,status,stage,created,updated) VALUES(?,?,'processing','waiting',?,?)",
                ("active", owner, old, old),
            )
        for _ in range(100):
            if client.get(f"/v1/models/{key}").status_code == 404:
                break
            time.sleep(0.02)
        else:
            pytest.fail("Periodic pruning did not run")
        assert client.get("/v1/jobs/active").json()["status"] == "processing"
        assert client.get(f"/v1/jobs/{complete['job_id']}").status_code == 404
        assert client.get(f"/v1/share/{share['token']}").status_code == 404
        assert not (tmp_path / "models" / f"{key}.glb").exists()


def test_dense_colored_mesh_is_simplified_and_texture_retained(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.mesh.MAX_TRIANGLES", 500)
    source, output = tmp_path / "dense.glb", tmp_path / "baked.glb"
    sphere = trimesh.creation.icosphere(subdivisions=3)
    color = np.rint((sphere.vertices + 1.0) * 120).astype(np.uint8)
    sphere.visual = trimesh.visual.ColorVisuals(mesh=sphere, vertex_colors=color)
    sphere.export(source)
    assert len(sphere.faces) > 500
    result = finish_mesh(source, output, 10_000_000, allow_shape=False)
    assert 0 < result.triangles <= 500 and result.appearance == "baked_texture"
    assert document(output, 10_000_000)["images"]


def test_worker_diagnostics_classify_without_exposing_raw_secrets() -> None:
    from app.jobs import stderr_category

    assert stderr_category(b"Traceback token=private-secret") == "traceback"
    assert stderr_category(b"https://provider/file=/private/model") == "unclassified"
    assert stderr_category(b"") == "empty"


@pytest.mark.parametrize("space", [None, "team/triposr"])
def test_health_distinguishes_operator_configuration_from_demo(tmp_path: Path, space: str | None) -> None:
    with TestClient(create_app(Settings(data=tmp_path, community_demo=True, primary_space=space))) as client:
        health = client.get("/health").json()
        assert health["providers"][0]["operator_configured"] == (space is not None)
        assert health["providers"][0]["verified"] == (space is None)
        assert health["poll_timeout_seconds"] == 1530


def test_queue_and_rate_limits_read_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("QUEUE_LIMIT", "2")
    monkeypatch.setenv("UPLOADS_PER_MINUTE", "3")
    settings = Settings.from_env()
    assert (settings.queue_limit, settings.uploads_per_minute) == (2, 3)


def test_phone_capture_creates_one_job_in_the_desktop_session(tmp_path: Path) -> None:
    origin = "https://vision.example.com"
    config = Settings(data=tmp_path, community_demo=True, public_app=origin)
    with TestClient(create_app(config, fixture_runner), base_url=origin) as client:
        created = client.post("/v1/captures", headers={"Origin": origin})
        assert created.status_code == 200, created.text
        token = created.json()["token"]
        assert created.json()["capture_url"] == f"{origin}/capture/{token}"
        desktop_cookies = dict(client.cookies)

        def as_phone(method: str, path: str, **kwargs: Any) -> Any:
            """A request without the desktop's session cookie, as the phone would send it."""
            client.cookies.clear()
            try:
                return client.request(method, path, **kwargs)
            finally:
                client.cookies.clear()
                client.cookies.update(desktop_cookies)

        def send(consent: bool = True, sender_origin: str = origin) -> Any:
            return as_phone(
                "POST",
                f"/v1/captures/{token}",
                files={"image": ("photo.jpg", photo(), "image/jpeg")},
                data={"allow_external_processing": str(consent)},
                headers={"Origin": sender_origin},
            )

        # Before the phone sends anything, the desktop sees no job and the phone sees a live link.
        assert client.get(f"/v1/captures/{token}/job").json() == {"job_id": None}
        info = as_phone("GET", f"/v1/captures/{token}")
        assert info.status_code == 200 and info.json()["received"] is False
        assert info.headers["cache-control"] == "no-store"

        # The same validation as a desktop upload applies, and a failed attempt does not use up the link.
        assert send(consent=False).json()["error"]["code"] == "CONSENT_REQUIRED"
        assert send(sender_origin="https://evil.example").status_code == 403
        assert client.get(f"/v1/captures/{token}/job").json() == {"job_id": None}

        sent = send()
        assert sent.status_code == 202, sent.text
        assert "job_id" not in sent.json()  # the phone never learns the desktop's job ID

        again = send()  # single use
        assert again.status_code == 409 and again.json()["error"]["code"] == "CAPTURE_USED"

        # The job belongs to the desktop session, not the phone.
        job_id = client.get(f"/v1/captures/{token}/job").json()["job_id"]
        assert job_id
        assert terminal(client, job_id)["status"] == "succeeded"
        assert as_phone("GET", f"/v1/jobs/{job_id}").status_code == 404
        assert as_phone("GET", f"/v1/captures/{token}/job").status_code == 404
        assert as_phone("GET", f"/v1/captures/{token}").json()["received"] is True


def test_phone_capture_expiry_unknown_tokens_and_missing_public_origin(tmp_path: Path) -> None:
    origin = "https://vision.example.com"
    config = Settings(data=tmp_path, community_demo=True, public_app=origin)
    with TestClient(create_app(config, fixture_runner), base_url=origin) as client:
        assert client.get("/v1/captures/not-a-token").status_code == 404
        token = client.post("/v1/captures", headers={"Origin": origin}).json()["token"]
        with closing(sqlite3.connect(tmp_path / "vision3d.sqlite3")) as db, db:
            db.execute("UPDATE captures SET expires = ?", (time.time() - 1,))
        expired = client.get(f"/v1/captures/{token}")
        assert expired.status_code == 410 and expired.json()["error"]["code"] == "EXPIRED"
        upload = client.post(
            f"/v1/captures/{token}",
            files={"image": ("photo.jpg", photo(), "image/jpeg")},
            data={"allow_external_processing": "true"},
            headers={"Origin": origin},
        )
        assert upload.status_code == 410

    with TestClient(create_app(Settings(data=tmp_path / "local", community_demo=True), fixture_runner)) as local:
        assert local.post("/v1/captures").json()["error"]["code"] == "CAPTURE_UNAVAILABLE"

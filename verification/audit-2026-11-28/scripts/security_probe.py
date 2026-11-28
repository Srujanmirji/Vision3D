"""Black-box security probe against an isolated backend on 127.0.0.1:8100 (real uvicorn, real box-mode pipeline)."""

import io
import json
import sys
import time
import zlib
import struct

import httpx
from PIL import Image

BASE = "http://127.0.0.1:8100"
ORIGIN = "https://example.test"
photo_path = sys.argv[1]
results: list[dict[str, object]] = []


def record(name: str, passed: bool, detail: str) -> None:
    results.append({"test": name, "result": "PASS" if passed else "FAIL", "detail": detail})
    print(json.dumps(results[-1]), flush=True)


def png(width: int, height: int) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (width, height), "white").save(out, format="PNG")
    return out.getvalue()


def bomb_png(width: int, height: int) -> bytes:
    """Tiny file claiming a huge canvas (header + one compressed all-zero IDAT)."""
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    raw = zlib.compress(b"\x00" * (width + 1) * 8)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)) + \
        chunk(b"IDAT", raw) + chunk(b"IEND", b"")


def upload(client: httpx.Client, content: bytes, name: str = "a.jpg", mode: str = "box", **headers: str) -> httpx.Response:
    return client.post(f"{BASE}/v1/jobs", files={"image": (name, content, "image/jpeg")},
                       data={"mode": mode}, headers=headers)


def wait(client: httpx.Client, job_id: str) -> dict[str, object]:
    for _ in range(120):
        job = client.get(f"{BASE}/v1/jobs/{job_id}").json()
        if job["status"] in ("succeeded", "failed"):
            return job
        time.sleep(0.5)
    raise RuntimeError("job never finished")


real = open(photo_path, "rb").read()
def session() -> httpx.Client:
    """The cookie is Secure (PUBLIC_APP_URL is https); carry it by hand over this plain-HTTP test link."""
    client = httpx.Client()

    def keep(response: httpx.Response) -> None:
        value = response.headers.get("set-cookie", "")
        if value.startswith("vision3d_session="):
            client.cookies.set("vision3d_session", value.split(";")[0].split("=", 1)[1])

    client.event_hooks["response"] = [keep]
    return client


alice, bob = session(), session()

# --- malicious and invalid uploads (each counts toward the 8/min limit, so keep to 7) ---
cases = {
    "oversized 11 MB body": (b"\xff\xd8" + b"0" * 11_000_000, 413, "INVALID_IMAGE"),
    "text file named .jpg": (b"<?php system($_GET['c']); ?>", 422, "INVALID_IMAGE"),
    "SVG with script": (b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 422, "INVALID_IMAGE"),
    "GIF (not allowlisted)": (b"GIF89a\x01\x00\x01\x00\x00\x00\x00;", 422, "INVALID_IMAGE"),
    "decompression bomb 30000x30000 PNG": (bomb_png(30000, 30000), 422, "INVALID_IMAGE"),
    "8x8 image (below 16 px)": (png(8, 8), 422, "INVALID_IMAGE"),
}
for name, (content, status, code) in cases.items():
    r = upload(alice, content)
    got = r.json().get("error", {}).get("code") if r.headers.get("content-type", "").startswith("application/json") else None
    record(f"upload rejects {name}", r.status_code == status and got == code, f"HTTP {r.status_code} {got}")

# --- real job, ownership isolation ---
r = upload(alice, real)
job = wait(alice, r.json()["job_id"])
model_id = str(job["model_id"])
record("real box-mode job succeeds", job["status"] == "succeeded", f"provider={job['provider']}")
for path in (f"/v1/models/{model_id}", f"/v1/models/{model_id}/glb", f"/v1/jobs/{job['job_id']}"):
    r = bob.get(BASE + path)
    record(f"other session cannot read {path.split('/')[2]}{'/glb' if path.endswith('glb') else ''}", r.status_code == 404, f"HTTP {r.status_code}")
r = bob.delete(f"{BASE}/v1/models/{model_id}")
record("other session cannot delete model", r.status_code == 404, f"HTTP {r.status_code}")
r = httpx.get(f"{BASE}/v1/models/{model_id}/glb", cookies={"vision3d_session": "forged.0000"})
record("forged session cookie is rejected", r.status_code == 404, f"HTTP {r.status_code}")
r = bob.get(f"{BASE}/v1/models")
record("other session's library is empty", r.json()["models"] == [], f"{len(r.json()['models'])} models")

# --- CSRF / origin ---
r = alice.post(f"{BASE}/v1/models/{model_id}/share", headers={"Origin": "https://evil.example"})
record("foreign Origin cannot create share", r.status_code == 403, f"HTTP {r.status_code}")
r = alice.delete(f"{BASE}/v1/models/{model_id}", headers={"Origin": "https://evil.example"})
record("foreign Origin cannot delete", r.status_code == 403, f"HTTP {r.status_code}")
r = httpx.options(f"{BASE}/v1/models", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "DELETE"})
record("CORS preflight denies foreign origin", "access-control-allow-origin" not in r.headers, f"HTTP {r.status_code}")

# --- shares: expiry and revocation ---
share = alice.post(f"{BASE}/v1/models/{model_id}/share", headers={"Origin": ORIGIN}).json()
token = share["token"]
r = httpx.get(f"{BASE}/v1/share/{token}/glb")
record("share link serves GLB without a session", r.status_code == 200 and r.content[:4] == b"glTF", f"HTTP {r.status_code}")
record("share GLB is no-store and no-referrer", "no-store" in r.headers.get("cache-control", "") and r.headers.get("referrer-policy") == "no-referrer", r.headers.get("cache-control", ""))
r = httpx.get(f"{BASE}/v1/share/{token[:-1]}{'A' if token[-1] != 'A' else 'B'}")
record("tampered share token is 404", r.status_code == 404, f"HTTP {r.status_code}")
time.sleep(4)  # SHARE_TTL_SECONDS=3
r = httpx.get(f"{BASE}/v1/share/{token}/glb")
record("expired share link is refused", r.status_code == 410, f"HTTP {r.status_code}")
share2 = alice.post(f"{BASE}/v1/models/{model_id}/share", headers={"Origin": ORIGIN}).json()["token"]
r = alice.delete(f"{BASE}/v1/models/{model_id}", headers={"Origin": ORIGIN})
record("owner deletes model", r.status_code == 204, f"HTTP {r.status_code}")
r = httpx.get(f"{BASE}/v1/share/{share2}/glb")
record("deleting the model revokes its share link", r.status_code == 404, f"HTTP {r.status_code}")
r = alice.get(f"{BASE}/v1/models/{model_id}/glb")
record("deleted model file is gone", r.status_code == 404, f"HTTP {r.status_code}")

# --- rate limit: different sessions, same peer (what cloudflared looks like to the backend) ---
time.sleep(61)
codes = []
for i in range(9):
    client = httpx.Client()  # a brand-new visitor each time
    codes.append(upload(client, b"x").status_code)
record("9th upload from 9 *different* visitors is refused (one shared bucket behind the tunnel)",
       codes[-1] == 429, f"codes={codes}")
spoof = upload(httpx.Client(), b"x", **{"x-vision3d-client-ip": "203.0.113.9"}).status_code
record("client IP header is ignored from an untrusted peer", spoof == 429, f"HTTP {spoof}")
print(json.dumps(results, indent=1), file=open(sys.argv[2], "w"))

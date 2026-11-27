"""End-to-end check against the deployed origin. Usage: deployed_e2e.py ORIGIN PHOTO OUT_JSON"""
import io
import json
import random
import sys
import time
from pathlib import Path

import httpx
from PIL import Image

origin, photo, out = sys.argv[1].rstrip("/"), sys.argv[2], sys.argv[3]
api = f"{origin}/api"
report: dict = {"origin": origin, "started": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
headers = {"Origin": origin}

with httpx.Client(timeout=60, follow_redirects=False) as owner:
    # 1. Large body through the Vercel external rewrite (no consent -> backend must answer 403, not a proxy 413).
    rnd = random.Random(7)
    img = Image.frombytes("RGB", (2600, 2600), bytes(rnd.getrandbits(8) for _ in range(2600 * 2600 * 3)))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    big = buf.getvalue()
    r = owner.post(f"{api}/v1/jobs", headers=headers, files={"image": ("big.png", big, "image/png")},
                   data={"allow_external_processing": "false"})
    report["large_upload"] = {"bytes": len(big), "status": r.status_code, "body": r.json()}

    # 2. Real photo, with consent.
    t0 = time.monotonic()
    with open(photo, "rb") as f:
        r = owner.post(f"{api}/v1/jobs", headers=headers, files={"image": ("photo.jpg", f, "image/jpeg")},
                       data={"allow_external_processing": "true"})
    report["submit"] = {"status": r.status_code, "seconds": round(time.monotonic() - t0, 2)}
    r.raise_for_status()
    job_id = r.json()["job_id"]
    stages = []
    poll_errors = []
    report["poll_errors"] = poll_errors
    while True:
        try:
            job = owner.get(f"{api}/v1/jobs/{job_id}", timeout=30).json()
        except httpx.TransportError as exc:  # same tolerance as the frontend poller
            poll_errors.append(type(exc).__name__)
            if len(poll_errors) > 5:
                raise
            time.sleep(3)
            continue
        if not stages or stages[-1] != job["stage"]:
            stages.append(job["stage"])
        if job["status"] in ("succeeded", "failed"):
            break
        time.sleep(3)
    report["job"] = {"status": job["status"], "stages": stages, "error": job.get("error"),
                     "seconds": round(time.monotonic() - t0, 1)}
    if job["status"] != "succeeded":
        Path(out).write_text(json.dumps(report, indent=2))
        sys.exit(f"job failed: {job.get('error')}")
    model = owner.get(f"{api}/v1/models/{job['model_id']}").json()
    report["model"] = {k: model[k] for k in ("triangles", "vertices", "byte_size", "appearance", "glb_url")}

    share = owner.post(f"{api}/v1/models/{model['id']}/share", headers=headers).json()
    report["share"] = {"mobile_url": share["mobile_url"], "expires_at": share["expires_at"]}

    # 3. Cookie-free guest, as a phone would be.
    with httpx.Client(timeout=60) as guest:
        page = guest.get(share["mobile_url"])
        meta = guest.get(f"{api}/v1/share/{share['token']}").json()
        glb = guest.get(meta["glb_url"])
        head = guest.head(meta["glb_url"])
        part = guest.get(meta["glb_url"], headers={"Range": "bytes=0-11"})
        private = guest.get(f"{api}/v1/models/{model['id']}/glb")
        report["guest"] = {
            "page_status": page.status_code,
            "page_headers": {k: page.headers.get(k) for k in ("cache-control", "referrer-policy", "x-robots-tag")},
            "glb_url": meta["glb_url"],
            "glb_status": glb.status_code,
            "glb_magic": glb.content[:4].decode("latin-1"),
            "glb_bytes": len(glb.content),
            "glb_headers": {k: glb.headers.get(k) for k in (
                "content-type", "cache-control", "access-control-allow-origin", "accept-ranges", "x-vercel-cache")},
            "head_status": head.status_code,
            "range_status": part.status_code,
            "content_range": part.headers.get("content-range"),
            "private_glb_without_cookie": private.status_code,
        }

    # 4. Clean up the test model; the share must stop working.
    owner.delete(f"{api}/v1/models/{model['id']}", headers=headers)
    report["after_delete_share_status"] = httpx.get(meta["glb_url"]).status_code

Path(out).write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))

# Security audit

28 November 2026. The black-box probe (`verification/audit-2026-11-28/scripts/security_probe.py`) ran against an isolated backend on `127.0.0.1:8100`, so the live site was never attacked. That backend ran real uvicorn with a real Box-mode pipeline, `PUBLIC_APP_URL=https://example.test` and `SHARE_TTL_SECONDS=3`. Live-site checks were read-only GETs. The results are in `security-results.json`, and no secret value was printed or stored.

## Probe results: 25 of 25 PASS

| Area | Test | Result |
|---|---|---|
| Uploads | 11 MB body → 413 | PASS |
| | Text/PHP file named `.jpg` → 422 | PASS |
| | SVG with `<script>` → 422 | PASS |
| | GIF (not allowlisted) → 422 | PASS |
| | Decompression bomb: PNG header claiming 30000×30000 → 422 | PASS |
| | 8×8 image (below 16 px) → 422 | PASS |
| Real job | Box-mode upload succeeds | PASS |
| Session isolation | Another session reading the model, GLB or job → 404 | PASS (3 tests) |
| | Another session deleting the model → 404 | PASS |
| | Forged session cookie → 404 | PASS |
| | Another session's library is empty | PASS |
| CSRF / CORS | Foreign `Origin` creating a share → 403 | PASS |
| | Foreign `Origin` deleting → 403 | PASS |
| | Preflight from a foreign origin gets no `Access-Control-Allow-Origin` | PASS |
| Shares | Share serves the GLB without a session | PASS |
| | Share GLB is `no-store` and `no-referrer` | PASS |
| | Tampered token → 404 | PASS. A storage-level check also rejected 2,100 of 2,100 one-character tampers |
| | Expired share → 410 | PASS |
| | Owner deletes the model → 204 | PASS |
| | Deleting the model revokes its share → 404 | PASS |
| | Deleted model file is gone | PASS |
| Rate limit | 9th upload in a minute → 429 | PASS, but see S-1 |
| | `x-vision3d-client-ip` from an untrusted peer is ignored | PASS |

## Code review findings

| ID | Pri | Finding | File |
|---|---|---|---|
| S-1 | P2 | In production, every visitor shares one upload bucket: 8 per minute for the whole site | `backend/app/main.py:83-112, 305` |
| S-2 | P2 | The backend is publicly reachable at the tunnel hostname, bypassing Vercel; `/docs` and `/openapi.json` are open | deployment, `main.py:158` |
| S-3 | P2 | A third, hosted provider (community HF Space) is configured live but not shown in `/health`; the consent wording says the photo *is* uploaded | `main.py:265`, `ImageInputPanel.tsx:339`, live env `VISION3D_COMMUNITY_DEMO=1` |
| S-4 | P3 | No way to revoke one share link except deleting the model | `main.py` (no endpoint) |
| S-5 | P3 | CSP allows `'unsafe-inline'` scripts (a Next.js default without nonces) | `frontend/next.config.ts` |

### S-1: the rate limit is global behind the tunnel

**Cause:** `UploadRate` keys on the socket peer. cloudflared connects from `127.0.0.1`, `TRUSTED_PROXY_IPS` is empty in the live settings, and nothing sends `x-vision3d-client-ip`: the Vercel rewrite can't add it.

**Reproduce:** 9 uploads from 9 fresh sessions on one peer give `[422 ×8, 429]` (probe row 24).

**Impact:** one visitor, or a busy demo room, can block uploads for everyone for 60 s.

**Fix (needs approval):**
1. Add Next.js middleware that sets `x-vision3d-client-ip` from Vercel's `x-forwarded-for`, together with a shared secret header.
2. In the backend, accept the client-IP header only when that secret matches.
3. Set `TRUSTED_PROXY_IPS=127.0.0.1`.

Trusting `127.0.0.1` without the secret would let anyone who calls the tunnel directly (S-2) spoof their IP.

**For a supervised demo:** raising `UPLOADS_PER_MINUTE` to about 20 is a safe stopgap. The queue limit of 5 still bounds the load.

### S-2: direct access to the backend

**Reproduce:** `GET https://<tunnel>/docs` returns 200, and `GET https://<tunnel>/v1/models` returns 200 and sets a cookie.

**Impact:** low. Sessions on the tunnel host are separate from the Vercel host, and the same validation applies. But it's an unadvertised second entry point: it skips Vercel's edge protections and shows the full API schema.

**Fix:** pass `docs_url=None, redoc_url=None, openapi_url=None` when `PUBLIC_APP_URL` is set. Once a named tunnel exists, a Cloudflare Access service token or the shared-secret header from S-1 would close the bypass.

### S-3: consent and the hidden third provider

The live chain is SF3D (local), then TripoSR (local), then the community Space (hosted). `/health` reports only the first two. The UI asks for consent because a hosted provider exists, but its text reads as if every photo is uploaded. In practice a photo leaves the Mac only if both local models fail.

**Recommendation (owner decision):** either set `VISION3D_COMMUNITY_DEMO=0`, so photos never leave the Mac and no consent box is needed, or reword the consent to say the photo is sent "only if the on-device models fail".

## Other checks

| Check | Result |
|---|---|
| Secrets in tracked files (HF, OpenAI, AWS, JWT and private-key patterns; `.env`, `session.key`, sqlite) | PASS, none found |
| `HF_TOKEN` passed to the local workers | PASS. Removed from the worker environment, and the workers run offline (`HF_HUB_OFFLINE=1`); covered by a test |
| Live response headers | PASS: CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, HSTS |
| Session cookie | PASS: HttpOnly, SameSite=Lax, Secure on the public origin, HMAC-signed |
| Storage | PASS: data directory 0700, database 0600, files named by random IDs, single-process lock |
| Retention | PASS: hourly prune task (`PRUNE_INTERVAL_SECONDS`), startup recovery marks interrupted jobs |
| Failed-job cleanup | PASS: work folder removed when the job task finishes |
| `pnpm audit --prod` | PASS, no known vulnerabilities |
| Python `pip-audit` | NOT TESTED (not installed in the venv) |
| Model licences | SF3D: Stability AI Community License (free below USD 1M revenue; commercial use above needs a paid licence). TripoSR: MIT. u2net: Apache-2.0 |
| Authentication | None, by design: anonymous signed sessions, per REQUIREMENTS.md. Not a finding |

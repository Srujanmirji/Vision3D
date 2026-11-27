# Deploy Vision3D on Vercel

Vercel hosts the Next.js frontend. Its external rewrite forwards `/api/*` to a dedicated HTTPS FastAPI origin and preserves the canonical browser origin for session cookies and expiring share links. FastAPI and its generation subprocess run on one long-lived Linux machine with a persistent disk. Keep the backend at one replica and one Uvicorn worker for the SQLite store and queue lock.

## Free hosting limits

Verified 27 November 2026. Vercel Hobby is free for personal, non-commercial projects. Its external rewrites allow up to 120 seconds for the upstream to respond. Upload and job creation return `202` ahead of inference, and polling, downloading and sharing use separate requests. The backend permits 190 seconds per provider attempt, 300 seconds of job execution, and 1,200 seconds of queue wait. The worker runs under systemd throughout that period. Do not route uploads through a Vercel Function, whose request and response payloads are capped at 4.5 MB. [Vercel Hobby](https://vercel.com/docs/plans/hobby) · [Rewrites](https://vercel.com/docs/routing/rewrites) · [Proxy limits](https://vercel.com/docs/limits#proxied-request-timeout) · [Function payload limit](https://vercel.com/docs/functions/limitations)

Use an existing always-on Linux host and DNS name to avoid new recurring infrastructure costs. OCI Always Free is an option when available in the account's home region. Its A1 allowance is 1,500 OCPU-hours and 9,000 GB-hours monthly (up to 2 OCPUs and 12 GB of RAM continuously), with 200 GB total eligible block storage including boot volumes. Capacity can be unavailable and idle instances can be reclaimed. Check the **Always Free** label at provisioning and keep backups off the VM. Render Free sleeps after 15 minutes without inbound traffic and offers ephemeral storage, so it does not meet this backend's persistence requirements. [OCI Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) · [Render Free](https://render.com/docs/free)

A Cloudflare Quick Tunnel can expose a temporary backend for a release rehearsal or demo. It needs no account, uses a random hostname that changes on every start, has no uptime guarantee, and caps each tunnel at 200 in-flight requests. Vision3D polls instead of using SSE, so the Quick Tunnel limitation on SSE does not apply. A durable deployment needs a stable API hostname and an operator-configured free inference endpoint that passes a live smoke test. The community TripoSR Space is an explicit demo setting subject to availability and quota. [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) · [Provider validation](AI_RESEARCH.md)

Additional limits verified on 27 November 2026, from vendor docs and the live deployment:

- **Vercel Hobby:** 100 GB of Fast Data Transfer, 10 GB of Fast Origin Transfer and 1,000,000 CDN requests per month. If you exceed a limit, that feature is paused until the 30-day window resets; nothing is billed.
- **Vercel caching:** projects created after 6 April 2026 honour upstream `Cache-Control` on external rewrites. Every API and share response sends `no-store` or `private`, and the live share GLB returned `x-vercel-cache: MISS`.
- **Request body size:** Vercel documents no body limit for external rewrites. In the live test, an 8.9 MB multipart upload passed through the rewrite to FastAPI.
- **Free owned Space ruled out:** Hugging Face now requires a paid plan to *create* Gradio or Docker Spaces. A free personal account cannot host its own TripoSR Space, so `TRIPOSR_SPACE` needs a paid plan or an existing compatible Space. [Spaces overview](https://huggingface.co/docs/hub/spaces-overview)
- **OCI idle reclamation:** Oracle can reclaim an Always Free instance whose 95th-percentile CPU, network and (A1) memory all stay below 20% for 7 days. A mostly idle demo backend can meet that definition. Keep the repository and an off-host backup of `/var/lib/vision3d`, so a reclaimed VM can be rebuilt.

## 1. Prepare the Linux backend

On a systemd host with Python 3.13, its venv module, Git, curl, and Caddy installed, clone the intended release to `/opt/vision3d`. On Debian 13 the packages are `git`, `curl`, `python3.13`, `python3.13-venv` and `caddy`. Use a persistent filesystem for `/var/lib/vision3d`. The following commands assume a fresh host and an already-authorized Git checkout.

```sh
sudo useradd --system --home-dir /var/lib/vision3d --shell /usr/sbin/nologin vision3d
sudo python3.13 -m venv /opt/vision3d/.venv
sudo /opt/vision3d/.venv/bin/python -m pip install -r /opt/vision3d/backend/requirements.txt
sudo install -d -m 0700 /etc/vision3d
sudo install -m 0600 /opt/vision3d/backend/.env.example /etc/vision3d/backend.env
sudoedit /etc/vision3d/backend.env
```

Set the following values in that server-only file. Replace the example hostnames and Space ID with your own values. Keep a private Space token there only if the Space requires one. Verify that the selected Space accepts the TripoSR input and output contract on genuinely free hardware.

```dotenv
VISION3D_DATA_DIR=/var/lib/vision3d
PUBLIC_APP_URL=https://your-project.vercel.app
TRIPOSR_SPACE=your-hf-account/your-triposr-space
VISION3D_COMMUNITY_DEMO=0
VISION3D_SHAPE_FALLBACK=0
TRUSTED_PROXY_IPS=127.0.0.1
QUEUE_LIMIT=5
UPLOADS_PER_MINUTE=8
MAX_UPLOAD_BYTES=10000000
MAX_MODEL_BYTES=10000000
PROVIDER_TIMEOUT_SECONDS=190
JOB_TIMEOUT_SECONDS=300
QUEUE_TIMEOUT_SECONDS=1200
RETENTION_DAYS=7
SHARE_TTL_SECONDS=3600
PRUNE_INTERVAL_SECONDS=3600
```

Point your API hostname's DNS at the host and allow inbound 80 and 443 for Caddy. Keep 8000 private. The sample Caddyfile replaces incoming `X-Vision3D-Client-IP` with the actual socket peer. An inbound Vercel request may therefore share a rate-limit bucket with other edge traffic. Evaluate two separate client networks before relying on per-user fairness. Keep only verified proxy addresses in `TRUSTED_PROXY_IPS` and preserve the header replacement. [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https)

```sh
cd /opt/vision3d
sudo install -m 0644 deploy/vision3d-*.service deploy/vision3d-health.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now vision3d-api.service vision3d-health.timer
sed 's/vision3d-api\.example\.com/api.your-domain.example/g' deploy/Caddyfile \
  | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo systemctl reload caddy
curl -fsS https://api.your-domain.example/health/ready
```

On a shared Caddy host, import a separate site configuration instead of replacing its existing Caddyfile. Configure alerts against both the systemd health unit and public `/api/health/ready`. Check `journalctl -u vision3d-api -u vision3d-health` for process and readiness failures. Readiness checks SQLite, working storage and provider configuration. A live photo generation checks upstream capacity. FastAPI emits structured error codes and Caddy returns a structured error for upstream gateway failures. Keep tokenized URLs, cookies and provider credentials out of access logs.

## 2. Deploy the frontend

1. In Vercel, import the Git repository into your Hobby account and set **Root Directory** to `frontend`. Everything else comes from committed files:
   - `frontend/vercel.json` pins the Next.js preset and the install and build commands. Without it, a project created from the CLI defaults to the "Other" preset and serves 404.
   - `frontend/package.json` pins Node.js `24.x` and `pnpm@11.20.0`.

   With the CLI, from `frontend/`:

   ```sh
   vercel project add vision3d
   vercel link --yes --project vision3d
   ```

   `vercel link` appends a `VERCEL_OIDC_TOKEN` to `frontend/.env.local`. That file is git-ignored; keep it out of commits.

   **Git deployments (current setup):** the `vision3d` project is connected to `Srujanmirji/Vision3D`, with Root Directory `frontend` and production branch `main`. Every push or merge to `main` deploys to production, and pull requests get preview deployments. Environment variables still come from the project settings, so a backend tunnel change still needs `VISION3D_BACKEND_ORIGIN` updated and a redeploy (Vercel dashboard → Redeploy).

   Because the Root Directory is now `frontend`, run manual CLI deploys from the **repository root** after `vercel link --yes --project vision3d` there, not from `frontend/`. To connect a new project: `vercel api /v9/projects/<name> -X PATCH -f rootDirectory=frontend`, then `vercel git connect <repo-url>`.
2. Add these Production environment variables, then deploy the release. Set `NEXT_PUBLIC_PUBLIC_APP_URL` and backend `PUBLIC_APP_URL` to exactly the same origin. When using a custom public application domain, use it for both values. Use the same-origin `/api` client setting.

   | Variable | Production value |
   | --- | --- |
   | `ENABLE_EXPERIMENTAL_COREPACK` | `1` |
   | `VISION3D_BACKEND_ORIGIN` | `https://api.your-domain.example` |
   | `NEXT_PUBLIC_PUBLIC_APP_URL` | `https://your-project.vercel.app` |
   | `NEXT_PUBLIC_API_BASE_URL` | `/api` (also the default) |

   ```sh
   printf '%s' "https://api.your-domain.example" | vercel env add VISION3D_BACKEND_ORIGIN production
   printf '%s' "https://your-project.vercel.app" | vercel env add NEXT_PUBLIC_PUBLIC_APP_URL production
   printf '%s' "/api" | vercel env add NEXT_PUBLIC_API_BASE_URL production
   printf '%s' "1" | vercel env add ENABLE_EXPERIMENTAL_COREPACK production
   vercel deploy --prod --yes
   ```

   The rewrite destination and the `NEXT_PUBLIC_*` values are baked in at build time. After changing any of them, redeploy. The production alias is shown by `vercel inspect <deployment-url>`. The first deploy assigns it, so set `NEXT_PUBLIC_PUBLIC_APP_URL` and the backend's `PUBLIC_APP_URL` after that, then deploy again.

3. For an independently testable preview, give it its own public canonical origin and isolated backend. Vercel deployment protection must allow a cookie-free guest to fetch the share page and its GLB. Provider tokens, SQLite and model files stay on the backend host.

The API accepts browser mutations from the configured frontend origin. Owner operations use a Secure, HttpOnly session cookie. Read-only assets use expiring, revocable URLs. Shared GLBs return `model/gltf-binary`, support GET, HEAD and byte ranges, and have public asset CORS with no-store caching. Model Viewer generates a `model/vnd.usdz+zip` Blob for Quick Look on supported iPhones. There is no HTTP USDZ endpoint. The export dialog's **Download USDZ** button runs the same three.js converter in the user's browser, so no server MIME setup is needed for USDZ.

## Demo backend on a laptop (Quick Tunnel)

This is the zero-cost option used for the live test on 27 November 2026. Vercel serves the frontend, and the FastAPI backend runs on the presenter's Mac behind a Cloudflare Quick Tunnel. It is suitable for a demo, not for durable hosting:
- The laptop must stay awake and online.
- The tunnel hostname changes on every start, and each change needs a Vercel redeploy.
- Generation uses the community TripoSR Space.

```sh
brew install cloudflared
# Terminal 1: tunnel. Copy the https://<random>.trycloudflare.com URL it prints.
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8000
# Terminal 2: backend, from backend/. Keep VISION3D_DATA_DIR on a persistent path.
VISION3D_DATA_DIR="$HOME/vision3d-data" PUBLIC_APP_URL=https://your-project.vercel.app VISION3D_COMMUNITY_DEMO=1 \
  ../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --no-proxy-headers --no-access-log
# Terminal 3: point Vercel at this tunnel, from frontend/, then redeploy.
vercel env rm VISION3D_BACKEND_ORIGIN production --yes
printf '%s' "https://<random>.trycloudflare.com" | vercel env add VISION3D_BACKEND_ORIGIN production
vercel deploy --prod --yes
```

Every request reaches FastAPI from `cloudflared` on `127.0.0.1`, so the per-client upload limit (`UPLOADS_PER_MINUTE`, default 8) becomes one shared bucket for all visitors. That is acceptable for a demo. In the live test, one status poll per job stalled for 30–60 s on the Vercel → tunnel path. The frontend retries polls on transient errors, so that job still succeeded.

## 3. Verify and operate

```sh
APP_ORIGIN=https://your-project.vercel.app
curl -fsS "$APP_ORIGIN/api/health/live"
curl -fsS "$APP_ORIGIN/api/health/ready"
curl -fsS "$APP_ORIGIN/api/health"
.venv/bin/python scripts/deployed_e2e.py "$APP_ORIGIN" verification/reconstruction/inputs/shoes.jpg verification/deployed/e2e.json
```

`scripts/deployed_e2e.py` runs against the public origin and makes a real inference request: it sends a public test photo to the configured provider, with consent. It checks:
- an oversized upload gets the backend's structured `413`
- the photo upload returns `202`, and the job is polled to completion, retrying transient poll errors as the frontend does
- the model's metadata
- the share link: a cookie-free guest loads the share page and its GLB, checking the magic bytes, `model/gltf-binary`, `no-store`, CORS, HEAD and a `206` range response
- the private GLB returns `404` without the owner's cookie

It then deletes the model and confirms the share now returns `404`. It does not read the QR image; do that in a browser (see the QR check in HANDOFF.md) or with a phone.

For physical acceptance, generate a separate model and open View in AR on desktop. Scan the QR on an iPhone and an Android handset on cellular or a different Wi-Fi network. Check that the same model opens without the owner's cookie, then follow [AR_DEVICE_TESTING.md](AR_DEVICE_TESTING.md) for native placement, gestures and fallback. A mobile browser profile cannot exercise the camera scan or native runtimes.

Back up `/var/lib/vision3d` as a unit, including SQLite, models and the session signing key, to a restricted off-host destination. Stop the API during filesystem backups/restores, after the queue drains. If restarted mid-generation, the API marks queued and processing jobs as interrupted and removes their temporary inputs. The frontend can submit a new request. Published models, sessions and retained history survive restarts. Roll back the frontend to its prior Vercel deployment and the backend to its prior code after a failed release check. Verify readiness and upload/share again after rollback.

## CI and uptime alerts

- **CI** (`.github/workflows/ci.yml`) runs on every pull request and every push to `main`:
  - backend: ruff, strict mypy and pytest (live provider tests stay skipped)
  - frontend: lint, typecheck, Vitest and `next build`
- **Uptime** (`.github/workflows/uptime.yml`) runs every 30 minutes on `main`. It checks `<HEALTH_URL>/` and `<HEALTH_URL>/api/health/ready`, trying three times before failing.
  - **How it alerts:** a failed run is the alert. GitHub emails the account that last edited the schedule (Settings → Notifications → Actions controls this).
  - **Set it up:** `gh variable set HEALTH_URL --body https://your-project.vercel.app`. Run it once by hand from the Actions tab (Uptime → Run workflow).
  - **Pause it:** while the laptop backend is intentionally off, run `gh variable delete HEALTH_URL`, otherwise every check fails and emails you.
  - **Delays:** GitHub can delay scheduled runs by several minutes, and disables schedules after 60 days without repository activity.
  - **Faster alternative:** UptimeRobot's free plan, with a 5-minute HTTP monitor on `/api/health/ready`, needs its own account.

## Repeatable local setup

Use Node.js 24 with Corepack, Python 3.13, and a POSIX shell on macOS or Linux. From a clean checkout:

```sh
sh scripts/setup.sh
# Terminal 1
cd backend
set -a
. ./.env
set +a
../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-proxy-headers --no-access-log
# Terminal 2, from the repo root
cd frontend
corepack pnpm dev
```

Open [local Vision3D](http://localhost:3000). Local setup creates env files on first use and preserves changes. For local live generation, configure an operator-owned free TripoSR Space, or set `VISION3D_COMMUNITY_DEMO=1` explicitly in `backend/.env`. The app reports degraded generation when no provider is configured.

```sh
# From the repository root
(cd backend && ../.venv/bin/ruff check . && ../.venv/bin/python -m mypy app && ../.venv/bin/python -m pytest -q)
(cd frontend && corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test)
(cd frontend && VISION3D_BACKEND_ORIGIN=http://127.0.0.1:8316 \
  NEXT_PUBLIC_PUBLIC_APP_URL=https://vision3d.test:3446 corepack pnpm build && corepack pnpm test:browser)
```

The local HTTPS browser suite uses an archived genuine GLB through the fixture provider to reproduce frontend and backend contract checks. For a fresh free provider run, use `cd backend && VISION3D_RUN_LIVE=1 ../.venv/bin/python -m pytest -q tests/test_live.py -k shoes`.

# Vision3D

Upload or capture a photo of one object. Vision3D turns it into a textured 3D model (GLB) that you can rotate 360°, download as GLB or USDZ (for iPhone and iPad), and open on a phone in AR through a QR code. The upload panel shows tips for taking a photo that reconstructs well. On a computer, **Use Phone** shows a QR code: take the photo on your phone and the model is generated on the computer.

The hidden sides are inferred by the AI, not measured, and sizes are estimates.

**Live demo:** https://vision3d-sigma.vercel.app. It only works while its backend laptop and tunnel are running; see [Deployment](#deployment).

## Stack

| Part | Technology |
|---|---|
| Frontend | Next.js App Router, TypeScript, Tailwind CSS, Google model-viewer, Three.js (wireframe) |
| Backend | FastAPI (Python 3.13), SQLite, local file storage, one in-process job queue |
| AI generation | TripoSR running locally on the Mac's GPU (`scripts/setup-local-triposr.sh`), with the community Hugging Face Space as an optional fallback |
| Hosting | Vercel Hobby (frontend), with `/api/*` proxied to the backend |

No login and no billing. Each browser gets an anonymous session cookie, and models are private to that session until shared with an expiring link.

## Local setup

Requires Python 3.13 and Node.js 24 (Corepack supplies the pinned pnpm), on macOS or Linux.

```sh
sh scripts/setup.sh
```

This creates `.venv`, installs the backend and frontend dependencies, and copies `backend/.env` and `frontend/.env.local` from the examples. It keeps existing env files.

To generate models locally, enable a provider in `backend/.env`. With no provider, the app runs but reports generation as unavailable.

```dotenv
VISION3D_COMMUNITY_DEMO=1   # public community TripoSR Space: free, but no uptime guarantee
```

Start both services:

```sh
# Terminal 1, from backend/
set -a; . ./.env; set +a
../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-proxy-headers --no-access-log

# Terminal 2, from frontend/
corepack pnpm dev
```

Open http://localhost:3000. The frontend reaches the backend through its same-origin `/api` proxy.

## Tests and checks

```sh
# Backend, from backend/
../.venv/bin/ruff check . && ../.venv/bin/python -m mypy app && ../.venv/bin/python -m pytest -q

# Frontend, from frontend/
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
```

The same checks run automatically on every pull request (GitHub Actions CI). A scheduled uptime check alerts by email when the deployed site or API is down; see [DEPLOYMENT.md](DEPLOYMENT.md#ci-and-uptime-alerts).

Live provider tests are opt-in because they send a public test photo to Hugging Face:

```sh
cd backend && VISION3D_RUN_LIVE=1 ../.venv/bin/python -m pytest -q tests/test_live.py -k shoes
```

## Deployment

Full, exact steps are in [DEPLOYMENT.md](DEPLOYMENT.md).

Vercel Hobby is for personal, non-commercial use. For client or commercial use, deploy from the owner's own Vercel account, on Pro if the use is commercial. Run the backend on a machine the owner controls.

In short:

- **Frontend: Vercel Hobby (free).**
  - Set the root directory to `frontend`. `frontend/vercel.json` pins the Next.js preset.
  - Set `VISION3D_BACKEND_ORIGIN`, `NEXT_PUBLIC_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_BASE_URL=/api` and `ENABLE_EXPERIMENTAL_COREPACK=1`, then run `vercel deploy --prod`.
  - Redeploy after changing any of these variables, because they're used at build time.
- **Backend: needs an always-on machine with a persistent disk.** Generation takes 1.5–2 minutes and models are kept on disk, so Vercel Functions and Render's free tier don't fit. There are two options:
  - **Demo (current):** run FastAPI on a laptop behind a free Cloudflare Quick Tunnel. The tunnel URL changes on every restart, and each new URL means updating `VISION3D_BACKEND_ORIGIN` and redeploying.
  - **Durable:** a Linux VM such as Oracle Cloud Always Free, using the systemd units and Caddyfile in `deploy/`. Caddy provides HTTPS. This setup is prepared but not yet tried on a server.

Check a deployment end to end. This makes a real generation request:

```sh
.venv/bin/python scripts/deployed_e2e.py https://your-project.vercel.app \
  verification/reconstruction/inputs/shoes.jpg verification/deployed/e2e.json
```

Keep provider tokens (`HF_TOKEN`) in the backend environment only, never in `NEXT_PUBLIC_*` variables, and never commit env files.

## Current status and limits

- **Generation:** about 26–29 s per photo with local TripoSR on an Apple M5, through the public URL (90–130 s on the community Space).
- **Sharing:** share links and the desktop QR handoff have been verified.
- **Phones:** AR on real iPhone and Android devices (Quick Look, Scene Viewer and WebXR) is **not yet tested**. See [AR_DEVICE_TESTING.md](AR_DEVICE_TESTING.md).
- **Provider:** generation depends on a community Hugging Face Space the project doesn't control. Hugging Face now needs a paid plan to create your own Gradio or Docker Space.

Details: [task.md](task.md) (progress), [HANDOFF.md](HANDOFF.md) (latest state), [AUDIT_REPORT.md](AUDIT_REPORT.md), [API.md](API.md).

# Vision3D engineering handoff

## Box mode and paid-model research — 28 November 2026

**Box mode** (`backend/app/box.py`, `mode=box`) is for packaging, books and phones.
- **Front:** the cut-out photo itself.
- **Other faces:** sides, back, top and bottom use the product's colour at each height, via the `row_colours` helper shared with round mode.
- **Depth:** estimated at 0.35 × the width, because one photo can't measure it.
- **UI:** the round switch is now a **Shape** select (AI, Round, Box) on PC and phone, listing only the modes `/health` reports (`round_mode`, `box_mode`).
- **Verified:**
  - Live: a carton on a plain background took 4.5 s through https://vision3d-sigma.vercel.app (`verification/round-mode/live-box.json`, renders in `verification/round-mode/`).
  - Tests: backend 37 (3 new), frontend 63.

**Paid image-to-3D options** (official pages, 28 Nov 2026; nothing was signed up for or spent):

| Option | Per textured model | Access | Commercial |
|---|---|---|---|
| fal.ai TRELLIS | $0.02 (texture price not stated) | pay-as-you-go, no subscription | allowed |
| Tripo API | ~$0.20–0.30 (+10–30 credits if the texture is charged separately) | credits at $0.01, non-refundable | paid users own outputs |
| fal.ai Hunyuan3D v2 textured | $0.48 | pay-as-you-go | allowed |
| Meshy API | not stated in USD | Pro plan ₹1,699/month billed yearly | Pro commercial licence |

Recommendation: test fal.ai first (no subscription; TRELLIS is cheap, Hunyuan3D textured is a quality benchmark). It would plug in as a hosted provider behind the existing consent flow. This needs your approval and an API key.

**Not done yet:** the optional back photo for round mode.

## Polish, round-object mode and warm TripoSR — 28 November 2026

**Polish:**
- **Consent:** `/health` reports `external_processing`. The PC panel and phone page show the consent checkbox only when a hosted provider could receive the photo. Otherwise they show a "processed on this server only" note. Consent stays required until health is known.
- **Elapsed time:** the generating view shows "Elapsed m:ss", counted from the job's server start time (`ElapsedTime.tsx`).
- **Friendly errors:** `lib/errorCopy.ts` turns codes into plain advice (e.g. QUEUE_FULL becomes "Vision3D is busy…"). The code stays visible. Photo-specific errors keep the server's detail.

**Round-object mode** (`backend/app/lathe.py`): for bottles, cans and jars.
- **Shape:** u2net cut-out, then the width at every row (median and moving-average smoothed), with a fitted axis so a tilted photo comes out upright. The profile is spun into 128 × 160 segments.
- **Texture:** the front ±50° is the photo itself, sampled where each surface point appears, so labels stay sharp. It blends into each row's own colour by 75°, so the back has no mirrored text.
- **API:** the `mode=round` form field on uploads and phone captures. `/health.round_mode` controls the switch.
- **Privacy:** it needs `LOCAL_TRIPOSR_HOME` and never sends the photo out, so no consent is needed.

**Warm TripoSR:** `infer.py --serve` keeps the model loaded. `jobs.WarmTripoSR` holds one process.
- It is killed on cancel or timeout, which a test with a hung fake process covers, and restarted on the next job.
- It is stopped on shutdown. A process from another event loop is killed by PID.
- Background removal stays a per-job step (OpenMP clash).

**Verified live through https://vision3d-sigma.vercel.app:**
- **Normal mode:** 26.1 s for a cold first job, then **20.2 s** with the model already loaded.
- **Round mode:** your bottle photo took **3.2 s** without consent: 40,960 triangles, 1.3 MB.

[Renders and UI screenshots](verification/round-mode) · [run data](verification/local-triposr/live-warm-and-round.json)

**Tests:**
- Backend: 35 (5 new: lathe proportions and colours, empty cut-out, round pipeline, round API and consent, hung-process timeout).
- Frontend: 62 (7 new).
- Ruff, mypy, tsc and eslint pass.
- Real Chrome checked the round switch, consent hiding, the `mode=round` upload and the timer.

**Limits:** round mode suits upright round objects shot from the front. The back is plain colour, not real. Non-round objects should use normal mode. The frontend changes need this PR merged before the live site shows them; the backend is already running this branch.

## Local TripoSR provider — 28 November 2026

Generation now runs on the Mac's GPU when `LOCAL_TRIPOSR_HOME` is set. The community Space becomes an automatic fallback if it is enabled.

**Setup and pipeline:**
- `scripts/setup-local-triposr.sh` installs a separate environment with pinned versions, the official TripoSR code at `107cefd`, a compiled `torchmcubes`, and both models.
- `backend/local_triposr/prep.py` runs u2net background removal in its own process, because rembg and torch load two OpenMP runtimes.
- `backend/local_triposr/infer.py` runs TripoSR on MPS, removes degenerate faces and bakes a 2048 px texture.

**macOS fixes in `infer.py`:**
- the marching-cubes volume goes to the CPU
- the texture baker's query points go to the model device
- the output is rotated to glTF Y-up, like TripoSR's demo

**Backend:**
- New `local` provider kind (`providers.invoke_local`). Child processes are killed on timeout or cancel, with no HF token and with offline Hugging Face.
- Provider chain: local, then the hosted Space, then optional Hunyuan.
- Consent is required only if a hosted provider is in the chain.

**Verified:**
- **Live:** a real sneaker through https://vision3d-sigma.vercel.app ran on `triposr-local` and succeeded in 29.0 s end to end (26.0 s in the backend), versus 127.6 s before. The result was 63,718 triangles, 3.9 MB, with a native texture. Share, range, cookie and delete checks passed ([evidence](verification/local-triposr)).
- **Tests:** 6 new backend tests (30 total) use a fake TripoSR environment: order, startup check, offline and no-token env, skipping background removal, failure mapping, consent scope. Ruff and mypy pass.

**Not verified:**
- The client's M1 Air: speed, and memory with 8 GB.
- Quality: same model as before. The baked texture is only slightly sharper (see the comparison renders), not photo-real.

**Known gap:** the UI consent checkbox still mentions the hosted provider even when only local is configured.

## Phone upload timeout fix — 27 November 2026

**Bug found on a real iPhone:** a 3024 × 4032 photo sent from `/capture/<token>` failed with "The server did not respond in time", and the photo never reached the backend.
- Every API request had a fixed 30 s limit, and the full-size photo (several MB) couldn't finish uploading over the phone → Vercel → tunnel path in that time.
- Photos over 10 MB were also rejected in the browser before they could be shrunk.

**Fix (`frontend/lib/uploadImage.ts`, `frontend/lib/api.ts`):**
- Desktop and phone uploads are re-encoded in the browser to at most 2048 px, as JPEG (PNG keeps transparency). The backend reduces inputs to 1024 px anyway.
- Re-encoding also drops EXIF location data on the device. The server still strips metadata as well.
- Uploads get a 120 s limit, with an "upload took too long" message. Other requests keep 30 s.
- The browser accepts originals up to 30 MB. The server's 10 MB limit applies to the shrunk upload.

**Verified:**
- Headless Chrome on the real `/create` page posted a 6.6 MB, 12 MP JPEG as a 1.8 MB, 1536 × 2048 JPEG with no EXIF, and an 11.8 MB photo as 1.9 MB.
- 55 frontend tests (6 new), tsc, eslint and the build pass.
- **Not yet re-tested on the iPhone.**

## Phone-to-desktop photo capture — 27 November 2026

On a computer, **Use Phone** next to Browse Files and Take Photo opens a QR code; the button shows from tablet width up. Scanning it opens `/capture/<token>` on the phone. There you take a photo or pick one from the gallery, see the photo tips, tick consent and tap **Send to Computer**. The computer then switches to the normal generation progress through `/create?job=<id>`, and the model appears there.

**Backend:**
- A `captures` table stores hashed tokens, the owner session, the expiry and the `job_id`.
- There are four `/v1/captures` endpoints (see [API.md](API.md)).
- Desktop uploads and phone uploads now share one `start_job` helper, so validation can't drift apart.

**Frontend:**
- `PhoneCaptureDialog.tsx`: the QR dialog, which polls every 2 s and offers a fresh code when one expires.
- `app/capture/[token]/page.tsx`: the phone page.
- New `lib/api.ts` client functions.
- `/capture/:token` gets no-store, no-referrer, noindex and camera-permission headers.

**Verified:**
- Backend: 24 tests (2 new: single use, desktop-only job ownership, consent and origin checks, expiry, missing public origin), ruff and mypy pass.
- Frontend: 49 tests (6 new), tsc, eslint and `next build` pass.
- End to end through a public Quick Tunnel, using the real API with the archived-GLB fixture runner:
  - a desktop Chrome QR decoded to the capture URL
  - a separate phone-profile Chrome with no cookies sent a photo
  - the desktop switched to the job and showed the finished model
  - reusing the link was blocked
  - no page errors on either side

[evidence](verification/phone-capture)

**Not verified:**
- Scanning with a physical phone and the phone's real camera.
- A live AI run on a phone-sent photo.
- The live Vercel site doesn't have this until this branch is merged and redeployed.

**Known limitation:** the phone page always uses background removal (the backend default). It doesn't copy the desktop's toggle.

## Photo guidance and USDZ download — 27 November 2026

**Photo guidance:** `frontend/components/upload/PhotoTips.tsx` adds a "For the best 3D result" checklist under the upload area in `ImageInputPanel`. It covers:
- one object, fully in frame
- a plain, contrasting background
- soft, even light
- a 3/4 angle from slightly above
- avoiding glass, shiny or see-through objects and busy scenes

**USDZ download:** the export dialog now has **Download USDZ** for generated models.
- `frontend/lib/usdz.ts` loads the GLB and converts it in the browser with three.js's `USDZExporter`. That's the converter model-viewer uses for iPhone Quick Look. It needs no backend change and no new dependency.
- Conversion errors show in the dialog and can be retried.
- If the backend ever returns a `usdz_url`, the existing direct link is used instead.

**Verified:**
- Headless Chrome against the local app, with API responses stubbed, converted a real baked-texture TripoSR model (63,725 triangles) in 0.35 s. The resulting 6.5 MB USDZ passed `usdchecker --arkit` with its texture embedded. [evidence](verification/usdz-export)
- The tips render at 1280 and 375 px without horizontal overflow.
- Frontend: 43 tests (Node conversion test, dialog success and failure, tips), tsc, eslint and `next build` pass.

**Not verified:** opening the downloaded `.usdz` on a physical iPhone or iPad. The live Vercel site doesn't have these changes until it's redeployed.

## Production deployment — 27 November 2026

**Live:** https://vision3d-sigma.vercel.app on Vercel Hobby (project `vision3d`). The backend is FastAPI on the presenter's Mac, exposed through a Cloudflare Quick Tunnel, using the community TripoSR Space. No paid service was enabled. Exact steps are in [DEPLOYMENT.md](DEPLOYMENT.md).

**Verified through the public URL** ([evidence](verification/deployed)):
- **Upload size:** an 8.9 MB upload passed Vercel's external rewrite, and a 20 MB upload got the backend's structured `413`.
- **Generation:** a real photo produced a 63,725-triangle model with a baked texture: 127.6 s via `scripts/deployed_e2e.py`, and 89.7 s via the browser UI.
- **Cookie-free sharing:** a guest loaded the share page and the GLB: `model/gltf-binary`, `no-store`, CORS `*`, HEAD and a `206` range response. The private GLB returns `404` without the owner's cookie. Deleting the model revoked the share.
- **QR handoff:** the desktop QR, decoded in Chrome, matches the displayed `https://vision3d-sigma.vercel.app/ar/<token>`. That page loaded the model in a new tab and showed the 360° fallback, because desktop has no native AR.

**Added in this phase:**
- `frontend/vercel.json`: pins the Next.js preset. The CLI-created project had defaulted to "Other" and served 404.
- Node 24 and pnpm 11.20.0 pinned in `package.json`.
- `scripts/setup.sh`: verified from a clean copy, followed by lint, typecheck, 38 tests and a production build.
- `scripts/deployed_e2e.py`.
- `deploy/`: systemd API and health units, plus a Caddyfile. Not yet exercised on a server.
- `QUEUE_LIMIT` and `UPLOADS_PER_MINUTE` are now read from the environment, with a test. The backend suite passes 22 tests.

**Limits and risks:**
- **Laptop dependency:** the tunnel URL changes on every restart, and each change needs `VISION3D_BACKEND_ORIGIN` updated and a Vercel redeploy. The laptop must stay awake.
- **Shared upload limit:** all tunnel traffic shares one upload rate-limit bucket.
- **Poll stalls:** one poll per job stalled for 30–60 s on the Vercel → tunnel path. The frontend's retry absorbed it.
- **No free owned Space:** Hugging Face now requires a paid plan to create Gradio or Docker Spaces, so a free owned TripoSR Space is no longer possible.
- **Oracle Cloud reclamation:** Always Free can reclaim instances that stay idle for 7 days.

**Still open:**
- A durable backend (Oracle Cloud Always Free plus systemd and Caddy, as in `deploy/`), which needs your account.
- Scanning the QR with real phones, and Quick Look, Scene Viewer and WebXR on devices.
- The phone-width layout from a QR scan. The Chrome window would not resize in this run.

## Final visual & UX audit — 27 November 2026

Completed the final visual and UX audit of the Vision3D production build against [design-reference.png](design-reference.png) across `1440×900`, `1280×800`, `768×1024`, and `390×844` with live FastAPI connected (`Connected (ok)`, `TripoSR community demo`). Full report in [VISUAL_REVIEW.md](VISUAL_REVIEW.md).

- **Verified**: Zero horizontal overflow across all 4 breakpoints and all 7 routes (`/`, `/create`, `/create?sample=1`, `/models`, `/models/sample`, `/ar/sample`, `/settings`), zero JS console errors, zero WebGL errors, all 3 dialogs (`ExportDialog`, `QrArDialog`, `CameraCaptureDialog`), `Textured`/`Wireframe` switching, camera presets, and settings controls.
- **Refinements applied**: Raised `--text-muted` to `#938F8B` (`>= 5.3:1` WCAG AA contrast), tightened Landing hero heading scale and matched studio `<model-viewer>` lighting, unified left toolbar `top-3` clearance and `36px` shading pill height, made desktop sidebar `lg:sticky lg:h-dvh` for `1280×800` laptop viewports, tuned `390×844` mobile viewport fold height, and removed mobile title ellipsis truncation on `/models/[id]`.
- **Checks**: `pnpm typecheck`, `pnpm lint`, `pnpm test` (38/38 Vitest tests across 7 files), and `pnpm build` all exited 0 after the final edits. No backend contracts were modified.

## Audit resolution — 27 November 2026

The audit code fixes, affected files, regression tests and open findings are tracked in [AUDIT_RESOLUTION.md](AUDIT_RESOLUTION.md). The production browser regression ran locally over HTTPS, verified upload through download and cookie-free sharing, and recorded 375–1440px screenshots and a wireframe capture. It uses a fixture runner with an archived real GLB. Separately, fresh live community TripoSR succeeded in 83.64 seconds.

Release gates remain open for an operator-owned Hugging Face Space and physical iPhone/Android AR over public HTTPS. The owned-provider smoke test now uses `TRIPOSR_SPACE` when configured. Run with a team-controlled Space before depending on it. The [physical device checklist](AR_DEVICE_TESTING.md) remains pending, including older-iPhone USDZ memory checks.

The backend now prunes retained data while running. For per-client upload limits behind a public edge, follow the trust and header-replacement contract in [DEPLOYMENT.md](DEPLOYMENT.md). Keep the option disabled until that rule is enforced and verified.

## Independent audit — 27 November 2026

A full code, security and QA audit is recorded in [AUDIT_REPORT.md](AUDIT_REPORT.md). No application code was changed. Another session was editing frontend files during the audit, so the report describes a snapshot of the working copy.

**Re-run by the audit:**
- Backend: pytest passed 12 tests with 3 live tests skipped; ruff, strict mypy, pip check and pip-audit were clean.
- Frontend: tsc, eslint, all 36 Vitest tests and `next build` passed.
- `pnpm audit` reports four `postcss` advisories through `next`.
- Coverage was not measured. No live inference, browser end-to-end run, device AR or accessibility scan was run.

**No faking found.** Progress is always null and stages are real. The one bundled sample GLB is labelled wherever it appears and is never used for a failed job. No placeholder buttons or settings the providers can't support were found. `HF_TOKEN` stays in the backend.

**Critical:**
- AR has not been tested on a physical phone, and nothing has been deployed to a public HTTPS origin.
- Generation still depends on the unowned community TripoSR Space.

**High:**
- `AbortSignal.any` in `frontend/lib/api.ts` breaks every API call on iOS Safari before 17.4, including the shared AR page.
- The 300 s job deadline includes time spent waiting in the queue, so a job queued behind two others almost certainly times out.
- The backend and the current frontend are not committed to git. Some task.md ticks have no reproducible evidence: the 1440/834/390 layouts and the wireframe check.

**Medium:**
- The upload rate limit behind the proxy is unverified.
- Retention cleanup runs only at startup.
- Icon buttons are 32–40 px, below the 44 px tap-target floor.
- There is no coverage measurement and no committed E2E test.
- The `postcss` advisories need a `next` upgrade.
- No CSP, `nosniff` or frame headers are set.

**H1 fixed after the audit.**
- `timedSignal()` in `frontend/lib/api.ts` replaces both `AbortSignal.any` and `AbortSignal.timeout`, using an `AbortController` and `setTimeout`. Its listeners and timers are cleaned up after each request.
- `frontend/__tests__/abort-compat.test.ts` deletes both APIs before running. It failed before the change and passes after it.
- Re-checked: frontend 38 of 38 tests, tsc, eslint and `next build` pass; backend 21 tests pass with 3 skipped, and ruff and mypy are clean.
- Not checked on a physical older iPhone.

**Next steps, in order:**
1. Commit the work once the other session stops.
2. Provision and verify an owned Space.
3. Run [AR_DEVICE_TESTING.md](AR_DEVICE_TESTING.md) on an iPhone and an ARCore Android phone over a public HTTPS origin.

## Mobile camera, QR & AR UX polish — 27 November 2026

Reviewed and refined the complete mobile camera, desktop QR handoff, mobile AR preview, and touch-navigation experience across [CameraCaptureDialog.tsx](frontend/components/upload/CameraCaptureDialog.tsx), [ImageInputPanel.tsx](frontend/components/upload/ImageInputPanel.tsx), [QrArDialog.tsx](frontend/components/ar-dialog/QrArDialog.tsx), [app/ar/[token]/page.tsx](frontend/app/ar/%5Btoken%5D/page.tsx), [AppShell.tsx](frontend/components/sidebar/AppShell.tsx), and [ModelViewport.tsx](frontend/components/viewer/ModelViewport.tsx), preserving the Obsidian Black (`#101011`), Charcoal (`#19191B`), and Copper Orange (`#F79448`) identity and all existing security/AR URL checks.

- **Mobile image capture & permission UX**: Added calm waiting-for-permission viewfinder state, subtle copper corner framing brackets, immediate camera-track shutdown on capture, an in-dialog **Review Captured Photo** preview (`W × H · JPEG` badge with `Retake` vs `Use Photo`), and explicit iOS Safari / Android Chrome permission recovery steps on denial alongside Gallery and native `capture="environment"` fallbacks.
- **Desktop QR handoff (`QrArDialog.tsx`)**: Refined `"View in Your Space"` (`Phone AR Handoff`) dialog with a framed Ivory quiet-zone QR card, live remaining-time badge, concise 2-step scan instructions, localhost HTTPS guard, and honest iOS Quick Look / Android ARCore disclosure (no fake in-AR controls).
- **Mobile AR preview (`app/ar/[token]/page.tsx`)**: Upgraded `<model-viewer>` to neutral studio environment lighting (`environment-image="neutral"`, `tone-mapping="commerce"`, `shadow-intensity="1.25"`), subtle 360° floor ring, GLB download loading overlay, touch-friendly `Perspective | Front | Rear | Side` + `Reset` + `Auto Rotate` controls, full-width `52px` Copper **`View in Your Space`** button with platform runtime copy when AR is supported, and a calm **Interactive 360° Preview** fallback card with iPhone Safari & Android Chrome AR compatibility notes + `44px` `Download GLB` button when unsupported.
- **Mobile navigation & touch ergonomics**: Added `env(safe-area-inset-bottom)` padding and a top copper active indicator bar to the mobile bottom navigation bar, plus horizontally scrollable `36px+` touch camera presets in the main workspace.
- **Verification**: `pnpm typecheck`, `pnpm lint`, `pnpm test` (36/36 Vitest tests across 6 files, including new [ar-ux.test.tsx](frontend/__tests__/ar-ux.test.tsx)), and `pnpm build` all exited 0. Browser QA verified Desktop and Mobile (`390×844`) across `/create?sample=1`, QR dialog, Camera Capture dialog (live stream), and `/ar/sample` with zero console errors, clean `inline-end` toolbar tooltip positioning, and zero horizontal overflow. Physical iPhone/Android AR device testing over a public HTTPS origin remains pending per [AR_DEVICE_TESTING.md](AR_DEVICE_TESTING.md).

## Production interactive 3D viewer — 27 November 2026

Implemented the production interactive 3D viewer across [frontend/components/viewer](frontend/components/viewer) and [frontend/app/models/[id]/page.tsx](frontend/app/models/%5Bid%5D/page.tsx) using Google `<model-viewer>` and a lazy-loaded Three.js wireframe canvas (`three` + `GLTFLoader` + `OrbitControls`).

- **Viewer capabilities**:
  - **Textured mode (`<model-viewer>`)**: Full 360° rotation, mouse and touch controls, zoom (`field-of-view` controls + scroll/pinch), primary-drag Pan mode (plus native Shift+drag / two-finger pan), auto-rotation, reset camera, fullscreen, realistic neutral studio environment lighting (`environment-image="neutral"`, `tone-mapping="commerce"`), and soft ground shadows (`shadow-intensity="1.25"`, `shadow-softness="0.82"`).
  - **Camera presets**: `Perspective`, `Front`, `Rear`, and `Side` view presets synchronized across both Textured and Wireframe renderers.
  - **Wireframe mode (`ThreeWireframeCanvas.tsx`)**: Real Three.js WebGL wireframe overlay (Copper `#F79448` wireframe over obsidian occluded mesh + ground shadow plane) fetched with session credentials (`credentials: "include"`), with explicit cleanup of geometries, materials, textures, controls, `ResizeObserver`, `requestAnimationFrame`, and WebGL context (`renderer.forceContextLoss()`) on model switch or unmount.
  - **Actual model metadata & loading/error states**: Displays real server-reported `triangles`, `vertices`, `bounds_extent`, `appearance`, `provider`, and `byte_size` (augmented by `<model-viewer>` `getDimensions()` / Three.js mesh counts only when server stats are absent, never fabricated), plus loading spinners and retryable error states.
- **Live multi-model browser verification**:
  - Verified against live FastAPI (`VISION3D_COMMUNITY_DEMO=1`, isolated temp data dir) + Next.js production server through `/api/*`:
    - **Sneaker (`shoe.jpg`)**: Generated real `2.68 MB` GLB (`69,614` tris, `53,669` verts, `0.83 × 0.75 × 0.49 u`, `Baked Texture`). Verified Textured + Wireframe rendering, Front/Rear/Side/Perspective views, Orbit/Pan/Zoom/Auto-Rotate/Reset controls.
    - **Chair (`chair.png`)**: Generated real `2.88 MB` GLB (`82,564` tris, `61,900` verts, `0.56 × 1.03 × 0.57 u`, `Baked Texture`). Verified clean model switching, metadata updates, Textured + Wireframe rendering, `/models` library, `/models/[id]` detail view, and `390×844` mobile layout with zero JS or WebGL console errors.
  - Automated checks: `pnpm typecheck`, `pnpm lint`, `pnpm test` (34/34 Vitest tests across 5 files), and `pnpm build` all exited 0.

## Mobile capture and AR integration — 27 November 2026

**Camera:** Take Photo requests browser permission and prefers the rear camera. Capture converts the frame to JPEG and goes through the same preview, validation, consent and FastAPI generation path as gallery uploads. Tracks stop on capture, close or page exit. Denial shows a recovery message, gallery selection and the native capture picker.

**Sharing:** The desktop QR encodes a unique, validated HTTPS share link. The model stays private to its session except through the expiring read-only token. The mobile page loads that exact model without an owner cookie. Expired links cannot keep serving bytes, and deleting the model revokes its shares. The shared GLB supports byte ranges, public-asset CORS and attachment download.

**AR:** Google Model Viewer selects WebXR, Android Scene Viewer or iOS Quick Look based on the device. It uses horizontal placement and runtime-managed tracking, rotation and scaling. On Quick Look launch it converts the textured GLB to a USDZ blob in the browser. Unsupported browsers and AR launch failures keep the 360° model available. Vision3D needs no separate mobile app. Android native AR depends on the phone's supported Google runtime.

**Verified:** On isolated local HTTPS, Chromium captured a JPEG from a test-camera feed of a public sneaker photo, stopped camera tracks, and submitted the image to live CPU TripoSR. The job succeeded in 104.89 seconds. A browser-injected denial exercised the gallery fallback. The desktop QR decoded to the issued URL, an independent cookie-free browser loaded the exact GLB at 375px, and the file endpoint returned the correct MIME and range response. Model Viewer produced an embedded-texture USDZ that passed `usdchecker --arkit --strict`. [Verification artifacts](verification/mobile)

**Pending manual verification:** Public-network reachability and physical iPhone/Android camera behavior, Quick Look launch and texture appearance, WebXR and Scene Viewer placement, tracking and gestures. Use the [physical-device checklist](AR_DEVICE_TESTING.md). The browser test used a local HTTPS stand-in and did not create a public tunnel. Frontend lint, type checking, 34 Vitest tests and the production build passed. Backend Ruff, strict mypy and 12 tests passed.

For deployment, set `PUBLIC_APP_URL` to the same publicly reachable HTTPS origin serving Next.js and route `/api/*` to FastAPI. Keep the frontend API base at `/api`. Use that origin for the QR and both phones. The backend returns a structured error when sharing is attempted without its public URL configured.

## Live frontend integration — 27 November 2026

The frontend uses the FastAPI session through the Next.js `/api/*` rewrite. Uploads send the selected photo, supported provider options, and explicit external-processing consent. Once FastAPI accepts the job, the workspace uses `/create?job=<job_id>` so a browser reload can resume polling. The workspace shows server stages with indeterminate progress, retries transient polling failures within a deadline, and uses the cancellation endpoint for active jobs. A terminal failure requires a new upload, while a polling or model-retrieval error can recheck the same job.

My Models reads generated assets and paginated generation history from FastAPI under the anonymous session cookie. The library refreshes on navigation, window focus, manual refresh, and deletion. The details page and export dialog display returned metadata. Private GLBs use the same-origin proxy for viewing and download, even when local FastAPI returns an absolute loopback URL. The export dialog checks the GLB signature and reports failed downloads. The bundled sample is still explicitly labeled and separate from generated records.

### Run both services

Use the backend setup below, then from `frontend/` run:

```sh
VISION3D_BACKEND_ORIGIN=http://127.0.0.1:8000 npm run dev
```

Open `http://localhost:3000/create`. The backend needs a configured provider. For the verified free demo, start FastAPI with `VISION3D_COMMUNITY_DEMO=1` and keep the frontend API base at its default `/api`. For public deployment, set the public HTTPS origin on the backend and use the same-origin rewrite. No provider credentials belong in frontend variables.

### Integration verification

- Chrome submitted a real sneaker JPEG with consent through Next.js to FastAPI. FastAPI returned 202. Polling resumed after a browser reload, and TripoSR completed in 103.2 seconds with no reported percentage.
- The browser loaded that job’s generated model and exported its **2,608,380-byte** GLB with **63,725 triangles** and a baked texture. Khronos reported zero errors and zero warnings. The first browser harness stopped on a viewer-property assertion, so validation and download continued against the same persisted job and isolated test session.
- The library showed the generated record and completed history after reload. A separate live job returned 200 from cancellation and remained in history as Cancelled. A repeat provider call returned TIMEOUT. The UI surfaced the failure, allowed selecting a fresh image for retry, and showed no model for that failed job.
- Checked 375px and 1280px layouts, keyboard focus through the upload controls, and no viewer-toolbar overlap with the success banner. No paid inference or physical phone AR test was performed.

Frontend lint, strict type checking, all 22 Vitest tests, and the production build passed. Artifacts, API response trace, GLB, and validator report are in [verification/frontend-live](verification/frontend-live).

## Frontend design system & all 13 screens — 27 November 2026

Implemented the complete Vision3D frontend in [frontend](frontend) (Next.js App Router, strict TypeScript, Tailwind CSS v4) preserving the approved Obsidian (`#101011`), Charcoal (`#19191B`), Copper Orange (`#F79448`), Ivory (`#F5F3F0`), and Muted Silver (`#A6A3A0`) visual identity from [design-reference.png](design-reference.png) and [DESIGN.md](DESIGN.md). Backend code in [backend](backend) was not modified.

- **Completed screens**:
  1. **Landing page** (`/`) — compact nav, hero split with live interactive sample `<model-viewer>`, 3-step workflow strip, zero pricing/credit fluff.
  2. **Main image-to-3D workspace** (`/create`) — dominant central viewport, compact sidebar (desktop) / inline nav tabs (tablet) / bottom nav (mobile), right settings panel closely matching `design-reference.png`.
  3. **Image upload & preview** — drag-and-drop, file picker, mobile camera capture (`capture="environment"`), JPEG/PNG/WebP + 10 MB + decoded dimension validation, thumbnail preview, replace/clear.
  4. **Generation settings** — strictly provider-capability-gated (`GET /health`); only exposes provider selector when 2+ verified providers exist and background removal when supported, plus required `allow_external_processing` consent checkbox.
  5. **Generation progress** — semantic indeterminate/determinate `<progress>` bar, stage label, spinner, and `Cancel Job` (`DELETE /v1/jobs/{id}`).
  6. **Interactive 3D workspace** — client-only `<model-viewer>`, floating glass toolbar (Orbit, Pan, Zoom In/Out, Reset, Fullscreen with tooltips), 360° floor ring, `Auto Rotate` switch, `360°` reset, `View in AR`, and `Download` (Export Dialog).
  7. **Model library** (`/models`) — session-scoped list (`GET /v1/models`), offline/empty states, delete confirmation `<dialog>`, Export/AR triggers, and explicitly labeled local Sample 3D Asset section.
  8. **Model details** (`/models/[id]` & `/models/sample`) — interactive 3D preview, honest asset specifications (`id`, format, size, appearance, triangles, vertices, extents, provider when returned), Open in Studio, Export GLB, View in AR, and delete confirmation.
  9. **Export dialog** ([ExportDialog.tsx](frontend/components/export-dialog/ExportDialog.tsx)) — native `<dialog>` showing verified `.glb` specs, Copy Asset URL, Download GLB (`?download=true` for private models), and honest disclosure that USDZ/OBJ/STL are not enabled unless provided.
  10. **Mobile AR entry screen** (`/ar/[token]` & `/ar/sample`) — `<model-viewer ar ar-modes="webxr scene-viewer quick-look">`, `canActivateAR` detection with 3D fallback banner, scale disclaimer, 42px `Download GLB` button, and expired-link error state.
  11. **Desktop QR code dialog** ([QrArDialog.tsx](frontend/components/ar-dialog/QrArDialog.tsx)) — native `<dialog>` generating SVG QR codes for HTTPS public URLs while refusing to silently encode `localhost`.
  12. **Settings** (`/settings`) — live `/health` diagnostics, API/AR origin status, verified provider list, auto-rotate default (respecting `prefers-reduced-motion`), and privacy/retention disclosures.
  13. **Empty, loading, error & success states** — reusable `Spinner`, `ProgressBar`, `Skeleton`, `AlertBanner`, `ErrorState`, and generation success banner.
- **Reusable UI design system (`frontend/components/ui/`)**: `Button`, `TextInput`, `Checkbox`, `Select`, `CopperSwitch`, `Dialog`, `Tooltip`, `Spinner`, `ProgressBar`, `Skeleton`, `Badge`, `AlertBanner`, `ErrorState`.
- **Same-origin proxy**: [frontend/next.config.ts](frontend/next.config.ts) rewrites `/api/*` to `VISION3D_BACKEND_ORIGIN` (default `http://127.0.0.1:8000`) for iOS Safari session-cookie compatibility.
- **Verification**: `pnpm typecheck`, `pnpm lint`, `pnpm test` (17/17 Vitest tests), and `pnpm build` all exited 0. Browser QA verified every route at Desktop (`1440×900`) and Mobile (`390×844`) with zero JS/React console errors and zero horizontal overflow.
- **Remaining integration work**:
  - Run live end-to-end frontend → FastAPI upload, consent, polling, cancel, GLB view, download, and deletion with `VISION3D_COMMUNITY_DEMO=1` (or an owned TripoSR Space) running on port 8000.
  - Configure an HTTPS tunnel or deployed HTTPS origin (`PUBLIC_APP_URL` + `NEXT_PUBLIC_PUBLIC_APP_URL`) and test QR scanning + AR placement/scaling on physical iPhone Safari (Quick Look) and ARCore Android Chrome (Scene Viewer / WebXR).
  - Provision an operator-owned TripoSR Space for demo reliability and update `README.md` with final setup and device test results.

## Backend delivery — 27 November 2026

FastAPI is implemented in [backend](backend). The service runs as one process with one active generation slot, a bounded local queue, SQLite records and private local GLBs. Jobs are persisted and interrupted jobs become terminal on restart. The service strips EXIF and other metadata before upload, restricts upload and model sizes, applies a per-IP upload limit, and requires explicit consent for Hugging Face processing. Provider credentials stay in the backend worker.

The TripoSR worker now unwraps the inferred vertex colors and bakes them into an embedded PNG base-color texture. The API labels this `baked_texture`. This closes the texture-file gap from the review without claiming photographic detail or measured dimensions. Valid GLBs are limited to 100,000 triangles and 10 MB by default. Hunyuan is an opt-in shape-only fallback with cleanup and a distinct `shape_only` label. It remains subject to the provider license and shared ZeroGPU quota.

The preferred deployment primary is an operator-owned, API-compatible free TripoSR Space configured through `TRIPOSR_SPACE`. This hook is implemented. An owned Space has not been provisioned or verified. The successful live tests used the opt-in public CPU community Space. Cookie-free shared GLB URLs and expiry were tested against the API. Phone reachability, Android Scene Viewer, iPhone Quick Look and USDZ remain unverified.

### Start the backend

From the repository root:

```sh
cd backend
python3.13 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements-dev.txt
VISION3D_COMMUNITY_DEMO=1 uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Open `http://localhost:8000/docs` or fetch `/openapi.json`. For an owned Space, use [backend/.env.example](backend/.env.example) and supply any required `HF_TOKEN` only to the backend environment. Run one process per data directory. Keep access logging off or redact share-token paths. Set `PUBLIC_APP_URL` to a public HTTPS origin and have the deployment proxy map its `/api/*` to this service, stripping `/api`. For direct local calls use the backend URL. The frontend integration above now sends consent and uses the same-origin proxy.

Example upload and poll with an anonymous cookie jar:

```sh
curl -c /tmp/vision3d.cookies -F 'allow_external_processing=true' \
  -F 'image=@../verification/reconstruction/inputs/shoes.jpg' \
  http://localhost:8000/v1/jobs
curl -b /tmp/vision3d.cookies http://localhost:8000/v1/jobs/JOB_ID
```

| Area | Endpoints |
|---|---|
| Health and schema | GET /health, /health/live, /health/ready, /docs, /openapi.json |
| Jobs | POST /v1/jobs, GET /v1/jobs, GET or DELETE /v1/jobs/{id} |
| Models | GET /v1/models, GET or DELETE /v1/models/{id}, GET or HEAD /v1/models/{id}/glb, optional ?download=true |
| Sharing | POST /v1/models/{id}/share, GET /v1/share/{token}, GET or HEAD /v1/share/{token}/glb |

See [API.md](API.md) for the canonical wire shapes. Share creation requires a configured public HTTPS origin. The private asset endpoints require the session cookie.

### Verification

From `backend/`:

```sh
ruff check app tests
mypy app tests
python -m pytest -q
VISION3D_RUN_LIVE=1 python -m pytest -q tests/test_live.py
VISION3D_RUN_LIVE_FALLBACK=1 python -m pytest -q tests/test_live.py -k fallback
```

The default suite passed 12 tests, with three live tests skipped unless enabled. Ruff, strict mypy, dependency checks and Uvicorn HTTP checks also passed. The two opt-in public CPU integration cases passed from POST upload through real inference, texture baking, metadata, download and deletion. The sneaker took 106.81 s and produced a 2.61 MB GLB with 63,725 triangles. The chair took 99.70 s and produced a 3.00 MB GLB with 82,911 triangles. Both downloaded assets passed the Khronos validator with zero errors or warnings and rendered through 360° in desktop Chrome. [Live artifacts and reports](verification/backend-live)

The opt-in Hunyuan fallback test induced a primary failure and contacted the real fallback. It received `QUOTA_EXCEEDED` and published no model. The controlled tests cover a successful fallback and bounded retry. Offline post-processing of a previously generated Hunyuan model yielded a shape-only GLB with 99,897 triangles. No paid API ran.

Worker cancellation is immediate for API state and prevents asset publication. Cancellation at the hosted provider is best effort. The queue is local to one process, and retention pruning runs at startup and periodically. A token or owned Space configuration cannot guarantee free public capacity. Native AR acceptance still requires compatible phones and the HTTPS proxy path.

## Prior geometry proof of concept

27 November 2026. The live proof of concept saved five GLBs across a chair, sneaker, headphones and a photo of toys. All five passed geometry validation and a desktop Chrome orbit through 360°. Hunyuan generated shape-only GLBs for the chair, sneaker and headphones. The community CPU TripoSR endpoint generated GLBs with vertex colors and OBJ files for the sneaker and toys.

For the geometry demo, use community CPU TripoSR as primary and Hunyuan3D-2 shape-only as the quota-dependent fallback. Hunyuan's textured route failed upstream. No tested route met the MVP's textured GLB requirement.

Start with [AI_RESEARCH.md](AI_RESEARCH.md) for provider coverage, licenses, timing and reproduction. The probe, validators, public input provenance and downloaded artifacts are under [verification/reconstruction](verification/reconstruction). Earlier Stability AI evidence is in [verification/phase0/RESULTS.md](verification/phase0/RESULTS.md).

At the time of this earlier spike, backend integration was pending at the feasibility gate. The desktop browser orbit was verified. Device AR and USDZ are pending. That spike called for a repeatable textured GLB route and a single-object toy photo. The backend now verifies the texture-baking route. The single-object toy test remains open. A free-account Hugging Face token is a possible follow-up only after its available quota is known. Treat two ZeroGPU Spaces as sharing a failure domain when considering fallback.

The probe and validation code passed Ruff and strict mypy. Existing frontend lint, type checking and 13 tests passed. No UI changes were required for this proof of concept.

## Architecture review — 27 November 2026

An independent review is recorded in [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md). No application code was changed. Frontend checks were re-run: `tsc --noEmit` passed, `eslint .` was clean, and `vitest run` passed 13 of 13 tests. No provider, device or AR tests were run.

The review found three critical issues:

- No route produces a textured mesh. The best route gives vertex colours only.
- The primary route is an anonymous community Space that the project does not control.
- Mobile AR is untested. Quick Look's on-device USDZ conversion will likely lose vertex colours.

The high-severity issues are:

- Cross-origin session cookies will be blocked on iOS Safari. Fix this with a same-origin `/api` proxy through Next.js rewrites.
- `glb_url` must be an absolute public HTTPS URL.
- The Hunyuan meshes are too heavy for phones. Clean them up and decimate them.
- EXIF and GPS data must be stripped before images go to third parties.
- The planned durable queue, Supabase, signed URLs and provider fallback are unnecessary for a college demo.

The recommended simpler shape is a single FastAPI process with:

- an in-process task at concurrency 1
- SQLite and local disk
- one provider
- one HTTPS tunnel for the UI, the API and the GLBs

The blockers are now:

1. The owner or guide decides whether a vertex-coloured mesh meets the MVP bar.
2. Choose an owned generation route: either duplicate the TripoSR Space into the team's account or run TripoSR locally.
3. Test `/ar/sample` and one real GLB on an iPhone and an ARCore Android phone over HTTPS.
4. Add a clean single-object toy photo and a cluttered photo as test inputs.
5. Fix the contracts before building the backend.

This was the review order before the backend phase. Current status is above.

## Open issues from the independent audit — 28 November 2026

See [AUDIT_REPORT.md](AUDIT_REPORT.md). Fixed and tested in this audit: A-1 (stale model reply after a cancel during load) and A-2 (fallback now logged). Remaining:

- [ ] A-5 (P1): set up a named Cloudflare tunnel so the site survives restarts (owner: needs a domain)
- [ ] A-6 (P1): run AR_DEVICE_TESTING.md on one iPhone and one ARCore Android phone
- [ ] A-3 (P2): stop TripoSR fallback failing on outputs over 100k triangles (approve option a or b)
- [ ] S-1 (P2): per-visitor upload rate limit behind Vercel and the tunnel (approve design)
- [ ] S-2 (P2): hide `/docs` and `/openapi.json` on the public backend
- [ ] S-3 (P2): decide the community Space fallback: turn it off, or reword the consent
- [ ] A-2 UI (P2): show which model made the result, with a note when it was the backup
- [ ] A-11 (P3): raise `/create` buttons and the consent checkbox to 44 px hit areas
- [ ] A-12 (P3): decide whether before/after comparison and a geometry mode are wanted
- [ ] Test in a current Firefox and in Safari on a Mac and an iPhone; install a frontend coverage tool

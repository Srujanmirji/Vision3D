# Implementation checklist
Mark tasks complete only after verification.

## AR and release rehearsal — 28 November 2026

- [x] Review the latest remote audit and apply the worker cancellation, protocol recovery and TripoSR geometry-budget fixes. Verify the two-request queue with real local inference.
- [x] Check desktop GLB and USDZ download, the SDK's Quick Look package and the guest 3D fallback. Cover share expiry and owner-only revocation in the backend suite.
- [x] Exercise a live Quick Tunnel outage and restore the Vercel alias to a healthy backend origin. Separate worker status from API reachability and test supervisor and status-poll recovery.
- [x] Rerun the live rehearsal after restoration. Verify SF3D, browser downloads, decoded QR, cookie-free asset delivery and revocation after deletion. Verify the public camera UI with a browser fixture.
- [x] Measure cold startup, warm inference, texture work, sampled memory, CPU and system GPU activity on the M5.
- [ ] Provision and verify a named Cloudflare route with a stable hostname. The public rehearsal uses a Quick Tunnel.
- [ ] Record hands-on iPhone and Android outcomes, including scan, placement, tracking, rotation, scaling and return over separate networks.

See [RELEASE_REPORT.md](RELEASE_REPORT.md), [AR_DEVICE_TESTING.md](AR_DEVICE_TESTING.md) and [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md).

## Workspace & 3D inspection UX improvements — 28 November 2026

- [x] Replace the full-width emerald generation banner with a compact inline status pill (`role="status"`, `"3D model generated and validated."`, and `Details` link) inside the viewport top bar.
- [x] Add side-by-side Before (`Source 2D`, with `Photo`/`Cutout` toggle when a reviewed mask exists and `Align 3D Front`) and After (`3D Model`) comparison without unmounting the 3D canvas or re-fetching the GLB.
- [x] Upgrade local SF3D background-removal preview and mask editing (`POST /v1/preprocessing/foreground` and `foreground_mask` on `POST /v1/jobs`) with `Fine`/`Medium`/`Broad` brush presets, `Show cutout`/`Show mask` view toggle, dark checkerboard transparency backdrop, reviewed cutout preview badge in `ImageInputPanel`, and preserved `44px` touch targets and keyboard `Tab`/arrow/`Space` flow.
- [x] Add `Top` and `Bottom` camera presets alongside `Perspective`, `Front`, `Rear`, and `Side`, unlocking full polar orbit bounds (`0deg`–`180deg`) in `<model-viewer>` and Three.js across `/create` and `/models/[id]`.
- [x] Add real untextured `Geometry` (matte studio clay) inspection mode alongside `Textured` and `Wireframe`, reusing the in-memory GLB blob URL with zero duplicate network requests.
- [x] Add optional studio `Grid` (perspective floor grid in Textured mode and 3D `GridHelper` in Geometry/Wireframe modes) and `Lighting` controls (`Studio`, `Soft`, and `Contrast` presets, `Exposure` slider, and `Shadows` toggle).
- [x] Provide clear labels and an expandable comparison explaining `AI`, `Round`, and `Box` reconstruction modes, and gate `Quality` controls strictly on backend `/health` capability advertisement (hidden when unsupported).
- [x] Refine 3D viewport object framing, suppress `<model-viewer>`'s redundant top progress line, and verify desktop (`1440px`, `1280px`) and mobile (`390px`, `375px`) layouts with 49 backend tests, 65 frontend Vitest tests, ESLint, strict TypeScript, production Next.js build, `pnpm test:browser`, and live local SF3D foreground-preview browser checks.

## SF3D reconstruction quality — 28 November 2026

- [x] Reconstruct chair, sneaker, water bottle, toy and headphones with the original pipeline. Save the meshes, timings, sampled memory and six views.
- [x] Return a transparent PNG and mask from local SF3D preprocessing. Add workspace mask review, brush tools and opacity adjustment. Cover red edges, shadows and thin silhouettes in regression tests.
- [x] Compare 1024 px and 2048 px at identical geometry. Evaluate roughness, normal mapping and test lighting. Retain the existing 1024 px matte default.
- [x] Add optional offline geometry and silhouette diagnostics. Keep heuristic flags separate from measured geometry and structural validation.
- [x] Regenerate all five categories and compare six views. Submit hand-edited bottle and headphone masks to the real API and independently validate the downloads. A cluttered toy still reconstructs as a thin surface. Hidden surface accuracy remains unverified without reference scans.
- [x] Verify keyboard mask editing, live SF3D and GLB download using a local production frontend. Pass 49 backend tests, 64 frontend tests, lint, type checks and production build.

See [RECONSTRUCTION_QUALITY_REPORT.md](RECONSTRUCTION_QUALITY_REPORT.md) for commands, output and limitations.

## Current status — 27 November 2026

**Initial geometry spike.** Live testing produced three real shape-only GLBs from Hunyuan3D-2, and all three passed geometry checks and a browser orbit through 360°. Its texture route failed and the toy request hit GPU quota. Community CPU TripoSR also returned valid vertex-colored GLBs and OBJ files for the sneaker and toy photos. CPU TripoSR is the geometry demo primary and Hunyuan shape-only is the quota-dependent fallback. No provider-native texture route qualified during that spike. The backend phase below verified texture baking from vertex colors. Mobile AR and USDZ are pending.

See [AI_RESEARCH.md](AI_RESEARCH.md) for the provider matrix and [HANDOFF.md](HANDOFF.md) for the remaining work. The earlier Stability AI spike is retained in [verification/phase0/RESULTS.md](verification/phase0/RESULTS.md).

## Backend phase — 27 November 2026

FastAPI upload, queue, provider worker, validation, storage, library, deletion, download, health and sharing endpoints are implemented. Two real CPU TripoSR uploads produced embedded textured GLBs that passed download, validation and browser orbit checks. A live Hunyuan fallback attempt returned `QUOTA_EXCEEDED`. Ruff, strict mypy, dependency checks and 12 automated tests passed. Two live primary cases passed. Provider ownership and mobile AR remain open. Frontend consent and proxy wiring were verified in the integration phase below.

Run from `backend/` with `uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log` and a configured provider. Use `python -m pytest -q` for automated tests, or `VISION3D_RUN_LIVE=1 python -m pytest -q tests/test_live.py` for live primary inference. Endpoints, setup, results and limitations are in [HANDOFF.md](HANDOFF.md) and [API.md](API.md).

## Frontend integration — 27 November 2026

- [x] Connect upload, server job polling, cancellation, retries, and model retrieval through the same-origin proxy. Reload resumes the saved job URL and no percentage is shown for indeterminate stages.
- [x] Synchronize generated models and persistent job history from FastAPI. Verify server-reported model metadata and same-origin downloads.
- [x] Test browser upload through live TripoSR and download. The sneaker job succeeded in 103.2 s. The downloaded 2,608,380-byte GLB had 63,725 triangles and passed Khronos validation with zero errors or warnings. Verified history after reload, live cancellation, and retry readiness after a real provider timeout.
- [x] Check 375px and 1280px layouts and keyboard focus through the upload controls. Lint, type checking, 22 Vitest tests, and the production build passed.

See [HANDOFF.md](HANDOFF.md) and [browser verification artifacts](verification/frontend-live). Native phone AR and USDZ acceptance remain open.

## Mobile camera and AR integration — 27 November 2026

- [x] Implement rear-preferred camera capture, denial recovery, native and gallery fallback, preview and consent-gated inference. Local HTTPS Chromium capture from a test-camera feed succeeded through live TripoSR.
- [x] Verify the desktop QR, expiring token, guest model identity, GLB MIME, range support, and fallback viewer over isolated HTTPS.
- [x] Configure WebXR, Scene Viewer and Quick Look via Model Viewer. Verify automatic textured USDZ packaging with `usdchecker --arkit --strict`. Frontend lint, type checking, 34 Vitest tests and the production build passed. Backend Ruff, strict mypy and 12 tests passed.
- [ ] Verify a public HTTPS deployment and finish the [physical iPhone/Android checklist](AR_DEVICE_TESTING.md). Public HTTPS deployment verified on 27 November 2026 at https://vision3d-sigma.vercel.app, with a laptop backend behind a Quick Tunnel; see [verification/deployed](verification/deployed). The physical iPhone/Android checklist is still open. No native placement, tracking or gesture results are claimed.

## Audit resolution — 27 November 2026

- [x] Address Safari-compatible cancellation, queue/execution timeouts, periodic retention, trusted edge rate limiting, viewer transfer reuse and dependency advisories. Added regression coverage for each significant code change.
- [x] Verify browser upload through download and QR with a reproducible production fixture, measure coverage, and run a fresh live community generation. See [AUDIT_RESOLUTION.md](AUDIT_RESOLUTION.md).
- [ ] Validate the owned provider route and run physical iPhone/Android acceptance over a public HTTPS deployment. These remain release blockers.

## Phase 0: Feasibility gate
- [ ] Verify free provider terms, quota, live endpoint and license.
- [x] Run actual image-to-3D test; save and inspect real GLB. Verified three Hunyuan shape-only GLBs and two vertex-colored TripoSR GLBs.
- [ ] Test GLB in model-viewer and mobile AR; confirm USDZ path.
- [x] Record results and select primary provider. CPU TripoSR verified for the demo with texture baking. Owned deployment remains pending.

## Phase 1: Foundation
- [x] Scaffold Next.js and FastAPI; configure lint, tests and env examples.
- [x] Implement dark copper design tokens and responsive workspace. Verified across desktop (1440×900), tablet (834×1194), and mobile (390×844) against `design-reference.png` with reusable UI design system (`frontend/components/ui/`).
- [x] Add upload, camera input, preview, validation and sample labeling. Includes JPEG/PNG/WebP + 10 MB + decoded dimension validation, `capture="environment"` camera input, external processing consent checkbox, and explicit sample GLB labeling.

## Phase 2: Backend
- [x] Implement session ownership, job persistence and worker.
- [x] Integrate verified provider adapter and real generation.
- [x] Validate/store GLB, implement polling and error/retry handling.
- [x] Add model metadata, library and deletion.

## Phase 3: Viewer
- [x] Integrate model-viewer with orbit, zoom, pan, reset, auto-rotate and fullscreen. Implemented unified `InteractiveModelCanvas` with Google `<model-viewer>` (`environment-image="neutral"`, `tone-mapping="commerce"`, `shadow-intensity="1.25"`, `shadow-softness="0.82"`), Front/Rear/Side/Perspective camera presets, primary-drag Pan mode, actual backend + runtime GLB metadata, and clean GPU resource disposal on model switch. Reproduced in production Chromium using the archived real sneaker GLB through the test-only API runner. See the audit browser evidence.
- [x] Implement download and responsive controls. Supports `?download=true` for backend GLBs, Export Dialog, and desktop/mobile layouts.
- [x] Add wireframe only if actually implemented. Implemented client-only `ThreeWireframeCanvas` (`three` + `GLTFLoader` + `OrbitControls`, copper wireframe over obsidian occluder + ground shadow + explicit GPU geometry/material/texture/renderer disposal) wired to the Textured/Wireframe toggle and verified in Chromium using the archived generated sneaker GLB, with no additional API download across modes.

## Phase 4: AR
- [x] Implement expiring share tokens, QR dialog and mobile route. Backend share endpoints, polished desktop `QrArDialog` (`View in Your Space` with 2-step scan guide, live remaining-time badge, and localhost HTTPS guard), and `/ar/[token]` (plus `/ar/sample`) verified in browser; physical phone verification pending below.
- [x] Configure HTTPS model URLs and MIME/CORS. Verified on isolated HTTPS and on the public Vercel deployment: `model/gltf-binary`, `no-store`, `Access-Control-Allow-Origin: *`, HEAD and a `206` range response for a cookie-free guest. Device acceptance is pending.
- [x] Implement Quick Look and Scene Viewer/WebXR launch with fallback. `<model-viewer ar ar-modes="webxr scene-viewer quick-look">` with neutral studio lighting, GLB loading overlay, touch-friendly presets/auto-rotate/reset, real `canActivateAR` detection, `View in Your Space` CTA, and honest unsupported-device 3D fallback card (iOS Safari Quick Look & Android Chrome ARCore guidance, zero fake in-AR controls) verified at `390×844`; physical phone verification pending below.
- [ ] Test actual iPhone and Android placement and scaling.

## Phase 5: Quality and delivery
- [x] Add loading, empty, error and accessibility states. Implemented across all 13 screens plus polished mobile camera capture (permission guidance, copper framing brackets, in-dialog captured preview review, and iOS/Android permission recovery) and safe-area mobile navigation. Final 4-breakpoint (`1440px`, `1280px`, `768px`, `390px`) visual & UX audit recorded in [VISUAL_REVIEW.md](VISUAL_REVIEW.md); verified with 38 Vitest tests, strict typecheck, ESLint, and production build with zero console or WebGL errors.
- [ ] Run unit, integration, E2E and device tests.
- [ ] Deploy within approved budget; verify real inference and AR. Free deployment is live: Vercel Hobby frontend plus a laptop backend behind a Cloudflare Quick Tunnel, at no cost. Real inference was verified twice through the public URL (127.6 s via script, 89.7 s via browser), and the desktop QR decodes to the public share URL. Still open: a durable always-on backend (Oracle Cloud Always Free or similar, needs your account) and AR on physical phones.
- [ ] Update README with actual commands, screenshots, limitations and test results.
- [ ] Prepare college demo: upload → generate → rotate → QR → AR.

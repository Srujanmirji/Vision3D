# Implementation checklist
Mark tasks complete only after verification.

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
- [ ] Verify a public HTTPS deployment and finish the [physical iPhone/Android checklist](AR_DEVICE_TESTING.md). No native placement, tracking or gesture results are claimed.

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
- [x] Configure HTTPS model URLs and MIME/CORS. Verified on isolated HTTPS. Public network and device acceptance are pending.
- [x] Implement Quick Look and Scene Viewer/WebXR launch with fallback. `<model-viewer ar ar-modes="webxr scene-viewer quick-look">` with neutral studio lighting, GLB loading overlay, touch-friendly presets/auto-rotate/reset, real `canActivateAR` detection, `View in Your Space` CTA, and honest unsupported-device 3D fallback card (iOS Safari Quick Look & Android Chrome ARCore guidance, zero fake in-AR controls) verified at `390×844`; physical phone verification pending below.
- [ ] Test actual iPhone and Android placement and scaling.

## Phase 5: Quality and delivery
- [x] Add loading, empty, error and accessibility states. Implemented across all 13 screens plus polished mobile camera capture (permission guidance, copper framing brackets, in-dialog captured preview review, and iOS/Android permission recovery) and safe-area mobile navigation. Verified with 36 Vitest tests and Desktop + Mobile browser QA with zero console errors.
- [ ] Run unit, integration, E2E and device tests.
- [ ] Deploy within approved budget; verify real inference and AR.
- [ ] Update README with actual commands, screenshots, limitations and test results.
- [ ] Prepare college demo: upload → generate → rotate → QR → AR.

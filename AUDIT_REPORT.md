# Vision3D audit report

27 November 2026, about 21:45–22:10 IST. This is an independent code, security and QA audit of the working copy in `/Users/srujanmirji/Downloads/Vision3D`. I read all the project documents, `task.md`, `HANDOFF.md`, `API.md`, `AR_DEVICE_TESTING.md`, all backend source and tests, the frontend source behind each audited area, and the saved verification artifacts. No application code was changed.

**Snapshot warning.** Another session was editing frontend files during this audit; some files changed within 15 minutes of the start. Findings describe the files as read at that time. Most of the work audited here is also **not committed to git**. The only commits on the PR branch are the review and an older frontend snapshot (see H3).

## What I ran

| Check | Result |
|---|---|
| Backend `pytest -q` | 12 passed, 3 live tests skipped (opt-in) |
| Backend `ruff check app tests` | Passed |
| Backend `mypy app tests` (strict) | Passed, 12 files |
| Backend `pip check` | No broken requirements |
| Backend `pip-audit -r requirements.txt` | No known vulnerabilities |
| Frontend `tsc --noEmit` | Passed |
| Frontend `eslint .` | Passed, no findings |
| Frontend `vitest run` | 36 of 36 passed, 6 files |
| Frontend `next build` | Succeeded; First Load JS 103–143 kB per route (model-viewer and three load dynamically on top) |
| Frontend `pnpm audit --prod` | 4 advisories in `postcss` pulled in by `next` (2 high, 2 moderate) |
| Coverage | **Not measured.** Neither `pytest-cov` nor `@vitest/coverage-v8` is installed |
| Secret scan | No Hugging Face or cloud keys in source. `backend/data/` (session key, SQLite) is git-ignored |

**Not run by me:** live Hugging Face inference, a browser end-to-end run, phone or AR tests, a public HTTPS deployment, and an automated accessibility scan. Where this report relies on earlier live results, they are cited from saved artifacts, not re-observed.

## Summary

| ID | Severity | Finding | Affected files |
|---|---|---|---|
| C1 | Critical | MVP acceptance unmet: no physical-device AR test and no public HTTPS deployment | `AR_DEVICE_TESTING.md`, `task.md` |
| C2 | Critical | Generation depends on an unowned community Space; the owned-Space path is unverified | `backend/app/main.py`, `backend/app/providers.py` |
| H1 | High | `AbortSignal.any` breaks every API call on browsers without it, including iOS Safari before 17.4 | `frontend/lib/api.ts` |
| H2 | High | Job deadline includes queue wait, so a third queued job almost certainly times out before it runs | `backend/app/jobs.py` |
| H3 | High | Backend and most frontend work exist only on local disk; several task.md ticks lack reproducible evidence | repository, `task.md`, `verification/` |
| M1 | Medium | Per-IP upload limit keys on the socket peer; behaviour behind the Next.js proxy or a tunnel is unverified | `backend/app/main.py` |
| M2 | Medium | Retention cleanup runs only at backend startup | `backend/app/storage.py` |
| M3 | Medium | Icon buttons are 32–40 px, below the project's 44 px tap-target floor | `frontend/components/ui/Button.tsx`, `Dialog.tsx`, pages |
| M4 | Medium | Test coverage unmeasured; no committed E2E test | `backend/tests`, `frontend/__tests__` |
| M5 | Medium | `postcss` advisories through `next` 15.5.29 | `frontend/package.json`, `pnpm-lock.yaml` |
| M6 | Medium | No CSP, HSTS, `nosniff` or frame headers | `frontend/next.config.ts` |
| L1 | Low | Provider worker discards stderr, so upstream failures leave no diagnostic trail | `backend/app/jobs.py` |
| L2 | Low | `/health` reports the community Space as `verified: true` | `backend/app/main.py` |
| L3 | Low | Coloured meshes over 100k triangles fail instead of being simplified | `backend/app/mesh.py` |
| L4 | Low | On-device USDZ conversion produced 6.5 MB from a 2.6 MB GLB; memory on older iPhones untested | `verification/mobile/usdz.json` |
| L5 | Low | Wireframe mode downloads the GLB a second time | `frontend/components/viewer/ThreeWireframeCanvas.tsx` |
| L6 | Low | Texture baking loops per face in Python; timing near the 100k limit not measured | `backend/app/mesh.py` |

## Critical

### C1. MVP acceptance not met: device AR and public HTTPS untested

The REQUIREMENTS.md acceptance criterion is a real photo that "opens in AR on a supported phone." `verification/mobile/usdz.json` records `"nativeQuickLookTested": false`. HANDOFF.md and task.md both say there has been no physical iPhone or Android run and no public tunnel. The isolated local-HTTPS checks are useful: QR decode, cookie-free GLB fetch, MIME type, range requests, and `usdchecker --arkit --strict` passing. None of them tests Quick Look, Scene Viewer, WebXR placement, or phone reachability.

**Fix:** Run `AR_DEVICE_TESTING.md` end to end over one public HTTPS origin: the tunnel serves Next.js, Next.js proxies `/api/*`, and `PUBLIC_APP_URL` is set. Use one iPhone and one ARCore Android phone, first with `/ar/sample` and then with a real generated model. Record the results before ticking the Phase 4 and Phase 5 device items.

### C2. Generation depends on an unowned community Space

Every successful live run used `AleenDG/3DGenTripoSR` (`COMMUNITY` in `providers.py`), which is enabled with `VISION3D_COMMUNITY_DEMO=1`. The `TRIPOSR_SPACE` hook for an operator-owned Space exists, but HANDOFF.md says no owned Space has been provisioned or verified. The community Space can sleep, change its API or disappear. The worker checks for `/preprocess` and `/generate` and fails with `PROVIDER_UNAVAILABLE` if they are missing, which is correct, but it means the demo can fail with no fix available. The Hunyuan fallback hit `QUOTA_EXCEEDED` in its live test.

**Fix:** Duplicate the Space into the team's account, set `TRIPOSR_SPACE`, run `VISION3D_RUN_LIVE=1 pytest tests/test_live.py` against it, and record the result. Keep a labelled screen recording of a real run as a demo-day backup.

## High

### H1. `AbortSignal.any` breaks API calls on older browsers

`lib/api.ts` uses `AbortSignal.any([caller, deadline])` in `request()` (line 215) whenever a caller passes a signal, and in `pollJobUntilDone()` (line 419). Most callers pass one. `getSharedAsset`, used by the `/ar/[token]` phone page, always does. The call sits outside the `try`, so on browsers without the API it throws a `TypeError`. The user then sees "AbortSignal.any is not a function" instead of the model. `AbortSignal.any` shipped in Safari 17.4 and Chrome 116, so iPhones on iOS 16 or iOS 17.0–17.3 cannot open shared models at all. The 36 tests run in jsdom and Node, which support the API, so they cannot catch this.

**Fix:** Replace it with a small helper: create an `AbortController` and abort it from either source signal with `addEventListener("abort", …)`. Add a unit test that deletes `AbortSignal.any` and calls `getSharedAsset`.

**Status: fixed in the working copy after the audit, not yet committed.**
- `eitherSignal()` in `lib/api.ts` replaces both `AbortSignal.any` calls.
- `__tests__/abort-compat.test.ts` removes `AbortSignal.any`, then checks that a shared asset loads and that a caller abort still cancels the request. Both tests failed before the change and pass after it.
- The full suite passes 38 of 38, with tsc and eslint clean.
- `AbortSignal.timeout` is still required, so the minimum is iOS Safari 16.
- Not verified on a real older iPhone.

### H2. Queue wait counts against the job deadline

`Jobs.run` enters `asyncio.timeout(self.config.deadline)` *before* acquiring the single-slot semaphore (`async with asyncio.timeout(...), self.gate:`, `jobs.py:128`). The deadline is 300 s and the queue limit is 5, while each recorded TripoSR run took about 100–140 s. A job that starts behind two others will typically have used 200–280 s of its deadline before it starts, and then fails with `TIMEOUT`. The frontend poll deadline is 330 s, so the UI reports the failure too. API.md documents this behaviour ("A fixed deadline covers the local queue"), but the effective queue capacity is about 2, not 5.

**Fix:** Acquire the gate first and start the deadline inside it, with a separate, shorter cap on queue wait if needed. Or lower `queue_limit` to 2 so the client gets `QUEUE_FULL` immediately instead of a delayed timeout. Add a test with a slow fake runner and three queued jobs.

### H3. Delivered work is uncommitted, and several task.md ticks lack reproducible evidence

`git status` shows `backend/`, `API.md`, `task.md`, `AR_DEVICE_TESTING.md`, `verification/backend-live`, `verification/frontend-live` and `verification/mobile` untracked, and 20 frontend files modified, all on the local disk. The PR branch contains only the earlier frontend. A disk failure or a fresh clone loses the backend entirely, and nobody else can reproduce the claims.

Evidence gaps for items task.md marks complete:

| task.md claim | Evidence found | Status |
|---|---|---|
| Responsive layout verified at 1440×900, 834×1194 and 390×844 | Screenshots exist only at 375 and 1280 (`verification/frontend-live`) | Partially evidenced |
| Wireframe mode "verified live on both generated backend GLBs" | No wireframe screenshot or log in `verification/` | Not evidenced |
| Browser end-to-end upload → TripoSR → download | `result.json`, GLB and validator report saved; the harness script that produced them is not in the repo | Evidenced, not reproducible |
| Loading, empty, error and **accessibility** states | Focus style present (`globals.css:69`), reduced-motion handled; no automated accessibility scan; tap targets below the floor (M3) | Partially met |
| "Integrate verified provider adapter" | Works against an unowned community Space only (C2) | Met for the demo only |

**Fix:** Commit the backend, documents, frontend changes and verification artifacts once the other session stops editing. Commit the browser harness scripts alongside their outputs. Either attach the missing screenshots or reword the ticks to match the evidence.

## Medium

### M1. The upload rate limit may not see real client IPs

`UploadRate.check(request.client.host)` limits uploads to 8 per minute per peer address. Behind the Next.js `/api` rewrite or a tunnel, the peer is the proxy. Whether the limit ends up per-client or one global bucket depends on Uvicorn's proxy-header handling and the headers the proxy forwards, and neither has been tested. If it is global, one user can lock everyone out. If headers are trusted from the wrong hop, the limit can be spoofed.

**Fix:** Behind the real tunnel, send uploads from two clients and confirm they get separate buckets. Set `--forwarded-allow-ips` to the proxy address only.

### M2. Retention runs only at startup

`Storage.recover()` deletes jobs, models and expired shares older than `RETENTION_DAYS`, but it is called only from `__init__`. HANDOFF.md says so. A backend that runs for weeks keeps everything past the disclosed 7-day retention. Expired share rows stay in the database, but they are rejected on each fetch, so this does not leak access.

**Fix:** Call `recover()`'s pruning from a periodic `asyncio` task, for example hourly. Only the pruning: the "mark active jobs interrupted" step must stay startup-only.

### M3. Tap targets below 44 px

The icon button sizes are `h-9 w-9` (36 px, size `sm`) and `h-10 w-10` (40 px, size `md`) in `components/ui/Button.tsx:55-56`. The dialog close button is `h-8 w-8` (32 px, `components/ui/Dialog.tsx:107`). Further 36–40 px icon controls sit in `ImageInputPanel.tsx:191`, `app/page.tsx:239` and `app/models/[id]/page.tsx:186`. The viewer toolbar (orbit, pan, zoom, reset, fullscreen) uses the 40 px size. The project's accessibility floor in the global instructions is 44 px.

**Fix:** Raise the icon-button minimum to 44 px. Or keep the visual size and extend the hit area with padding or a pseudo-element. Check at 375 px.

### M4. Coverage unmeasured, no committed E2E

The global standard asks for 80% coverage and E2E tests of critical flows. Neither coverage tool is installed, and no Playwright or other E2E specs are committed; the live browser checks were one-off harness runs. The backend tests do cover the riskiest paths: metadata stripping, unsafe input, foreign download URLs, session ownership, share expiry, deletion, limits, consent, retry, fallback, cancellation, timeout and restart.

**Fix:** Add `pytest-cov` and `@vitest/coverage-v8` to the dev dependencies and record the numbers. Commit one Playwright spec covering upload → (mocked) job → viewer → download → QR dialog, plus the `/ar/sample` page.

### M5. `postcss` advisories through `next`

`pnpm audit --prod` reports, all through the `next > postcss` path:
- GHSA-6g55-p6wh-862q (high)
- GHSA-r28c-9q8g-f849 (high)
- GHSA-fxqj-rqcc-2cmp (moderate)
- GHSA-qx2v-qp2m-jg93 (moderate)

These affect build-time CSS processing of attacker-controlled CSS or source maps. The app only processes its own CSS, so the runtime risk is low, but the audit will keep failing.

**Fix:** Upgrade `next` within 15.x to a release that pins `postcss` ≥ 8.5.23, or add a pnpm `overrides` entry. Then re-run `pnpm audit` and the build.

### M6. No baseline security headers

`next.config.ts` sets no-store, no-referrer and noindex headers on `/ar/:token`, plus camera and XR permission policies. It sets no Content-Security-Policy, `X-Content-Type-Options: nosniff`, `frame-ancestors` or `X-Frame-Options`, or HSTS for any route. Once the app is public behind a tunnel, any page can be framed.

**Fix:** Add a global header block. Use `nosniff` and `frame-ancestors 'none'` (or `X-Frame-Options: DENY`). Add a CSP that allows `'self'`, `blob:` and `data:` for model-viewer and the QR image, and test that AR still launches. Add HSTS at the tunnel or host.

## Low

- **L1 `jobs.py:67`:** `stderr=asyncio.subprocess.DEVNULL` drops all worker diagnostics. Every unexpected upstream failure surfaces only as `PROVIDER_UNAVAILABLE`. Log a bounded, redacted tail of stderr server-side, never in API responses.
- **L2 `main.py:62`:** The community provider is created with `verified=True`, and `/health` reports it that way. The UI then lists it under verified providers. Its label already says "community demo"; consider exposing ownership separately.
- **L3 `mesh.py:187`:** A vertex-coloured mesh over 100,000 triangles raises `INVALID_MODEL`, while shape-only meshes are decimated. Recorded TripoSR outputs were 63–83k triangles, so this is latent.
- **L4:** The recorded on-device USDZ was 6,506,661 bytes, from a 2.6 MB GLB. Quick Look memory on older iPhones is untested; include one older device in C1 if available.
- **L5:** `ThreeWireframeCanvas` fetches the GLB with `fetch(src)`, separately from model-viewer. It cleans up thoroughly: geometry, materials, textures, controls, ResizeObserver, animation frame and `forceContextLoss`. The cost is a second download of a model up to 10 MB on each switch to wireframe.
- **L6 `mesh.py:133`:** `_texture` rasterises one face at a time in Python. It runs inside the 190 s attempt timeout. Measure it on a 100k-triangle input so a slow bake does not turn a good generation into `TIMEOUT`.

## Area-by-area results

| Area | Result |
|---|---|
| Architecture and code quality | Matches the simplified review shape: one FastAPI process, an `asyncio` single-slot gate, SQLite, private local files, and the same-origin `/api` proxy. Backend modules are small and typed; lint, mypy and tests pass. Several frontend files are 470–611 lines (`app/models/[id]/page.tsx`, `ModelViewport.tsx`, `app/ar/[token]/page.tsx`), within the 800-line limit but candidates for splitting. |
| Real AI generation | Real: a subprocess calls a Gradio Space, downloads the result, validates and bakes it. No hardcoded model is returned by the generation path. Reliability depends on C2. |
| Fake responses or simulated progress | None found. `progress` is always `null` in the schema. Stages come from local work and the provider's own queue and running events. The only polling intervals (`setInterval`) are expiry checks and AR-capability detection, not progress animation. |
| Hardcoded models and samples | One bundled sample (`public/samples/sample-chair.glb`, generator "Vision3D Sample Asset Generator"). It is labelled "Sample 3D Model (Demo Preview)" or "(Sample Asset)" everywhere it appears, with `is_sample: true`. It is never substituted for a failed job. |
| Placeholder buttons and unsupported settings | No dead buttons found. Viewer controls are disabled until a model loads. The provider selector appears only when 2+ verified providers exist, and background removal only when `supports_background_removal`. The export dialog states that USDZ, OBJ and STL are not offered. |
| API reliability and error handling | Structured `{error: {code, message}}` everywhere, including validation, HTTP and unknown exceptions; no stack traces. Bounded provider retry, attempt timeout, job deadline (see H2), cancellation, and restart recovery that marks active jobs `INTERRUPTED`. The client retries polling twice on transient errors and applies a 30 s per-request timeout. |
| File upload security | Two size bounds: an ASGI body limit (content-length check plus a streamed counter) and a decoded-size check. Pillow decodes the image with a format allowlist (JPEG, PNG, WebP), a single-frame rule, a 16–8192 px edge range, a 25 MP cap and `verify()`. The image is then EXIF-transposed and re-encoded as a fresh PNG with metadata dropped. Consent (`allow_external_processing`) is required. Random job IDs and folders with mode 0700. |
| Malicious file handling | Re-encoding defeats polyglot and metadata payloads. Provider GLBs are structurally checked: header, chunk sizes, no external `uri`, accessor and node limits, triangles only, no required extensions. Embedded textures are decoded and verified, and the mesh is reloaded with Trimesh. Downloads are restricted to the provider's own host and file path, with no redirects followed, which prevents SSRF. |
| API key exposure | `HF_TOKEN` is read only by the backend. It is passed to the worker subprocess only for an operator-owned Space (`use_token`) and removed from the environment otherwise. No `NEXT_PUBLIC_*` variable carries a secret, and no keys are in source. |
| Rate limiting | Upload limit of 8 per minute per peer, capped at 4096 tracked clients, plus the queue limit. Effectiveness behind the proxy is unverified (M1). |
| Storage security | SQLite and the GLB directory have private permissions (0700/0600). A file lock prevents two backends sharing a data directory. Model files are named by random IDs and looked up from the database, never from user paths. Delete removes the file and cascades to shares. Retention runs only at startup (M2). |
| Model URL access control | Private GLBs need the HMAC-signed session cookie (HttpOnly, SameSite=Lax, Secure when public) and an owner match, and are served `no-store`. Shares use a 32-character URL-safe token (`secrets.token_urlsafe(24)`), stored as a SHA-256 hash, expiring after 1 hour by default, checked on every GLB fetch, and served with `no-referrer`. POST and DELETE reject foreign `Origin` headers. |
| 3D rendering performance | Generated GLBs are capped at 100k triangles and 10 MB; recorded outputs were 2.6–3.0 MB. model-viewer and three are dynamically imported, and route JS is 103–143 kB. No frame-rate profiling was done on a phone. |
| Memory leaks | The cleanup paths reviewed look correct. Camera tracks are stopped on capture, close and unmount; object URLs are revoked; the Three.js canvas disposes all GPU resources and the context; the AR page clears its timers and listeners. No heap profiling was done. |
| Mobile responsiveness | Earlier screenshots exist at 375 px only; build verified. Tap targets: see M3. |
| QR connectivity | The QR code encodes only validated public HTTPS URLs (`publicArUrl` rejects localhost, `.local`, `.lan`, `.internal`, raw IPs and credentials). Sharing returns `SHARING_UNAVAILABLE` without `PUBLIC_APP_URL`. A desktop QR decode on local HTTPS was recorded. Phone scanning has not been tested (C1). |
| AR compatibility | Configured with `ar ar-modes="webxr scene-viewer quick-look"`, `canActivateAR` detection, and a 3D fallback when AR is unavailable. Quick Look relies on on-device conversion to USDZ. No device results (C1). The fetch breaks on older iOS (H1). |
| Accessibility | Global `:focus-visible` style, `prefers-reduced-motion` handling (3 media blocks and the auto-rotate default), labelled icon buttons, `aria-pressed` toggles, native `<dialog>`. Small targets (M3). No axe or screen-reader pass was done. |
| Dependency vulnerabilities | Python: none known. JavaScript: `postcss` through `next` (M5). |
| Test coverage | 12 backend and 36 frontend tests pass. Coverage is unmeasured and there is no committed E2E (M4). |
| Deployment readiness | **Not ready.** It works locally only. It still needs a public HTTPS origin with the `/api` proxy, an owned Space, device acceptance, committed code, security headers, and periodic retention. A single process per data directory is enforced by the file lock. |

## Completed-task verification

| task.md item marked done | Verdict |
|---|---|
| Frontend integration (proxy, polling, cancel, resume, history, live upload, layouts) | Implemented in `lib/api.ts` and `CreateWorkspace.tsx`. Live artifacts are present but not reproducible (H3). |
| Mobile camera capture with denial recovery | Implemented in `CameraCaptureDialog.tsx`, with recorded local-HTTPS artifacts (`verification/mobile/camera*.json`). Not tested on a physical phone. |
| QR, expiring token, MIME and range support | Implemented, with backend tests and `verification/mobile/share.json`. |
| WebXR, Scene Viewer and Quick Look configured; USDZ passes `usdchecker` | Configured. USDZ validity is recorded. **Launch is not verified on any device.** |
| Phase 0: record results and select primary | Done for the demo, on an unowned Space (C2). |
| Phase 1: scaffold, tokens, upload | Implemented and passing. Viewport evidence is partial (H3). |
| Phase 2: session, persistence, worker, provider, validation, library, deletion | Implemented and tested. Deadline issue (H2). |
| Phase 3: viewer controls, download, wireframe | Implemented. No wireframe evidence was found (H3). |
| Phase 4: share tokens, QR, MIME/CORS, AR launch with fallback | Implemented. Device verification correctly left open. |
| Phase 5: loading, empty, error and accessibility states | States are implemented. The accessibility part is only partially met (M3, no automated scan). |

Items still correctly unchecked in task.md:
- Phase 0: free terms, quota and license verification, and the mobile AR and USDZ test.
- Phase 4: iPhone and Android placement and scaling.
- Phase 5: E2E and device tests, deployment, README, and the college demo run.

## Unresolved blockers

1. Physical-device AR over a public HTTPS origin (C1).
2. An owned TripoSR Space, verified live (C2).
3. Committing the backend and current frontend to version control (H3).
4. ~~Fixing `AbortSignal.any` (H1)~~ Fixed in the working copy; still to be committed.

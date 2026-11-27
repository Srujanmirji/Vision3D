# Vision3D audit resolution

27 November 2026. Findings are mapped to the snapshot in [AUDIT_REPORT.md](AUDIT_REPORT.md). Release acceptance remains open for C1 and C2. Browser evidence here comes from local HTTPS, desktop Chromium and, where stated, a fixture backend runner. No physical device AR test or public tunnel was run.

| ID | Status and fix | Affected files | Verification |
|---|---|---|---|
| C1 | **Open.** The reproducible HTTPS browser workflow covers the QR and guest asset prerequisites. Native AR and reachability from a public network require an HTTPS deployment plus physical iPhone and Android runs. | `AR_DEVICE_TESTING.md`, `frontend/e2e/workflow.mjs`, `task.md` | Cookie-free shared page and sample loaded over local TLS. No Quick Look, WebXR or Scene Viewer launch, placement, or gestures on physical devices. |
| C2 | **Open.** The opt-in live test now honors an explicitly configured `TRIPOSR_SPACE` and backend token, so the same suite can validate an owned instance. The community route remains opt-in. | `backend/tests/test_live.py`, `backend/app/main.py`, `HANDOFF.md` | Community CPU sneaker succeeded in 83.64 s and passed the download assertions. No owned Space or configured HF login was available. |
| H1 | **Fixed.** Replaced reliance on static AbortSignal methods with an abort controller, cleaned-up listeners, and a cancellable deadline for the response body and polls. | `frontend/lib/api.ts`, `frontend/__tests__/abort-compat.test.ts` | Loading and cancellation pass with both `AbortSignal.any` and `AbortSignal.timeout` removed. Physical Safari compatibility remains untested. |
| H2 | **Fixed.** Independent queue and execution budgets, a distinct `QUEUE_TIMEOUT`, and a backend-advertised browser polling budget. | `backend/app/config.py`, `backend/app/jobs.py`, `backend/app/main.py`, `backend/app/schemas.py`, `frontend/lib/api.ts`, `frontend/components/viewer/CreateWorkspace.tsx`, `API.md` | Three queued jobs finish within their individual execution budgets. Queue expiry leaves the executing job running. Existing timeout and cancellation tests pass. |
| H3 | **Fixed locally.** Current implementation, tests, reproducible browser harness and labeled evidence are checkpointed in Git. Task claims now point to what was actually measured. | `backend/`, `frontend/`, `verification/`, `task.md`, `HANDOFF.md` | Four viewport captures and a wireframe capture are in `verification/audit-browser`. The separate live screenshot claims from an earlier run are not used as evidence for this audit. No remote publish was performed. |
| M1 | **Fixed in application and configuration.** Honor one validated edge client-IP header only from explicitly trusted socket peers. Leave it disabled by default. | `backend/app/main.py`, `backend/app/config.py`, `backend/.env.example`, `DEPLOYMENT.md` | Tests verify that untrusted supplied identities cannot change buckets and two client identities through a configured edge get separate buckets. Public-edge configuration still needs deployment verification. |
| M2 | **Fixed.** Run periodic pruning independent of worker recovery. Expire assets, terminal history and share records while retaining active jobs. | `backend/app/storage.py`, `backend/app/main.py`, `backend/app/config.py` | Integration test prunes a model and its files and invalidates the share while the server stays running. An aged processing job survives. |
| M3 | **Fixed for audited controls.** Raised icon and dialog targets to 44px, kept the small image-removal icon inside a larger hit area, and corrected two low-contrast upload labels. Decorative landing icons are not controls. | `frontend/components/ui/Button.tsx`, `frontend/components/ui/Dialog.tsx`, `frontend/components/upload/ImageInputPanel.tsx`, `frontend/app/models/[id]/page.tsx` | Browser asserts a 44px fullscreen target and no horizontal overflow at 375px, 390px, 834px and 1440px. Axe found no violations in the tested 375px sample workspace after the contrast fixes. |
| M4 | **Measured and reproduced.** Added coverage tooling and a production Chromium workflow. It runs the real API and application with a deterministic test-only runner that returns an archived real GLB. Live provider testing remains separate. | `frontend/e2e/workflow.mjs`, `backend/tests/browser_fixture.py`, `frontend/vitest.config.ts`, `frontend/package.json`, `backend/requirements-dev.txt` | Production browser upload, result, matching download, QR, guest page and AR sample pass. The frontend coverage target remains open; measured results are below. |
| M5 | **Fixed.** Pinned PostCSS 8.5.34 across frontend dependency paths with the lockfile regenerated. | `frontend/pnpm-workspace.yaml`, `frontend/pnpm-lock.yaml` | `pnpm audit --prod` reports no known vulnerabilities. Production build passes. |
| M6 | **Fixed baseline.** Added CSP, frame denial, nosniff, and conditional production HSTS for configured HTTPS. CSP permits inline Next.js hydration for static pages and allows the model and QR resources. | `frontend/next.config.ts`, `frontend/e2e/workflow.mjs`, `DEPLOYMENT.md` | Production HTTPS test asserts headers and observes no CSP violations through viewer switching, QR and guest/sample pages. Native AR launch is still C1. |
| L1 | **Fixed.** Drain bounded worker stderr and log fixed classifications, exit status, or allowlisted exception names. Raw provider output is excluded from logs and API errors. | `backend/app/jobs.py`, `backend/app/providers.py`, `backend/tests/test_backend.py` | Tests cover classification without revealing a secret-like value. Live provider smoke passed with the worker transport. |
| L2 | **Fixed.** Added distinct `operator_configured` metadata. The community label and its historical capability verification remain distinct from operator configuration. | `backend/app/main.py`, `backend/app/schemas.py`, `frontend/lib/api.ts` | Community inference passed again. The operator-owned route itself is still C2. |
| L3 | **Fixed.** Decimate over-budget vertex-colored meshes before baking and carry the colors through the collapse mapping. | `backend/app/mesh.py`, `backend/tests/test_backend.py` | Regression fixture simplifies and still contains an embedded texture. A 102,400-face test mesh produced a textured GLB of 99,000 triangles. |
| L4 | **Open.** Existing USDZ package compatibility checked, but older-iPhone memory and actual Quick Look display are device checks. | `AR_DEVICE_TESTING.md`, `verification/mobile/usdz.json` | Prior 6.5 MB USDZ passed structural and ARKit validation. No runtime memory or native device result. |
| L5 | **Fixed.** Share one in-memory GLB object URL between the textured and wireframe renderers, revoke it when the active model changes, and leave public AR assets separate. | `frontend/components/viewer/InteractiveModelCanvas.tsx`, `frontend/e2e/workflow.mjs` | Real Chromium switches both modes with the same object URL and no additional GLB request to the API. |
| L6 | **Fixed and measured.** Precompute bounds, determinants and vertex colors before the face loop. | `backend/app/mesh.py`, `verification/audit-mesh-benchmark.json` | Isolated synthetic 102,400-triangle mesh simplified, baked, and validated in 4.148 s on this machine. This is an observed timing, not a performance guarantee. |

## Reproduce

From the repository root, create the Python 3.13 virtual environment at `.venv` and install `backend/requirements-dev.txt`. For the browser suite, install pnpm, Chrome and OpenSSL, then install the frontend lockfile.

```sh
cd backend
../.venv/bin/ruff check app tests
../.venv/bin/mypy app tests
../.venv/bin/python -m pytest --cov=app -q
# Opt in to community inference, or set TRIPOSR_SPACE to your owned Space first.
VISION3D_RUN_LIVE=1 ../.venv/bin/python -m pytest -q tests/test_live.py -k shoes

cd ../frontend
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm audit --prod
VISION3D_BACKEND_ORIGIN=http://127.0.0.1:8316 \
  NEXT_PUBLIC_PUBLIC_APP_URL=https://vision3d.test:3446 pnpm build
pnpm test:browser
```

Set `CHROME_PATH` if Chrome is outside its default macOS installation path, or `VISION3D_PYTHON` to use a different Python environment. `VISION3D_BROWSER_EVIDENCE` optionally writes screenshots and the report. The browser harness uses disposable SQLite and TLS files and does not start a public tunnel. The Next.js build settings shown are for that test only.

## Checks and remaining limits

- [Production browser report](verification/audit-browser/result.json) and [live provider report](verification/audit-live/shoes/result.json).
- Ruff, strict mypy, Python dependency check and runtime vulnerability audit passed. Frontend lint, type checking, production dependency audit and build passed.
- Backend: 21 tests passed, three opt-in live tests skipped by the default suite, and 79.9% statement coverage. Separately ran one live inference test successfully. Frontend: 38 tests passed and 35.99% line coverage for app, component and library source. The browser workflow is separate from the unit coverage measurement.
- The fresh live GLB passed Khronos validation with zero errors and zero warnings.
- C1 needs the [physical device checklist](AR_DEVICE_TESTING.md) over an externally reachable HTTPS origin. L4 may be checked on an older iPhone during that run.
- C2 needs an operator-owned TripoSR Space. Set its name in the backend environment, keep the token server-side and repeat live verification.
- The deployment edge must be tested from two external networks before claiming public-network rate bucket verification.

# Regression test report

28 November 2026, branch `audit/independent-review` (from `main` at `206095c`).

## Automated suites

| Suite | Command | Result |
|---|---|---|
| Backend tests | `cd backend && python -m pytest -q --cov=app` | **PASS:** 44 passed, 3 skipped (opt-in live tests). Line coverage 84% |
| Backend lint | `ruff check app tests local_sf3d local_triposr` | PASS |
| Backend types | `mypy app tests` (strict) | PASS, 18 files |
| Frontend types | `tsc --noEmit` | PASS |
| Frontend lint | `eslint .` | PASS |
| Frontend tests | `vitest run` | **PASS:** 63 of 63, 12 files |
| Frontend build | `pnpm build` | PASS |
| Dependency audit | `pnpm audit --prod` | PASS, none known |
| Frontend coverage | – | NOT TESTED (no coverage provider installed) |

**New tests in this audit.** Both failed against the original code and pass with the fix:
- `backend/tests/test_local_sf3d.py::test_cancel_while_the_model_loads_does_not_desync_the_next_job` (A-1)
- `backend/tests/test_backend.py::test_transient_retry_and_quota_fallback` now also asserts the `provider_failed` log event (A-2)

The unit tests use fakes for the models. They prove the control flow, **not** that inference works. Live inference proof is in the next section.

## Coverage of the requested areas

| Area | Automated test (fake models) | Live evidence (real models or live site) | Status |
|---|---|---|---|
| Image upload | `test_upload_limits_consent_rate_and_openapi`, `uploadImage` and `validation` suites | Benchmark: 12 real uploads. Chrome: live upload | PASS |
| Background removal | `test_local_pipeline_skips_background_removal_when_off`, round and box pipeline tests | Six-view renders: object cut out on plain backgrounds; floor and shadow kept (A-7) | PASS, with limits |
| AI generation | `test_sf3d_*`, `test_local_*` | 10 real SF3D and TripoSR jobs (RECONSTRUCTION_BENCHMARK.md) | PASS (9 of 10; TripoSR headphones FAIL, A-3) |
| Provider failure | `test_sf3d_failure_is_provider_unavailable`, `test_local_failures_are_reported_as_provider_unavailable`, `test_transient_retry_and_quota_fallback` | Real `INVALID_MODEL` on TripoSR headphones | PASS |
| Job cancellation | `test_cancel_timeout_and_queue_limit`, new A-1 test | Chrome on the live site: Cancel Job → `CANCELLED`, Retry offered | PASS |
| Job recovery | `test_restart_marks_interrupted_job_and_removes_work_files` | – | PASS (automated only) |
| GLB validation | `test_unsafe_input_and_non_glb`, `test_dense_colored_mesh_is_simplified_and_texture_retained`, `test_finished_meshes_carry_smooth_normals` | Every real output went through `finish_mesh` | PASS |
| Model storage | `test_session_share_download_deletion_and_restart` | Probe: real job stored and read back | PASS |
| Model deletion | same | Probe: delete → 204, file gone, share revoked | PASS |
| Model downloads | `reads persisted jobs and downloads a private GLB` | Benchmark: `GET /glb` returned each GLB. Chrome: export dialog downloaded a USDZ (`model-198342a4.usdz`) | PASS. GLB button in the browser NOT TESTED; my script clicked USDZ first |
| QR sharing | `QrArDialog` and `requires the correct token…` tests | Probe: share, expiry (410), tamper (404) | PASS |
| AR browser fallback | `ar-ux` tests | `/ar/sample` renders in Chrome and WebKit desktop | PASS on desktop; phone AR BLOCKED (A-6) |
| Backend disconnection | `maps network failures to structured NETWORK_ERROR` | – | PASS (automated only) |
| Network interruption | `polls real states, recovers from a network interruption` | – | PASS (automated only) |
| Concurrent requests | `test_queued_jobs_each_get_a_full_execution_window`, `test_queue_timeout_is_distinct_from_provider_timeout`, queue-limit test | – | PASS (automated only) |

## Live browser run (https://vision3d-sigma.vercel.app)

`verification/audit-2026-11-28/browser-results.json`:

| Test | Chrome | WebKit (Safari engine) | Firefox |
|---|---|---|---|
| `/`, `/create`, `/models`, `/settings`, `/ar/sample` load without errors | PASS on 4 of 5; `/` had one intermittent 404 (A-13) | PASS 5 of 5 | BLOCKED (old local build would not launch) |
| Sample model renders | PASS | PASS | BLOCKED |
| Generate disabled until an image and consent are given | PASS | NOT TESTED | NOT TESTED |
| Upload → generation → model shown | PASS, 44.3 s | NOT TESTED | NOT TESTED |
| Camera presets (Perspective, Front, Rear, Side) | PASS | NOT TESTED | NOT TESTED |
| Zoom, pan, orbit, reset | PASS | NOT TESTED | NOT TESTED |
| Wireframe | PASS | NOT TESTED | NOT TESTED |
| Fullscreen | PASS | NOT TESTED | NOT TESTED |
| Cancel and retry | PASS | NOT TESTED | NOT TESTED |
| Focus visible at every Tab stop (29) | PASS | NOT TESTED | NOT TESTED |
| Tab stops ≥ 44 px | **FAIL** (A-11) | NOT TESTED | NOT TESTED |
| No horizontal overflow at 375 and 1280 px | PASS | NOT TESTED | NOT TESTED |
| Camera capture | NOT TESTED (needs a camera) | | |
| Before/after comparison, geometry mode | NOT TESTED (not implemented, A-12) | | |

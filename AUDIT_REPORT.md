# Vision3D independent audit

28 November 2026, against `main` at `206095c` (after PRs #11–#13), plus the fixes in this branch. This replaces the 27 November audit; [AUDIT_RESOLUTION.md](AUDIT_RESOLUTION.md) records how that one was closed.

**Scope:**
- every Markdown document, the backend and frontend source, and the git history
- live model runs on this Mac (Apple M5, 16 GB)
- a black-box security probe against an isolated backend
- browser runs against the live site, https://vision3d-sigma.vercel.app

Companion reports:
- [SECURITY_AUDIT.md](SECURITY_AUDIT.md)
- [REGRESSION_TEST_REPORT.md](REGRESSION_TEST_REPORT.md)
- [PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md)
- [RECONSTRUCTION_BENCHMARK.md](RECONSTRUCTION_BENCHMARK.md)

The evidence is in `verification/audit-2026-11-28/`.

## Verdict

**Ready for a supervised public demonstration of photo → 3D in a desktop browser. Not ready for an unattended public launch.** The reasons:

- **The core works for real.** SF3D and TripoSR produce genuine textured 3D on the test objects. The live site ran upload → generation → viewer → cancel end to end in Chrome, in 44 s.
- **Security is sound.** All 25 security probes passed. No secrets are in the repository.
- **Two P1 problems remain.**
  - The site goes down whenever the Mac's Quick Tunnel address changes (A-5).
  - AR on a real phone has never been verified (A-6).
- **Expect visible quality failures on some inputs:** transparent objects, cluttered photos, and thin objects seen side-on.

## Issues

Every issue below gives the affected file, the cause and the fix. Reproduction steps and evidence are in the linked reports.

| ID | Pri | Issue | Status |
|---|---|---|---|
| A-1 | P1 | Cancel or timeout while the model loads leaves the next job reading a stale reply | **Fixed** |
| A-2 | P2 | Main-model failure fell back to TripoSR with no trace | **Fixed** (logging); UI part open |
| A-3 | P2 | TripoSR fallback rejects outputs over 100k triangles (headphones: 117,761) | **Fixed** (option a) |
| A-4 | P3 | The result view on `/create` doesn't say which model made it; the details page shows a raw ID | Open |
| A-5 | P1 | Quick Tunnel URL changes on every restart, and the site is down until Vercel is updated | Open, owner action |
| A-6 | P1 | AR on a physical iPhone or Android phone never verified | BLOCKED (needs a phone) |
| A-7 | P2 | Reconstruction limits: holes in transparent objects, background baked in, thin side profiles, clutter | Inherent; mitigated by photo tips and Round mode |
| A-8 | P2 | Upload rate limit is one shared bucket for all visitors in production | Open, needs approval (SECURITY_AUDIT S-1) |
| A-9 | P2 | Backend reachable directly at the tunnel URL, including `/docs` | Open (SECURITY_AUDIT S-2) |
| A-10 | P2 | `/health` hides the third provider (community Space); consent copy overstates the upload | Open, owner decision (SECURITY_AUDIT S-3) |
| A-11 | P3 | Buttons on `/create` are 36–42 px tall, under the 44 px floor; the consent checkbox box is 18 px | Open |
| A-12 | P3 | Requested "before/after comparison" and a separate "geometry" inspection mode do not exist (Textured and Wireframe only) | Not implemented; no document claims them |
| A-13 | P3 | One intermittent 404 in Chrome's console on `/` (not reproduced on reload) | Open |
| A-14 | P3 | Firefox not tested: the local Firefox build would not launch | BLOCKED |

### A-1 (P1, fixed): stale "ready" line after a cancel during model load

**File:** `backend/app/jobs.py`, `WarmModel.start` (lines 108–132).

**Cause:** `start()` launched the worker, then awaited its `{"ready": true}` line. If the job was cancelled, or hit its 190 s attempt timeout, during that wait (SF3D takes 20–50 s to load), the process stayed alive with the ready line unread. The next job reused it, wrote its request and read `{"ready": true}` as the answer. It then failed with "The local 3D model failed on this photo." and fell back to TripoSR. With no fallback configured, every later job read the previous job's reply.

**Reproduce (before the fix):**
1. Start the backend.
2. Upload a photo and press **Cancel Job** within about 20 s, while the first SF3D load is running.
3. Upload again. The second job is made by TripoSR, or fails.

**Expected:** the second job runs on SF3D. **Actual:** it doesn't.

**Fix:** if the wait for "ready" is interrupted, kill the process. Test: `tests/test_local_sf3d.py::test_cancel_while_the_model_loads_does_not_desync_the_next_job`. It failed on the old code and passes now.

### A-2 (P2, fixed in the backend): silent fallback

**File:** `backend/app/jobs.py`, `Jobs.execute`.

**Cause:** when a provider failed, the loop moved to the next one without logging. During SF3D integration this hid a real bug (zero-area faces), which showed up only as "TripoSR quality".

**Fix:** a `provider_failed` event with the provider and error code. Test: `test_transient_retry_and_quota_fallback` now asserts the event. It failed before the fix.

**Still open:** the UI. `/create` never says which model produced the result, and `/models/[id]` shows the raw ID (`triposr-local`). **Recommended:** show the provider label next to "Generated GLB", plus a "backup model" note when it isn't the main one. This is a small UI change in `ModelViewport.tsx`, left for design approval.

### A-3 (P2): TripoSR output over the triangle budget is rejected, not simplified

**File:** `backend/app/mesh.py:264`, with `LOCAL_MESH_RESOLUTION = 256` in `providers.py`.

**Reproduce:** the headphones photo with `LOCAL_SF3D_HOME` unset. The job fails with `INVALID_MODEL`, "Model exceeds the triangle budget". The raw mesh has 117,761 triangles, no zero-area faces and no duplicates.

**Impact:** the fallback fails exactly when it's needed. Detailed objects lose their backup.

**Fixed with option (a).** The backend sends `max_triangles` to the worker. If the mesh is over budget, the worker re-extracts it on a grid coarser by 32 (minimum 128) before baking the texture, so the texture stays sharp. No new dependency was needed.

**Verified on the real model:** the headphones now succeed at grid 224 with 90,111 triangles (`verification/audit-2026-11-28/headphones-triposr-fixed.png`). The shoe and chair outputs are unchanged, with identical triangle counts and file sizes.

Test: `test_worker_is_told_the_triangle_budget`. It failed before the fix.

### A-5 (P1): the site depends on a changing tunnel URL

**Cause:** the free Quick Tunnel gets a new hostname on every start. Vercel's `VISION3D_BACKEND_ORIGIN` then points at a dead address until someone edits it and redeploys. The steps are in CLIENT_MAC_GUIDE.md.

**Fix:** a named Cloudflare tunnel. It's free but needs a domain on Cloudflare, so it's an owner action. The code already supports it (`CLOUDFLARE_TUNNEL_TOKEN`, `VISION3D_TUNNEL_URL`).

**Demo-day minimum:** run `sh scripts/status-mac.sh` one hour before, and keep the Vercel CLI steps at hand.

### A-6 (P1): AR not verified on a phone

`AR_DEVICE_TESTING.md` has 0 of its checklist items ticked, and HANDOFF.md says Quick Look and Scene Viewer are unverified. In this audit, `/ar/sample` loaded and rendered in Chrome and WebKit desktop (PASS), but AR launch needs a real device.

**BLOCKED:** no phone was available. Run AR_DEVICE_TESTING.md on one iPhone and one ARCore Android phone before demonstrating AR.

### A-7 (P2): known reconstruction limits

See RECONSTRUCTION_BENCHMARK.md for the six-view evidence:
- SF3D punches holes through clear plastic.
- Both models bake the floor or shadow under an object into the mesh.
- Side views are thinner than real objects.
- A cluttered photo gives a flat fragment.

These are limits of single-image models, not code bugs. Mitigations already exist: the photo tips, and Round mode for bottles. For the demo, use the shoe, chair or headphones photos, or plain-background product shots.

### A-11 to A-14

- **A-11:** tab-stop sizes come from the keyboard pass (`verification/audit-2026-11-28/tab-stops.json`). Focus was visible at all 29 stops (PASS). Hit areas are 36–42 px.
- **A-12:** feature not present. Removing it from the audit brief, or building it, is a product decision.
- **A-13:** watch for it; no user impact observed.
- **A-14:** use a current Firefox by hand.

## Checked and found working

- **Generation is real:** no hardcoded or placeholder results in the generation path. Samples are labelled "Sample 3D Model (Demo Preview)".
- **Provider order** is SF3D → TripoSR → community Space. The fallback triggers on failure only; all 5 SF3D benchmark jobs stayed on SF3D.
- **Background removal** runs in the SF3D worker (u2net, Apache-2.0) and in TripoSR's `prep.py`. It works on plain backgrounds, and it does not remove floors or shadows (A-7). There is no separate mask-refinement step; none is claimed.
- **Round and Box** are clearly labelled as photo wraps, not AI.
- **Upload validation, session isolation, share expiry and revocation-by-delete, CORS and origin checks:** see SECURITY_AUDIT.md.
- **Viewer:** orbit, pan and zoom, reset, four camera presets, textured and wireframe, fullscreen, and USDZ download all PASS in Chrome on the live site. Cancel and retry also PASS.
- **Responsive:** no horizontal overflow at 375 px or 1280 px on `/`, `/create` and `/models`.
- **Design:** the Obsidian Black and Copper Orange design was preserved. No UI code was changed in this audit.
- **Licences:** SF3D is under the Stability AI Community License (free under USD 1M revenue; documented in DEPLOYMENT.md). TripoSR is MIT, u2net is Apache-2.0, three.js is MIT, model-viewer is Apache-2.0.
- **Dependencies:** `pnpm audit --prod` reports no known vulnerabilities.

## Documented but not verified by me

- **iPhone Quick Look and Android Scene Viewer:** see A-6.
- **Safari itself:** WebKit via Playwright is the same engine, but not Safari.
- **Firefox:** see A-14.
- **Screen-reader pass:** not done.

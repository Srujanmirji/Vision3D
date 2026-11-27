# Vision3D architecture review

27 November 2026. Independent review of all project documents, [AI_RESEARCH.md](AI_RESEARCH.md), [HANDOFF.md](HANDOFF.md), the probe under [verification/](verification), and the frontend in [frontend/](frontend). No application code was changed.

**Verdict:** The idea is feasible for a college mini-project. The planned architecture is sized for a production SaaS, not a demo. The main risk is the provider, not the code. Every route so far depends on someone else's public Hugging Face Space, and no route produced a textured GLB. Cut the infrastructure. Then make one generation route the project owns, and relax "textured" to "coloured" or get that change approved.

Severity scale: **Critical** blocks the MVP acceptance demo. **High** is likely to break the demo or the evaluation. **Medium** is a correctness or maintainability issue. **Low** is polish.

Checks re-run for this review: `tsc --noEmit` passed, `eslint .` passed with no findings, and `vitest run` passed 13 of 13 tests. No provider calls, device tests or AR tests were run.

**Where the reviewed sources are.** This review covers the local working copy as of 27 November 2026, not the tree committed to this repository. When this review was committed, `main` held only `README.md`. These files were reviewed and the checks were run against them, but they were still uncommitted:

- the project documents: REQUIREMENTS, ARCHITECTURE, API, DATA, DEPLOYMENT, DESIGN, AR, AI_INTEGRATION, AI_RESEARCH, TESTING and task
- `frontend/`, including `public/samples/sample-chair.glb`, which the `/ar/sample` route depends on
- `verification/`

Commit 9eb7293 adds the reviewed frontend, `verification/phase0`, `verification/reconstruction` and most of those documents. Two documents are still missing: API.md and task.md. They were rewritten for later backend work after this review, and the versions reviewed here were never committed. This review's findings on the API contract describe that earlier version of API.md.

## Summary of findings

| # | Area | Finding | Severity |
|---|---|---|---|
| 1 | Provider | No route meets "genuine textured mesh"; best route gives vertex colours only | Critical |
| 2 | Provider | Primary route is an anonymous third-party community Space with no uptime or quota guarantee | Critical |
| 3 | Mobile AR | Not tested on any device; Quick Look USDZ path unverified and likely loses vertex colours | Critical |
| 4 | Contracts | Session cookie with `credentials: "include"` across origins will be blocked on iOS Safari | High |
| 5 | Contracts | `glb_url` is not specified as absolute public HTTPS; AR on phones requires it | High |
| 6 | Architecture | Durable queue, Supabase, signed URLs, provider fallback are unnecessary for the demo | High (complexity) |
| 7 | Quality | Hunyuan GLBs are 7–9 MB with 450–600k triangles, ~45% degenerate; too heavy for mobile AR | High |
| 8 | Security | Phone photos carry EXIF/GPS; images are forwarded to third parties unmodified | High |
| 9 | Contracts | Frontend types accept two shapes for several responses | Medium |
| 10 | Frontend | Polling has no overall deadline | Medium |
| 11 | Licensing | Hunyuan3D-2 licence excludes EU, UK, South Korea; Stability licence has conditions | Medium |
| 12 | Config | Env var names differ between DEPLOYMENT.md and frontend `.env.example` | Low |
| 13 | Docs | `task.md` Phase 1 boxes unchecked although frontend scaffold exists and passes checks | Low |

## 1. AI provider selection

**Finding 1, Critical. Textured requirement unmet.** [REQUIREMENTS.md](REQUIREMENTS.md) asks for a "genuine textured 3D mesh". The research shows:

- Community CPU TripoSR gives vertex-coloured GLBs.
- Hunyuan3D-2 gives shape-only GLBs, and its texture worker failed.
- Every other candidate failed on quota or upstream errors.

Single-image reconstruction at this tier usually means vertex colours or a low-resolution baked texture. Photoreal texturing is not realistic here.

*Recommendation:* Have the project owner or guide approve "coloured mesh (vertex colour or texture)" as the MVP bar. This is a requirements decision, not an engineering one. If approval is refused, the only free route is local or self-hosted texturing. That needs a GPU and is out of scope for a mini-project.

**Finding 2, Critical. The primary route is not owned.** `AleenDG/3DGenTripoSR` is a stranger's Space:

- It can be deleted, put to sleep, rebuilt or broken at any time.
- The official TripoSR Space already broke on a dependency build.
- Requests are anonymous and queue behind everyone else's.
- Each run takes 90–140 s end to end.

The planned fallback, Hunyuan on ZeroGPU, has 40–45 s of anonymous quota against 60 s requests. In practice it is one or two runs a day.

*Recommendation, choose one (simplest first):*
1. **Duplicate the TripoSR Space into the team's own Hugging Face account** on free CPU hardware. You then control its uptime, dependency pins and queue. You call the same endpoint with your own `HF_TOKEN`, kept server-side. Free Spaces sleep when idle, so wake it before a demo. Check current free-tier terms before relying on it.
2. **Run TripoSR locally inside the backend.** The MIT model runs on CPU or Apple MPS. This removes the third-party dependency, the quota, and the need to tell users their images go to a third party. Cost: a heavier Python environment, plus the `torchmcubes` build risk that broke the official Space. Pin versions.
3. Keep Hunyuan only as a documented manual comparison, not as a runtime fallback. Two ZeroGPU Spaces share one failure domain, and its licence has territorial limits (finding 11).

Drop the provider selector and fallback logic. One provider, one adapter function.

## 2. Actual reconstruction quality

The evidence is honest and well collected: hashes, timings, Khronos validator results and orbit screenshots. Observations:

- All successful GLBs are structurally valid. The geometry is plausible from the front, and the back and hidden sides are hallucinated. The UI copy must keep saying "inferred", as REQUIREMENTS.md already does.
- **Finding 7, High.** The Hunyuan meshes have 455–602k triangles, roughly 44% of them zero-area, and weigh 7–9 MB with no colour. That is too heavy for a smooth phone AR session and for upload over a tunnel. TripoSR's 38–64k triangles at 0.8–1.3 MB are already mobile-friendly.
  *Recommendation:* After download, run one cleanup step in the backend: drop degenerate faces, merge vertices, and decimate to about 100k triangles or fewer if needed. `trimesh` is already used, and `gltfpack` is a simplification-only alternative. Avoid meshopt compression unless Scene Viewer and Quick Look are tested with it.
- The toy photo had several objects, so it is not a fair single-object test. HANDOFF already notes this. Add one clean single-object toy photo before concluding.
- No input with background clutter was tested against TripoSR's preprocessing. Add one, because real phone photos will have clutter.

## 3. Free API limitations

| Limit | Impact | Mitigation |
|---|---|---|
| Anonymous ZeroGPU quota (observed 40–45 s, reset ~24 h) | Hunyuan and TRELLIS unusable beyond 1–2 runs | Don't depend on ZeroGPU at runtime |
| Shared public queue on community Space | Unbounded wait; 90–140 s typical | Own Space duplicate or local inference |
| No SLA, Space may sleep or break | Demo-day failure | Pre-warm; keep pinned duplicate; record a backup video of a real run |
| Gradio endpoint names are Space-specific | Breaks on upstream change | Pin to your own duplicate; keep `view_api()` check in the probe |
| Commercial APIs (Meshy, Tripo) need keys and credits | Not free | Out of scope without approval (AGENTS.md) |

A backup screen recording of a genuine end-to-end run is cheap insurance for a college evaluation. Label it as a recording.

## 4. System architecture

Planned: Browser → Next.js → FastAPI → provider adapter → durable queue/worker → validation → object storage (Supabase) → signed URLs → viewer/AR, with session ownership, rate limits, retention jobs, hashed share tokens and an optional fallback provider.

**Finding 6, High (unnecessary complexity).** For one user demoing to examiners, most of this is speculative. Simpler equivalent:

```
Phone/desktop ──HTTPS tunnel──▶ Next.js (UI + rewrite /api/* → FastAPI)
                                     │
                               FastAPI (single process)
                                ├─ POST /v1/jobs → validate, re-encode, enqueue in-process task
                                ├─ asyncio task (concurrency 1) → TripoSR → validate/clean GLB
                                ├─ SQLite (jobs, models, shares)
                                └─ ./data/models/<random>.glb served with model/gltf-binary
```

| Planned | Replace with | Why it's safe |
|---|---|---|
| Durable queue / separate worker | FastAPI background task with `asyncio.Semaphore(1)`, status in SQLite; mark stuck `processing` jobs `failed` on startup | One user, one provider queue; restart recovery is one SQL update |
| Supabase Postgres + object storage | SQLite + local disk | GLBs are ≤ 10 MB; no multi-instance deployment |
| Signed asset URLs | Unguessable share token in the URL path, checked on each GLB request | Native AR viewers can't send auth headers anyway (AR.md) |
| Hashed share tokens | Plain 128-bit random token in SQLite with `expires_at` | Acceptable for demo; hash if ever deployed publicly |
| Provider adapter interface + fallback | One module with `generate(image_path) -> glb_path` | YAGNI; one verified provider |
| Provider selector, background-removal toggle | Remove from UI | Only one provider; TripoSR preprocesses internally |
| Retention scheduler | Delete-on-request plus a startup sweep of files older than N days | Same guarantee, no scheduler |
| Separate deployed backend on a free host | Run locally, expose through one HTTPS tunnel (e.g. Cloudflare Tunnel) | Free hosts sleep or kill 2-minute jobs (DEPLOYMENT.md already warns) |

Keep these, because they are not optional:
- server-side image validation
- size limits
- GLB validation before serving
- structured errors
- honest status and progress
- the sample labelling
- deletion that removes the files

## 5. Backend and frontend contracts

The frontend is well built. It handles abort, error mapping, sample labelling and the localhost QR guard. Findings:

**Finding 4, High. Cross-origin cookies.** `lib/api.ts` calls `fetch(..., { credentials: "include" })` to `NEXT_PUBLIC_API_BASE_URL`, and API.md proposes session ownership through a cookie. With the UI and API on different origins, the cookie is third-party. Safari on iOS blocks those by default, and Chrome is tightening restrictions on them. The "My Models" list and ownership checks would silently fail on the very phones needed for AR.
*Recommendation:* Serve the API same-origin. Add a Next.js `rewrites()` from `/api/:path*` to FastAPI and set `NEXT_PUBLIC_API_BASE_URL=/api`. This also means one tunnel URL serves the UI, the API and the GLBs, and CORS configuration disappears.

**Finding 5, High. Asset URL contract.** API.md does not say whether `glb_url` and `usdz_url` are absolute. The AR page passes them straight to `<model-viewer src>`. Scene Viewer is a separate Android app that fetches the URL itself, so a relative or `localhost` URL fails there even if it works in the page.
*Recommendation:* Specify in API.md that `glb_url` and `usdz_url` are absolute HTTPS URLs, built from `PUBLIC_APP_URL`, reachable without cookies or headers, and served with the correct MIME type.

**Finding 9, Medium. Loose types.**
- `JobStatusResponse` accepts both `job_id` and `id`, and both `error` and `error_code`/`error_message`.
- `listModels` accepts both a bare array and `{models}`.

Two shapes hide backend drift instead of catching it. *Recommendation:* Pick the API.md shape: `job_id`, plus `error: {code, message}`, plus `{models: [...]}`. Delete the alternatives. Optionally generate TypeScript types from FastAPI's OpenAPI with `openapi-typescript` once the backend exists. A hand-kept single shape is enough.

**Finding 10, Medium. Unbounded polling.** `pollJobUntilDone` loops until the job succeeds or fails. If the worker dies and leaves a job in `processing`, the UI spins forever. *Recommendation:* Enforce a backend timeout of about 5 minutes that marks the job `TIMEOUT`, and add a client-side cap as a backstop.

**Low.** The contract has no `GET /v1/jobs` endpoint, so a reload in the middle of a job loses it. Store the active `job_id` in `sessionStorage`, or accept the loss for the demo.

## 6. Model storage strategy

Local disk with random object keys, plus SQLite metadata, is enough. DATA.md's rules are good and cheap to keep: random keys, no original filenames, delete temporary files, and deletion revokes shares. Note that Gradio's client downloads results into a temp directory. Move each result into `data/models/` and remove the temp copy.

Supabase is an optional deployment step only. Its free-tier limits and terms change, so verify them at the time if it is ever used.

## 7. GLB and USDZ compatibility

- **GLB:** All five outputs pass the Khronos validator. TripoSR GLBs store colour in `COLOR_0` with no texture. model-viewer renders this. Whether Android Scene Viewer shows vertex colours **has not been tested**. Test it on a device before claiming coloured AR.
- **USDZ, Finding 3, Critical.** No `usdz_url` is produced, so on iOS model-viewer would convert the GLB to USDZ in the browser when the user taps AR. That conversion is untested here. The exporter is generally material and texture based, so vertex colours are **likely lost**, and the model could appear untextured grey in Quick Look. This must be verified on an iPhone.
  *Recommendation:* If colour is lost, the simplest fix is to bake vertex colours into a small texture in the backend cleanup step. Use a UV unwrap (`xatlas`) and rasterise the colours into an image, which also satisfies "textured". An alternative is a server-side USDZ export. Leave USDZ out of the MVP UI until it works, as REQUIREMENTS.md already allows.
- Keep files at 10 MB or less and triangles at about 100k or fewer for phones (finding 7).

## 8. Mobile AR feasibility

The approach is sound and standard: a QR code opens an HTTPS `/ar/{token}` page that runs model-viewer with `ar-modes="webxr scene-viewer quick-look"`. The frontend already refuses to encode localhost or non-HTTPS links in the QR code.

Unresolved points:
- None of these has been tested yet: phone reachability over a tunnel, MIME headers on the backend GLB route, Scene Viewer on an ARCore device, and Quick Look on an iPhone.
- The `/ar/sample` path works without a backend. Use it now, through a tunnel, to prove the AR chain on both phones before backend work starts. The phone test does not depend on the provider, so it can remove most of the AR risk on its own.
- Scale is estimated from a single image. Keep the "not measured" copy.

## 9. Security and scalability

**Finding 8, High. Privacy of uploads.** Phone photos often carry EXIF GPS and device data. Before forwarding an image to any third-party Space:
- decode it server-side with Pillow
- re-encode it without metadata
- cap its dimensions

This doubles as the decode validation that REQUIREMENTS.md asks for. Tell users on the upload panel that images go to Hugging Face, as AI_INTEGRATION.md requires. The step becomes unnecessary only if inference runs locally.

Other checks, all proportionate to a demo:
- Upload size limit enforced server-side as well as in the browser.
- A simple per-IP request limit, such as an in-memory counter, on `POST /v1/jobs`. The tunnel makes the app publicly reachable.
- `HF_TOKEN` stays backend-only. It is already correctly absent from `NEXT_PUBLIC_*`.
- Share tokens are 128-bit random with an expiry. GLB routes look files up by database ID only, never by a path from the user.
- The backend downloads only from the fixed provider, never from a URL supplied by the user, so there is no SSRF surface.

**Scalability:** Throughput is capped by the provider at about one job per 1.5–2 minutes, so backend scaling is irrelevant. Concurrency 1 plus a "queued" state is the honest design. Don't build horizontal scaling.

## 10. Suitability for a college mini-project

The scope fits once it is trimmed. The scope that will be evaluated:
- upload or capture a photo
- generate a real mesh
- orbit, zoom and download it
- scan a QR code
- place the model in AR on one phone

That is achievable with one FastAPI file plus a few modules, SQLite, the existing frontend and a tunnel.

Strengths to keep:
- the honest evidence trail
- the explicit sample labelling
- the refusal to fake progress or generation
- the validated GLB pipeline
- the polished frontend that already meets its own checks

Over-scope to cut or defer:
- the durable queue
- Supabase
- signed URLs
- the multi-provider adapter and fallback
- the provider selector UI
- the retention scheduler
- free-host backend deployment
- the USDZ, OBJ and STL conversions

## Unresolved blockers

1. **Requirement decision (owner or guide):** accept a coloured mesh with vertex colours as the MVP bar, or require true textures. If textures are required, that implies baking or a GPU route.
2. **Owned generation route:** duplicate the TripoSR Space into the team's account or run it locally. Either option needs a choice and an account or environment setup. An `HF_TOKEN`, if used, stays server-side.
3. **Device AR test:** run `/ar/sample` and one real TripoSR GLB through an HTTPS tunnel on an iPhone (Quick Look) and an ARCore Android phone (Scene Viewer). Record whether vertex colours survive.
4. **Missing test inputs:** one clean single-object toy photo, plus one cluttered real phone photo.
5. **Contract fixes before backend work:** same-origin `/api` proxy, absolute public asset URLs, one response shape, a job timeout.

## Recommended order

1. AR device test with the sample GLB (blocker 3). No backend needed.
2. Resolve blockers 1 and 2, then rerun the probe against the owned route.
3. Fix the API.md and `lib/api.ts` contracts (finding 4, 5, 9 and 10).
4. Build the minimal backend from section 4, including the cleanup or colour-bake step.
5. End-to-end run, device tests, then a recorded backup demo.

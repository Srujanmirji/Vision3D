# Vision3D engineering handoff

27 November 2026. The live proof of concept saved five GLBs across a chair, sneaker, headphones and a photo of toys. All five passed geometry validation and a desktop Chrome orbit through 360°. Hunyuan generated shape-only GLBs for the chair, sneaker and headphones. The community CPU TripoSR endpoint generated GLBs with vertex colors and OBJ files for the sneaker and toys.

For the geometry demo, use community CPU TripoSR as primary and Hunyuan3D-2 shape-only as the quota-dependent fallback. Hunyuan's textured route failed upstream. No tested route met the MVP's textured GLB requirement.

Start with [AI_RESEARCH.md](AI_RESEARCH.md) for provider coverage, licenses, timing and reproduction. The probe, validators, public input provenance and downloaded artifacts are under [verification/reconstruction](verification/reconstruction). Earlier Stability AI evidence is in [verification/phase0/RESULTS.md](verification/phase0/RESULTS.md).

The app's backend integration remains pending at the feasibility gate. The desktop browser orbit was verified. Device AR and USDZ are pending. Before wiring an adapter, establish a repeatable free textured GLB route and test a single-object toy photo. A free-account Hugging Face token is a possible follow-up only after its available quota is known. Treat two ZeroGPU Spaces as sharing a failure domain when considering fallback.

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

Start with step 3. It needs no backend.

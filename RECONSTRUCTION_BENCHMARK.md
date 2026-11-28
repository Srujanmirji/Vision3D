# Reconstruction benchmark

28 November 2026. Every number here comes from real model runs on this Mac (Apple M5, 16 GB, CPU inference). No result is mocked.

**Method:** `verification/audit-2026-11-28/scripts/bench.py` sends each photo through the real backend pipeline:
- `POST /v1/jobs`, which validates and strips the photo
- the real worker process
- `finish_mesh` validation
- the stored GLB

Each GLB was then rendered from six orthographic directions in headless Chrome (`render.mjs`). The contact sheets are `verification/audit-2026-11-28/sheet-sf3d.png` and `sheet-triposr.png`, and the raw rows are in `bench-ai.jsonl` and `bench-shape.jsonl`.

**Photos:** the five test photos in the repository:
- shoe, chair and headphones: `verification/reconstruction/inputs`
- toys: a cluttered shelf, deliberately a bad input
- bottle: `verification/reconstruction-quality/bottle.jpg`

**Not tested (no photo in the repository):** bags and real boxes. Downloading new photos needs the owner's approval.

## Does it generate genuine 3D?

**Yes.** Both models produce real, closed, textured meshes with geometry on every side. The six views confirm it: the rear, side, top and bottom views show surfaces that are not in the photo. Those hidden sides are **inferred, not measured**, which the UI already says.

## Results

| Photo | Model | Result | Time | Triangles | GLB size |
|---|---|---|---|---|---|
| Shoe | SF3D | PASS | 52.8 s (first job, includes model load) | 23,704 | 0.81 MB |
| Chair | SF3D | PASS | 23.9 s | 19,253 | 0.70 MB |
| Headphones | SF3D | PASS | 20.8 s | 23,808 | 0.85 MB |
| Bottle | SF3D | PASS, with defects | 19.3 s | 13,928 | 0.62 MB |
| Toys (cluttered) | SF3D | Job PASS, shape FAIL | 20.9 s | 3,484 | 0.20 MB |
| Shoe | TripoSR | PASS | 24.3 s (first job, includes load) | 63,718 | 4.52 MB |
| Chair | TripoSR | PASS, with defects | 22.8 s | 87,099 | 5.17 MB |
| Headphones | TripoSR | **FAIL** `INVALID_MODEL` | 23.8 s | 117,761 raw | – |
| Bottle | TripoSR | PASS | 18.3 s | 69,767 | 4.63 MB |
| Toys (cluttered) | TripoSR | Job PASS, shape FAIL | 14.2 s | 38,526 | 3.79 MB |
| Bottle | Round mode | PASS | 3.1 s | 40,960 | 1.36 MB |
| Headphones | Box mode | PASS (procedural box, as designed) | 2.5 s | 12 | 0.59 MB |

Times are wall-clock from upload to finished job. "Job PASS, shape FAIL" means the pipeline worked, but the model is not a usable 3D object.

## What the six views show

| Photo | SF3D (main) | TripoSR (fallback) |
|---|---|---|
| Shoe | Front very close to the photo, logo sharp. Sides thinner than a real shoe; rear and sole smooth and invented. | More volume, darker colour, softer texture. |
| Chair | Best result. Legs, seat and back all plausible from every side. | Good front; back has a ragged hole along its top edge. |
| Headphones | Front good. Very thin in side view. The yellow background fills part of the gap under the headband (**background contamination**). Rear is a flat beige. | Rejected: over the 100k-triangle budget (A-3). |
| Bottle | **Holes through the body** where the plastic is clear. The dark floor under the bottle became a base (**contamination**). | Solid body, no holes; same floor base. |
| Toys | Picked one robot and made a thin, flat sheet. | One robot with real depth, plus floating fragments. |

**Colour accuracy:** both keep the photo's colours on the visible side. SF3D is closer, because TripoSR darkens the result. Hidden sides get guessed colours.

**Texture stretching:** none visible on SF3D's front faces. Both show smeared texture on top and bottom faces, where there is no photo data.

**Summary:** SF3D is the better main model for shoes, chairs and other opaque products. It is worse than TripoSR on transparent objects, and neither handles clutter. For bottles, Round mode is the right tool.

## Texture resolution (SF3D, shoe)

| Texture | Time | GLB size | Worker peak memory |
|---|---|---|---|
| 512 | 29.1 s (includes warm-up) | 754 KB | 3.3 GB |
| 1024 (shipped) | 18.2 s | 810 KB | 4.1 GB |
| 2048 | 21.4 s | 961 KB | 4.2 GB |

The 2048 texture costs about 3 s and 150 KB more. The model's own detail limits sharpness, so 1024 is a reasonable default. I did not do a pixel-level sharpness comparison, so no quality score is given.

## Round and Box modes are not AI

Round and Box build a procedural shape (a lathe surface or a box) and wrap the photo on it. The difference shows in several places:
- **API:** the job's `provider` is `round` or `box`.
- **Shape selector:** it says "Wraps your photo onto a smooth round shape" and "Puts your photo on the front of a box… Depth is estimated", while AI mode says "Hidden sides are guessed".
- **Output:** the 12-triangle box is obviously not a reconstruction.

**Verdict: PASS**, clearly distinguished. One gap: on `/create` the result does not repeat which mode or model made it (see AUDIT_REPORT A-4).

## Silent fallback

Before this audit, a job whose SF3D attempt failed fell back to TripoSR and left **no log line**. This happened during SF3D integration (zero-area faces), and it looked like poor model quality. The backend now logs `provider_failed` with the code (fixed, see AUDIT_REPORT A-2). In this benchmark every SF3D job succeeded on SF3D: each row's provider is `sf3d-local`, so there was no hidden fallback.

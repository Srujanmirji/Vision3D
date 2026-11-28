# Performance report

28 November 2026. Apple M5, 16 GB, macOS, CPU inference. All figures are measured, not estimated.

**Memory caveat:** worker memory is the peak RSS sampled from `ps` every 0.5 s, so short spikes can be missed. Some later TripoSR samples (390–770 MB) are lower than the true model footprint. macOS compresses idle memory, so treat only the first-job TripoSR figure as its footprint.

## Generation time (upload to finished job, real backend)

| Model | First job (includes model load) | Later jobs |
|---|---|---|
| SF3D (main) | 52.8 s | 19.3–23.9 s (4 jobs) |
| TripoSR (fallback) | 24.3 s | 14.2–23.8 s (4 jobs) |
| Round mode | – | 3.1 s |
| Box mode | – | 2.5 s |
| Live site in Chrome (Vercel → tunnel → SF3D, shoe) | – | 44.3 s from clicking Generate to the model shown |

The live-site time includes the browser's polling interval, the network round trips, and the live backend's model state at that moment.

## Memory

| Process | Peak sampled RSS |
|---|---|
| SF3D worker | 2.9 GB on the first job, rising to 4.5 GB over 5 jobs |
| SF3D at texture 512 / 1024 / 2048 | 3.3 / 4.1 / 4.2 GB (process peak, `ru_maxrss`) |
| TripoSR worker | 3.0 GB on the first job |

Only one model stays in memory at a time (`WarmModel`), and a test covers it. On the 8 GB M1 Air named in CLIENT_MAC_GUIDE.md, a 4.5 GB worker leaves little room. **I have not measured it on an 8 GB machine: NOT TESTED.**

## Output size

| Model | GLB size | Triangles |
|---|---|---|
| SF3D | 0.20–0.85 MB | 3.5k–23.8k |
| TripoSR | 3.8–5.2 MB | 38k–87k |

Phone budget: 10 MB per file and 100k triangles. SF3D files are about five times smaller, so they load faster on phones and through the tunnel.

## Frontend

| Check | Result |
|---|---|
| `next build` | PASS |
| First-load JS per route | 103–147 kB |
| Shared JS | 102 kB |
| three.js and model-viewer | Loaded dynamically |
| Horizontal overflow at 375 and 1280 px | None |
| Page errors during the full Chrome flow | None |

**NOT TESTED:**
- Lighthouse and Core Web Vitals
- Frame rate on a phone
- Heap profiling for memory leaks

The code review found correct disposal: the three.js canvas disposes geometry, materials and textures and loses its context; object URLs are revoked; camera tracks are stopped.

## Backend overhead

`prepare_image` and `finish_mesh` are included in the times above. The Round and Box jobs (2.5–3.1 s in total, including background removal) bound that overhead at about 3 s.

## Release rehearsal on the M5

28 November 2026, IST. The new run loaded each model in its existing isolated environment and exercised the same worker routines as production. SF3D reported CPU. TripoSR reported MPS for model operations, with CPU marching cubes and other host work. GPU percentages came from the system-wide AGX driver during a live rehearsal, so they include rendering and other applications. They cannot be attributed to either worker alone. CPU percentage is the worker's sampled `ps` value with 100% representing one core. RSS is a 500 ms sample of resident memory, with shared and compressed unified memory outside a complete estimate.

| Worker, fixture | Cold model startup | First reconstruction | Warm reconstruction | Texture work, first / warm | Maximum observed worker RSS | Warm GLB |
|---|---:|---:|---:|---:|---:|---:|
| SF3D, sneaker, 1024 px | 30.23 s | 56.13 s | 38.14 s | 1.06 / 1.09 s | 2,529 MiB | 812,432 B |
| TripoSR, sneaker, 2048 px | 7.13 s | 67.52 s | 37.03 s | 52.98 / 20.72 s | 1,411 MiB | 4,522,232 B |

SF3D includes segmentation in its reconstruction time. TripoSR's separate sneaker segmentation took 4.54 s. The SF3D texture phase spans UV rasterization to material construction in the installed model. The instrumented TripoSR texture phase uses the worker's bake timer. Warm CPU peaks were 335% for SF3D and 501% for TripoSR. At those workload intervals the system GPU peaked at 73% and 100% respectively. The queued TripoSR headphones chose grid 224 after the grid-256 reconstruction exceeded budget, and its direct worker GLB was 5,387,884 bytes. The model warms once and the normal backend limits it to one active reconstruction. [Raw M5 timings](verification/release-demo/m5.json)

Reproduce with the installed local model environments:

```sh
.venv/bin/python verification/release-demo/benchmark_m5.py verification/release-demo/m5.json
.venv/bin/python verification/release-demo/queue_smoke.py
```

The release queue test accepted both TripoSR jobs before either completed at 0.016 and 0.027 seconds from start. The sneaker completed at 23.30 s. The headphones waited, then completed at 43.63 s with 90,111 published triangles and 5,387,884 bytes. Measurements used real jobs and the production queue implementation with isolated storage. [Queue timing](verification/release-demo/queue.json)

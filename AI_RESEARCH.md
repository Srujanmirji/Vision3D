# Single-image-to-3D proof of concept

27 November 2026, IST. **Real geometry demonstrated. No reliable free hosted provider qualified for the Vision3D MVP.** Hunyuan3D-2 produced three rotatable shape-only GLBs. The community CPU TripoSR Space also generated rotatable sneaker and toy meshes with vertex colors. Hunyuan texturing failed, and neither route demonstrated repeatable textured GLB generation. No MVP primary or fallback was selected.

The proof of concept is a server-side command-line probe, a GLB geometry inspector, and a Chrome orbit check. It calls live Gradio endpoints and keeps each result alongside the request timing and input hash. The public photographs were sent to Hugging Face Spaces. All calls were anonymous with implicit Hugging Face credentials disabled. No billing was enabled.

## Hosted providers

The run times below measure elapsed time from client setup through completion or failure, including upload, queue, processing, and download where applicable. They are not GPU-only inference measurements. Output descriptions in rows without a successful download describe the API or source contract.

| Candidate | Live API outcome | Output and license |
|---|---|---|
| Stable Fast 3D | Discovery and image preparation worked. The stateful `/run_button` returned an opaque upstream error on a real furniture photo in 7.64 s. Previous chair and shoe attempts also failed. | Native textured GLB in source; no output verified. [Stability AI Community License](https://huggingface.co/spaces/stabilityai/stable-fast-3d/blob/main/LICENSE.md). Model weights are gated separately from demo discovery. |
| TripoSR, official | Hub reported `RUNTIME_ERROR` and the client rejected discovery in 0.62 s. The runtime log reports a torchmcubes build dependency mismatch. | OBJ and GLB in source. [MIT model](https://huggingface.co/stabilityai/TripoSR). |
| TripoSR, community CPU | Anonymous shoe and toy runs returned OBJ and GLB in 139.99 s and 90.66 s (generation endpoints 131.60 s and 83.89 s including queue and download). An earlier Gradio timeout-argument conflict was corrected. No ZeroGPU allocation was required. A fixed CPU allowance and an uptime guarantee were not published in the live schema. | Verified OBJ download and vertex-colored GLB without a texture map. [Community Space](https://huggingface.co/spaces/AleenDG/3DGenTripoSR) declares MIT. |
| InstantMesh | Live discovery and furniture preprocessing worked. Multiview generation was rejected, 60 GPU seconds requested with 45 left. Failed in 9.55 s. No mesh call after failed multiview step. | OBJ and GLB in live schema. [Apache-2.0 model](https://huggingface.co/TencentARC/InstantMesh). |
| Hunyuan3D-2 | `/generation_all` on headphones failed in 18.38 s with texgen_worker undefined. `/shape_generation` returned three separate GLBs; the toy request failed in 5.97 s, 60 s requested with 40 left. | Verified shape-only GLB. [Tencent Community License](https://huggingface.co/tencent/Hunyuan3D-2/blob/main/LICENSE) includes territory limits on output use and distribution, including exclusions for the EU, UK and South Korea. |
| TRELLIS 1, community | Live discovery and toy preprocessing worked. Combined generation and extraction rejected, 120 s requested with 45 left. Failed in 12.18 s. | GLB in schema. [MIT model](https://huggingface.co/microsoft/TRELLIS-image-large). |
| TRELLIS.2, Microsoft | Live discovery and shoe preprocessing worked. Generation rejected, 90 s requested with 45 left. Failed in 7.11 s. | GLB export in schema. [MIT model](https://huggingface.co/microsoft/TRELLIS.2-4B). |
| TripoSG, VAST-AI | Live discovery. Headphone segmentation rejected, 60 s requested with 45 left. Failed in 6.90 s. | Shape and texture GLB endpoints in schema. [MIT model](https://huggingface.co/VAST-AI/TripoSG). |
| SPAR3D, Stability AI | Hub reported `BUILD_ERROR`; client rejected discovery. | Textured GLB advertised by [model card](https://huggingface.co/stabilityai/stable-point-aware-3d). No output verified. |

Hugging Face documents free access to public ZeroGPU Spaces and quota and queue differences by account tier. Our anonymous calls observed **45 seconds** and later **40 seconds remaining** with retry hints near 24 hours. These are responses from individual requests, not a universal daily entitlement. The errors explicitly recommend a token for more quota. Authenticated free-account quota, concurrency, and repeatability were not measured. Working preprocessing and discoverable endpoints did not prove generation access. [ZeroGPU documentation](https://huggingface.co/docs/hub/spaces-zerogpu) · [Hugging Face terms](https://huggingface.co/terms-of-service)

Commercial developer APIs were reviewed for eligibility. Meshy's free web plan did not establish a free developer API route. Tripo's separate developer API requires a bearer key and freezes credits on task creation. No paid API was called. [Meshy pricing](https://www.meshy.ai/pricing/) · [Tripo developer billing](https://developers.tripo3d.ai/en/docs/billing)

## Inputs and successful output

The four inputs are [public Unsplash photos](https://unsplash.com/license) of a chair, a sneaker, headphones, and a display of toys. The toy photo includes several objects, so it is a less controlled single-object test. All photographs were decoded and visually checked. The input URLs and SHA-256 digests are in [sources.json](verification/reconstruction/inputs/sources.json). No pre-generated model was submitted or used as a result.

| Provider and input | End to end | GLB size | Vertices | Triangles with positive area |
|---|---:|---:|---:|---:|
| Hunyuan · chair | 18.96 s | 7,094,676 bytes | 129,166 | 258,328 of 461,952 |
| Hunyuan · sneaker | 18.92 s | 6,941,388 bytes | 122,372 | 244,736 of 455,972 |
| Hunyuan · headphones | 16.60 s | 9,282,244 bytes | 170,991 | 341,993 of 602,424 |
| CPU TripoSR · sneaker | 139.99 s | 1,276,848 bytes | 31,943 | 63,728 of 63,728 |
| CPU TripoSR · toys | 90.66 s | 769,900 bytes | 19,246 | 38,412 of 38,412 |

Each successful GLB had an intact v2 header, finite indexed triangle geometry, and nonzero extent on all three axes when parsed with Trimesh. None had a base color texture. Hunyuan had no vertex colors and its full triangle counts include zero-area triangles. These Hunyuan files would need cleanup before delivery.

Both CPU TripoSR GLBs carried a vertex color attribute. The accompanying OBJ downloads were 3,425,914 bytes for the sneaker and 2,031,603 bytes for the toys. The three Hunyuan GLBs and both TripoSR GLBs passed the Khronos glTF Validator with zero errors and zero warnings. Hunyuan’s reports include informational findings for degenerate triangle indices.

All five validated GLBs loaded in Chrome using the project's model-viewer bundle. The check captured actual rendered views at 45-degree intervals from 0° through 360°, verified the camera angles and compared frame hashes. Per-image GLBs, geometry reports, browser readings, and screenshots are saved under [runs](verification/reconstruction/runs). The generated files remain local. Native mobile AR, Quick Look and USDZ were not tested.

## Reproduce

From the project root, use a Python 3.13 environment. The probe exits nonzero when a case fails, and writes its evidence before returning.

```sh
python -m pip install gradio_client==2.7.2 trimesh==5.2.2 numpy==2.5.5
python verification/reconstruction/probe.py hunyuan-shape:verification/reconstruction/inputs/electronics.jpg
python verification/reconstruction/validate_glb.py /path/to/mesh-0.glb
npm install --prefix /tmp/vision3d-browser playwright-core
NODE_PATH=/tmp/vision3d-browser/node_modules node verification/reconstruction/orbit.cjs /path/to/mesh-0.glb frontend/node_modules/@google/model-viewer/dist/model-viewer.min.js
```

The orbit check uses the local macOS Chrome installation. Python lint, strict type checks and dependency checks passed. Frontend lint and type checking passed, and all 13 existing tests passed.

## Provider decision

**Geometry proof of concept primary: community CPU TripoSR.** It completed two photo runs anonymously, generated vertex colors and had no zero-area triangles in either GLB. The two runs took 91–140 seconds.

**Geometry proof of concept fallback: Hunyuan3D-2 shape-only.** Three runs completed in 17–19 seconds. Use this route only when ZeroGPU quota and the model license permit it. It uses a separate compute pool from CPU TripoSR but shares the Hugging Face platform.

The proof of concept retains explicit provider choice so failures and provider provenance stay visible. MVP provider selection and app integration remain blocked until a candidate repeatedly returns a validated textured GLB within a documented free allowance.

# SF3D reconstruction quality report

28 November 2026, IST. Local SF3D on an Apple M5 Mac with 16 GiB RAM, macOS 27.2.1, using the CPU and the existing `ff21fc4` SF3D install. We used five real photos and the cached model weights. The evidence includes [six views of each baseline and reviewed result](verification/reconstruction-quality/six-view-comparison.jpg), [manual mask comparisons](verification/reconstruction-quality/edited-mask-comparison.jpg), and [texture and lighting comparisons](verification/reconstruction-quality/texture-comparison.jpg). The source photos and the SF3D input camera provide the visual reference. No reference scans or real rear-view photographs were available.

## 1. Unmodified baseline

The baseline was generated from Vision3D commit `206095cfc11ea09d762a9659a8622471d7b599f6` with automatic U²-Net segmentation, the original framing, and the default 1024 px matte bake. Cold worker startup took 26.82 seconds. Timing below starts once a worker request arrives and includes in-worker segmentation, inference and export. Peak RSS is the highest 100 ms process sample during each request in MiB. OS memory pressure, allocator reuse, caching and sampling cadence can affect this figure.

| Photo | Worker s | Peak RSS MiB | Vertices | Triangles | Bytes | Generated GLB |
|---|---:|---:|---:|---:|---:|---|
| Chair | 37.89 | 2276.0 | 11,869 | 19,253 | 697,184 | [GLB](verification/reconstruction-quality/baseline/chair.glb) |
| Sneaker on red | 26.92 | 2634.5 | 13,554 | 23,704 | 810,456 | [GLB](verification/reconstruction-quality/baseline/shoe.glb) |
| Water bottle | 23.26 | 4392.9 | 10,207 | 13,928 | 615,552 | [GLB](verification/reconstruction-quality/baseline/bottle.glb) |
| Toy in clutter | 23.33 | 3569.6 | 2,421 | 3,484 | 200,736 | [GLB](verification/reconstruction-quality/baseline/toy.glb) |
| Headphones | 23.62 | 2974.4 | 14,455 | 23,808 | 849,832 | [GLB](verification/reconstruction-quality/baseline/electronics.glb) |

The renderer uses six axis-aligned orthographic views and saves individual transparent PNGs in each run directory. SF3D's conditioning camera maps to the output's negative Z axis. The right and left views are named relative to that camera. The sneaker retains the side logo and recognizable sole silhouette, while the underside has little tread detail. The chair shows seat depth and visible legs, with approximate rear and underside detail. The clear bottle absorbed a reflection into its base. The toy has a plausible front texture over shallow geometry. The headphones' headband opening retains yellow background, and the unseen surfaces have weak material fidelity.

The four existing inputs and their hashes are listed under [source photos](verification/reconstruction/inputs/sources.json). The additional bottle is a resized, EXIF-stripped copy of the CC0 photograph by Jiafei Slay Queen. [Wikimedia Commons source](https://commons.wikimedia.org/wiki/File:Bottle_of_Water.jpg)

## 2. Foreground preview and mask review

The local preview endpoint returns a transparent full-frame PNG, aligned grayscale mask and suggested crop bounds. The workspace dialog lets users erase, restore, reset and adjust minimum opacity. The same source image accompanies the reviewed mask at submission. The server validates the mask, uses an inclusive object crop with transparent padding, removes color from fully transparent pixels and replaces contaminated RGB only on soft pixels within two pixels of high-confidence foreground. Isolated visible detail and opaque pixels keep their original color. The reviewed path stays on SF3D so a fallback cannot discard the edit. This capability is available in the creation workspace, including photos captured into that workspace.

U²-Net preview took 7.69–8.63 seconds per photo in fresh local subprocesses. The automatic masks still retained the bottle reflection and yellow inside the headband. The unedited reviewed path changed geometry and degraded headphone thickness and the toy's side view, so this evaluation retained the existing automatic path.

Two hand-traced edits were submitted to the real API. With the same human-edited reference mask for all versions of each object, approximate front silhouette overlap (IoU) moved from **0.525 to 0.912 for the bottle** and **0.783 to 0.933 for the headphones**. This comparison measures agreement with the edited mask. The bottle lost the prominent false base and the headphones recovered more of the headband opening. The headphones still look too thin from the side. For the cluttered toy, neither automatic pipeline produced a convincing volume. A valid GLB and high front overlap can coexist with these failures. [Edited GLBs and API results](verification/reconstruction-quality/edited)

Regression tests cover a red fringe, weak cast shadow, a detached thin strap, a shoe-sole edge, a foreground running into the source border, empty and mismatched masks, the endpoint capability gate, and delivery of the exact reviewed crop to a local-only worker. The synthetic regression inputs exercise specific pixel behavior. The geometry comparisons use real photos.

## 3. Texture size, roughness, normals and lighting

Both bakes in each row used the same reviewed input and the same matte settings. Vertex positions and triangle indices have matching hashes within each pair.

| Photo | Texture | Worker s | Peak RSS MiB | GLB bytes | Triangles |
|---|---:|---:|---:|---:|---:|
| Chair | 1024² | 28.33 | 3584.0 | 739,176 | 20,480 |
| Chair | 2048² | 28.71 | 3382.5 | 890,196 | 20,480 |
| Sneaker | 1024² | 18.98 | 3834.5 | 837,124 | 24,257 |
| Sneaker | 2048² | 26.33 | 3721.8 | 998,376 | 24,257 |

The 2048 px GLBs were about 19–20% larger. On the overlapping opaque front-view pixels, mean RGB changes were 1.92/255 for the chair and 2.20/255 for the shoe. These numbers measure change. The renders showed slight differences at texture edges, with no convincing repeatable detail gain at the tested viewing scale. The sequential run's RSS differences are observational. The 1024 px default remains in use.

The shoe's model-predicted material had roughness 0.121, metallic 0.0033 and a normal map. Roughness-only and normal-only versions preserve the same position and index data. Average RGB change was 7.06/255 for roughness alone and 1.91/255 for the normal map alone. A reduced key light under the same camera softened the highlights. Gloss and inferred surface detail can make the photo-derived texture look wet. The normal-mapped outputs drew Khronos' generated-tangent warning. Production remains matte at roughness 1.0 and metallic 0 with vertex normals and the base-color texture. [SF3D upstream implementation](https://github.com/Stability-AI/stable-fast-3d) · [Texture and light renders](verification/reconstruction-quality/reviewed)

## 4. Verification and quality estimates

Existing publication checks continued to validate GLB structure and embedded textures. The independent offline quality report records measured triangle and vertex counts, extent on each axis and degenerate triangles under its documented area tolerance. Its heuristic fields report PCA thickness, surface area within 15° of the dominant normal axis and optional normalized front-mask overlap. The flags identify near-planarity, limited thickness, dominant parallel surfaces, small triangles and poor silhouette overlap for visual review.

All five baseline files and both manually edited downloads independently parsed as textured meshes with nonzero 3D bounds and zero degenerate triangles. Six-angle review distinguishes the solid chair and sneaker from the shallow toy. The toy is flagged as thin in both versions, and the unedited reviewed headphones are flagged for thinness and dominant parallel surfaces. The bottle and headphones' inferred rear and underside textures remain approximate. Reports contain geometry measurements and estimates in separate fields. There is no reconstruction accuracy score.

The independent Khronos run covered 18 GLBs with zero errors. The two warnings came from the experimental normal-mapped variants. [Geometry and texture report](verification/reconstruction-quality/analysis.json) · [Khronos results](verification/reconstruction-quality/khronos.json) · [Khronos GLB validator](https://github.com/KhronosGroup/glTF-Validator)

The locally served production build was tested in Chromium at 375 px and 1280 px. The browser check exercised keyboard focus, brush editing, the opacity slider, mask submission and real SF3D generation. The cold sneaker job took 71.81 seconds and the downloaded GLB contained 26,028 triangles. Ruff, strict mypy, 49 backend tests, ESLint, TypeScript, 64 frontend tests and the Next.js production build passed. Three opt-in hosted inference tests were skipped. [Browser results and screenshots](verification/reconstruction-quality/browser)

## Reproduce

Use the local Python environments from [DEPLOYMENT.md](DEPLOYMENT.md), cached SF3D and U²-Net weights, and frontend dependencies. From the repo root:

```sh
git show 206095cfc11ea09d762a9659a8622471d7b599f6:backend/local_sf3d/infer.py > /tmp/vision3d-original-sf3d.py
.venv/bin/python verification/reconstruction-quality/benchmark.py /tmp/vision3d-baseline \
  --infer /tmp/vision3d-original-sf3d.py --baseline
.venv/bin/python verification/reconstruction-quality/benchmark.py /tmp/vision3d-reviewed
node verification/reconstruction-quality/material_variants.mjs /tmp/vision3d-reviewed/shoe-model-material.glb
node verification/reconstruction-quality/render.mjs /tmp/vision3d-baseline/*.glb /tmp/vision3d-reviewed/*.glb
VISION3D_TEST_LIGHT=soft node verification/reconstruction-quality/render.mjs /tmp/vision3d-reviewed/shoe*.glb
```

For an independent geometry report on an existing result:

```sh
cd backend
../.venv/bin/python -m app.quality ../verification/reconstruction-quality/edited/bottle.glb \
  --input-mask ../verification/reconstruction-quality/edited/bottle-mask.png \
  --front-render ../verification/reconstruction-quality/edited/bottle-front.png
```

For browser and mask tests, start an isolated API with `LOCAL_SF3D_HOME` configured, `LOCAL_FRONTEND_ORIGIN=http://127.0.0.1:3391` and port 8391. Build Next.js with `VISION3D_BACKEND_ORIGIN=http://127.0.0.1:8391`, start it at port 3391, then run the following from the repo root. Set `CHROME_PATH` if Chrome is outside the default macOS path.

```sh
.venv/bin/python verification/reconstruction-quality/edited_masks.py --out /tmp/vision3d-edited
node verification/reconstruction-quality/browser.mjs
```

Validate the GLBs with a standalone copy of Khronos' validator:

```sh
validator_dir=$(mktemp -d)
npm install --prefix "$validator_dir" gltf-validator@2.0.0-dev.3.10
GLTF_VALIDATOR_MODULE="$validator_dir/node_modules/gltf-validator" \
  node verification/reconstruction-quality/validate.mjs verification/reconstruction-quality/*/*.glb
```

# Phase 0 provider verification

Tested 27 November 2026, approximately 18:55–18:57 IST. **Blocked: no verified free generation route.** Neither documented candidate produced a GLB. This is a result for these endpoints at test time, not a claim that all free providers are unavailable.

## Scope and environment

Read all 12 project Markdown files and inspected `design-reference.png` before testing. No frontend or application backend existed at the start. The approved dark copper design is unchanged. No production provider was selected, no paid inference was used, and no authentication or subscription was added.

Created a local `.venv` with Python 3.13.14, `gradio_client` 2.7.2 and Pillow 13.0.0. Exact installed versions are in `environment.txt`. Requests used TLS verification. Initial Python standard-library requests failed because its default certificate store lacked the issuer; requests through httpx's verified certificate bundle succeeded. An initial client invocation used the older `hf_token` argument; after inspecting the installed signature, tests used `token=None`. These local setup errors are distinct from the provider results below. No HF_TOKEN was configured in the environment or supplied to the client; anonymous quota was tested.

## Terms and quota review

- [Hugging Face ZeroGPU documentation](https://huggingface.co/docs/hub/spaces-zerogpu) states that existing ZeroGPU Spaces are free to use, with usage quotas and queue priority affected by account tier. No fixed anonymous daily allowance or available balance was established. Public availability is not an uptime or capacity guarantee. No billing was enabled.
- [Stable Fast 3D license](https://huggingface.co/spaces/stabilityai/stable-fast-3d/blob/main/LICENSE.md): Stability AI Community License; research/noncommercial use is royalty-free subject to its conditions. Commercial use adds registration and revenue conditions; distribution has license and attribution obligations. This review does not establish production compliance. Preserve the license and attribution when integrating after feasibility succeeds.
- [TripoSR model card](https://huggingface.co/stabilityai/TripoSR) identifies an MIT license. Its live Space metadata also identifies MIT. A permissive model license does not guarantee a working hosted endpoint.

## Executed tests

| Provider / input | Observed result | Evidence |
| --- | --- | --- |
| Stable Fast 3D discovery | Hub reports RUNNING; `Client.view_api(return_format="dict")` succeeds with four named endpoints. | `stable-fast-3d-metadata.json`, `stable-fast-3d-api.json` |
| Stable Fast 3D chair | Decoded actual 512×512 RGBA PNG, uploaded it, and called `/requires_bg_remove`; preprocessing returned a downloadable preview. `/run_button` then failed after 3.17 seconds with AppError. | `chair-attempt.json`, `chair.png`, `downloads/` |
| Stable Fast 3D shoe | Decoded actual 512×341 RGB JPEG, uploaded it, and called `/requires_bg_remove`; it returned a background-removal-required update. `/run_button` failed after 2.63 seconds with AppError, before any second processing/generation call could be made. | `shoe-attempt.json`, `shoe.jpg` |
| TripoSR discovery | Hub reports RUNTIME_ERROR; Gradio Client rejects connection. Upstream startup fails installing torchmcubes: scikit-build-core 0.12.2 is below the required 1.0. No image submission was possible. | `TripoSR-metadata.json`, `TripoSR-connection-error.json` |

Stable Fast 3D's exact error for both images was: `The upstream Gradio app has raised an exception but has not enabled verbose error reporting. To enable, set show_error=True in launch().` No root cause can be established from that message. It does not prove a quota or token issue, and adding a token is not a demonstrated fix.

The input files are explicitly **sample test inputs**, not generated model results. The chair is a provider-supplied example PNG, not claimed to be a camera photograph; the shoe is a public shoe photograph. Their URLs and SHA-256 digests are recorded in the attempt files. The downloaded WebP is only a preprocessing preview. No sample mesh or cached provider GLB was used as an inference result.

The schema and runtime configuration were inspected before endpoint calls. The client retained the same session for preprocessing and generation. The live configuration confirms the button and background image are server-managed inputs. The provider source indicates native GLB export, but successful output format, texture preservation, and geometry quality remain unverified. The duplicate all-components schema records an additional discovery check, not a successful generation.

## Checks and acceptance

- Pillow decoded and loaded both input files successfully.
- `python -m pip check`: passed, no broken requirements.
- Evidence validation: recorded JSON parses; input hashes match; both recorded generation attempts contain errors and no successful model result.
- Application lint, type checks, unit/integration/E2E tests: not run; application code and test suites have not been scaffolded because the feasibility gate failed. Live provider smoke tests above were executed.
- GLB validation, independent viewer, model-viewer, USDZ export, HTTPS sharing and phone AR: **not run**, because no generated model exists. No iPhone or Android device acceptance was performed.

## Decision and handoff

Keep all Phase 0 checkboxes pending: endpoint/license review was performed, but usable quota and generation capability were not verified. Stop before Phase 1 as required by `AI_INTEGRATION.md`. Backend, database, job worker, camera, QR and AR implementation remain pending. Frontend work should preserve `DESIGN.md`, avoid presenting any provider as verified, and avoid fabricated models, statistics, availability or progress.

Resume by re-running discovery and actual chair/shoe inference after the public Space is repaired, or testing another explicitly free hosted candidate. A separately configured self-hosted GPU route requires separate setup. Do not enable paid inference as a fallback. Once a genuine GLB passes validation and viewing, continue the sequential checklist and actual device acceptance.

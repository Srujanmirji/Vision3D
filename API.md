# API contract
| Method | Path | Result |
|---|---|---|
| POST | /v1/jobs | multipart image, optional supported options; 202 job_id/status |
| POST | /v1/preprocessing/foreground | local SF3D foreground preview; transparent PNG, grayscale PNG and crop bounds |
| GET | /v1/jobs | session-scoped job history with limit and offset |
| GET | /v1/jobs/{id} | status, stage, progress, error, model_id and provider |
| DELETE | /v1/jobs/{id} | cancel active job, return terminal status |
| GET | /v1/models/{id} | metadata, GLB URL, optional USDZ URL |
| GET | /v1/models | session-scoped list with limit and offset |
| GET / HEAD | /v1/models/{id}/glb | private inline GLB or attachment with download=true |
| POST | /v1/models/{id}/share | expiring token and mobile URL |
| DELETE | /v1/models/{id}/share/{token} | revoke one link as the owner |
| GET | /v1/share/{token} | read-only asset metadata |
| GET / HEAD | /v1/share/{token}/glb | expiring cookie-free GLB, Range support, optional download=true |
| DELETE | /v1/models/{id} | revoke shares and delete assets |
| POST | /v1/captures | desktop session: start a single-use, 10-minute phone-capture link (`token`, `capture_url`, `expires_at`) |
| GET | /v1/captures/{token} | public: link status (`expires_at`, `received`); 404 unknown, 410 expired |
| POST | /v1/captures/{token} | public: the phone's one photo (multipart, consent required); 202, then 409 `CAPTURE_USED` |
| GET | /v1/captures/{token}/job | desktop owner only: `job_id` once the phone has sent, else `null` |
| GET | /health | provider configuration and upload limits |
| GET | /health/live | process liveness |
| GET | /health/ready | store and provider configuration readiness |
| GET | /health/inference | observed inference status, without starting work |
| GET | /openapi.json, /docs | generated OpenAPI and interactive reference in local mode |

Status: queued, processing, succeeded, failed. Progress nullable. Job failures include INVALID_IMAGE, PROVIDER_UNAVAILABLE, QUOTA_EXCEEDED, TIMEOUT, INVALID_MODEL, CANCELLED and INTERRUPTED. Return structured code/message, no stack traces. Use anonymous session ownership via secure cookie or signed session token; authorize all private operations. Rate-limit uploads, restrict CORS, enforce size limits. Public share tokens grant read-only access until expiry.

Advertised as `foreground_preview` in `/health`, foreground preview accepts the same multipart `image` field as an AI job. The no-store response includes `width`, `height`, the exclusive pixel bounds `crop` as `[left, top, right, bottom]`, and full-frame base64 PNG bytes in `cutout_png` and `mask_png`. Dimensions reflect EXIF orientation and the 1024 px backend limit. Submit the same photo and an optional opaque grayscale PNG as multipart `foreground_mask` to `POST /v1/jobs`. The mask must match the preview dimensions and fit within 1,100,000 bytes and the existing multipart limit. A reviewed mask uses local SF3D in `auto` mode with background removal enabled. The backend frames the mask once and sends the result directly to SF3D.

## Backend contract decisions

Use a single FastAPI process, SQLite, and private local files. Deploy behind one origin with a proxy mapping `/api/*` to this service. The backend accepts an explicit loopback origin for local development. Session cookies are HttpOnly and SameSite=Lax, and Secure for public HTTPS. Public share URLs and their GLB URLs are absolute HTTPS URLs anchored to configured `PUBLIC_APP_URL`. Private GLB URLs use the configured API base and require the session cookie.

Use only `job_id`, `error: {code, message}`, and `{models: [...]}`. `GET /v1/jobs` provides owned history. `DELETE /v1/jobs/{id}` cancels active work and returns its status. Cancellation is represented as terminal `failed` with stage `cancelled` and code `CANCELLED`, preserving the four-state contract. `GET /v1/models/{id}/glb` serves the model inline, with `?download=true` for attachment. `GET /v1/share/{token}/glb` is cookie-free and validates expiry on each fetch.

Uploads accept `remove_background` where supported and require `allow_external_processing=true` for hosted inference. The service strips metadata and caps dimensions before forwarding the image. Queue wait and execution have independent deadlines. A job that exceeds its queue wait returns `QUEUE_TIMEOUT`. Execution covers provider attempts and model processing. `/health` advertises the browser polling budget. Percentage remains null. TripoSR color baking produces an embedded base-color map derived from inferred vertex colors. Optional Hunyuan shape-only fallback is available only in explicit geometry-demo mode and is labeled in the model metadata. The backend does not return a USDZ URL for current generated assets. For Quick Look, Model Viewer converts the shared GLB to USDZ on the phone.

The server retries transient transport failures once within the same deadline and can switch to an explicitly enabled fallback. A new user retry is a new upload because source images are removed after terminal completion. Backend job stages reflect local work and provider-reported queue/running events. The upload limit applies to decoded JPEG, PNG and WebP inputs, and an independent request-body bound covers multipart overhead. Model metadata includes the publication provider, triangle and vertex counts, extents in model units, byte size and appearance. Shared metadata also includes appearance. Readiness checks configuration and local storage, without promising upstream capacity.

## Phone capture

A desktop session can start a phone-capture link and show it as a QR code. The phone opens `/capture/{token}` and sends one photo without any session cookie.
- **Validation:** the photo goes through the same checks as `POST /v1/jobs`: consent, rate limit, size and decode limits, metadata stripping and the queue checks.
- **Ownership:** the resulting job belongs to the desktop session that created the link. The phone never receives the job ID.
- **Lifetime:** links last 10 minutes and are stored as hashes. They are claimed atomically, so only one upload succeeds. A rejected attempt, such as one without consent, does not use the link up.
- **Requirement:** like sharing, phone capture needs `PUBLIC_APP_URL`. Without it the server returns `CAPTURE_UNAVAILABLE`.

## Generation mode

`POST /v1/jobs` and `POST /v1/captures/{token}` accept an optional `mode` form field:
- `auto` (default): AI reconstruction through the provider chain.
- `box`: for packaging, books and phones. The photo goes on the front face of a box; the other faces take the product's colour at each height, and the depth is estimated (0.35 × width).
  - Same requirements and privacy as `round`; without local processing the server returns `422 BOX_MODE_UNAVAILABLE`.
- `round`: for bottles, cans and jars. The object is cut out, its silhouette is spun into a round mesh, and the photo is wrapped on as the texture.
  - Needs local processing (`LOCAL_TRIPOSR_HOME`); without it the server returns `422 ROUND_MODE_UNAVAILABLE`.
  - Never leaves the machine, so consent is not required.

`GET /health` reports:
- `round_mode` and `box_mode`: whether each shape mode is available.
- `external_processing`: whether any provider is hosted. When it is `false`, the UI hides the consent checkbox.

# API contract
| Method | Path | Result |
|---|---|---|
| POST | /v1/jobs | multipart image, optional supported options; 202 job_id/status |
| GET | /v1/jobs | session-scoped job history with limit and offset |
| GET | /v1/jobs/{id} | status, stage, progress, error, model_id and provider |
| DELETE | /v1/jobs/{id} | cancel active job, return terminal status |
| GET | /v1/models/{id} | metadata, GLB URL, optional USDZ URL |
| GET | /v1/models | session-scoped list with limit and offset |
| GET / HEAD | /v1/models/{id}/glb | private inline GLB or attachment with download=true |
| POST | /v1/models/{id}/share | expiring token and mobile URL |
| GET | /v1/share/{token} | read-only asset metadata |
| GET / HEAD | /v1/share/{token}/glb | expiring cookie-free GLB, Range support, optional download=true |
| DELETE | /v1/models/{id} | revoke shares and delete assets |
| GET | /health | provider configuration and upload limits |
| GET | /health/live | process liveness |
| GET | /health/ready | store and provider configuration readiness |
| GET | /openapi.json, /docs | generated OpenAPI and interactive reference |

Status: queued, processing, succeeded, failed. Progress nullable. Job failures include INVALID_IMAGE, PROVIDER_UNAVAILABLE, QUOTA_EXCEEDED, TIMEOUT, INVALID_MODEL, CANCELLED and INTERRUPTED. Return structured code/message, no stack traces. Use anonymous session ownership via secure cookie or signed session token; authorize all private operations. Rate-limit uploads, restrict CORS, enforce size limits. Public share tokens grant read-only access until expiry.

## Backend contract decisions

Use a single FastAPI process, SQLite, and private local files. Deploy behind one origin with a proxy mapping `/api/*` to this service. The backend accepts an explicit loopback origin for local development. Session cookies are HttpOnly and SameSite=Lax, and Secure for public HTTPS. Public share URLs and their GLB URLs are absolute HTTPS URLs anchored to configured `PUBLIC_APP_URL`. Private GLB URLs use the configured API base and require the session cookie.

Use only `job_id`, `error: {code, message}`, and `{models: [...]}`. `GET /v1/jobs` provides owned history. `DELETE /v1/jobs/{id}` cancels active work and returns its status. Cancellation is represented as terminal `failed` with stage `cancelled` and code `CANCELLED`, preserving the four-state contract. `GET /v1/models/{id}/glb` serves the model inline, with `?download=true` for attachment. `GET /v1/share/{token}/glb` is cookie-free and validates expiry on each fetch.

Uploads accept `remove_background` where supported and require `allow_external_processing=true` for hosted inference. The service strips metadata and caps dimensions before forwarding the image. Queue wait and execution have independent deadlines. A job that exceeds its queue wait returns `QUEUE_TIMEOUT`. Execution covers provider attempts and model processing. `/health` advertises the browser polling budget. Percentage remains null. TripoSR color baking produces an embedded base-color map derived from inferred vertex colors. Optional Hunyuan shape-only fallback is available only in explicit geometry-demo mode and is labeled in the model metadata. The backend does not return a USDZ URL for current generated assets. For Quick Look, Model Viewer converts the shared GLB to USDZ on the phone.

The server retries transient transport failures once within the same deadline and can switch to an explicitly enabled fallback. A new user retry is a new upload because source images are removed after terminal completion. Backend job stages reflect local work and provider-reported queue/running events. The upload limit applies to decoded JPEG, PNG and WebP inputs, and an independent request-body bound covers multipart overhead. Model metadata includes the publication provider, triangle and vertex counts, extents in model units, byte size and appearance. Shared metadata also includes appearance. Readiness checks configuration and local storage, without promising upstream capacity.

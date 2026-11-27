# Architecture
Browser → Next.js UI → FastAPI → provider adapter → hosted AI inference → validate GLB → object storage → viewer / mobile AR.

Use asynchronous jobs with persisted status. API returns job ID immediately; frontend polls with backoff. Worker downloads provider output, validates file size and GLB header/structure, stores it and updates status. Use a durable queue or database-backed worker for deployment; in-process jobs are local-development only. Limit concurrency and retries. Use opaque random share tokens with expiration. No camera stream from phone to desktop.

## Suggested repository
```
frontend/app/{create,models,ar/[token]}/
frontend/components/{viewer,upload,sidebar,ar-dialog}/
backend/app/{main,schemas,providers,workers,storage}/
backend/tests/
```
Use model-viewer client-side only; isolate browser APIs from SSR. Keep API contracts independent of provider implementation.

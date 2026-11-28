# Vision3D release rehearsal

28 November 2026, IST. The candidate is suitable for continued supervised rehearsal. It is not production-ready. The outstanding gates are a stable public origin and recorded physical acceptance on iPhone and Android.

## Outstanding audit findings

| Finding | Evidence and disposition |
|---|---|
| A-1, P1 | Applied the upstream warm-worker cancellation fix. Added a protocol recovery test for malformed worker replies. Once the pipe is discarded, the next attempt opens a fresh worker. |
| A-5, P1 | Reproduced a full Quick Tunnel failure. Vercel returned HTTP 530 with Cloudflare error 1033. The Mac supervisor now restarts backend and connector independently. A Uvicorn integration test confirms backend restart preserves the connector PID and a named connector retry preserves its hostname. A real named Cloudflare route still needs an available DNS zone. |
| A-6, P1 | Physical iPhone discovery found a paired iPhone 14 Pro Max. Native placement requires hands-on camera movement, gestures and return. Android adb discovery showed no attached device. The operator is equipped to test both. See the separate device result table. |
| A-2 to A-4 | Provider fallback is logged. The tight-budget TripoSR change was exercised on headphones and published a 90,111-triangle GLB. Provider attribution in the result view remains separate from worker readiness. |
| A-7 | Real SF3D masks and quality diagnostics are documented in [RECONSTRUCTION_QUALITY_REPORT.md](RECONSTRUCTION_QUALITY_REPORT.md). Thin, transparent and cluttered objects remain reconstruction limits. |
| A-8 to A-10 | The shared upload bucket remains behind the untrusted public proxy. Public-mode FastAPI disables its schema and UI routes. Settings can read the full provider chain and the consent copy distinguishes a conditional hosted upload. The public tunnel remains an alternate API ingress. |
| Security S-4 | The owner can revoke a single share via the API. A regression proves a guest cannot revoke it and another link to the same model remains active. |
| A-11 to A-14 | The local browser workflow checked the fullscreen target, four viewports and the geometry and compare paths. Mobile AR presets and the return link now use 44 px targets. Other controls still need a complete tap-area audit. The intermittent 404 and independent Firefox compatibility remain unverified. |

## Recovery and verification

The live smoke passed after restoration. SF3D accepted the request in 0.29 s and generated the sneaker in 68.02 s. The 815,624-byte download contained 23,694 triangles. The browser exercised interactive orbit, wireframe, both download buttons, and the decoded QR. A fresh mobile-sized guest loaded the same model without cookies. The guest GLB supported HEAD and byte ranges, the private GLB returned 404 without the owner session, and deletion returned 204 and invalidated the guest asset. Strict USDZ and GLB package checks passed independently. An earlier public HEAD check stalled, and a later inference poll was interrupted when the Quick Tunnel went down. [Public browser results](verification/release-demo/deployed-browser.json)

The backend now exposes independent reachability and observed worker state. An accepted job retains its ID through 45 seconds of consecutive transient status failures before the UI asks to check it again. Guest metadata retries once on transient failure. The backend preserves completed data and marks queued or running jobs interrupted if the API restarts. [API contract](API.md)

The candidate backend uses the existing production data and model environments. macOS denied launchd access to the Downloads checkout. The active supervisor was staged under Application Support in a private runtime snapshot. The established Vercel build was redeployed with the replacement origin, preserving the public frontend source while exercising the updated backend. The local frontend candidate is tested separately. See [Deployment](DEPLOYMENT.md) for exact recovery commands.

Two concurrent submissions to an isolated real TripoSR backend each returned 202 in under 30 milliseconds. The second queued until the first finished, and they completed at 23.30 s and 43.63 s from the first submission. The last worker status was ready. [Queue evidence](verification/release-demo/queue.json)

The public camera UI passed capture, retake, no automatic upload, and denial recovery using a Chromium camera fixture on a mobile viewport. The fixture supplies camera frames while the public site runs its normal camera UI. This evidence is separate from physical camera acceptance. [Camera evidence](verification/release-demo/camera.json)

Backend Ruff, strict mypy and pytest passed with 55 tests, three opt-in hosted tests skipped, and 84% statement coverage. Frontend ESLint, TypeScript, 68 Vitest tests, and the Next.js production build passed. The tested production browser fixture ran across four viewports with zero recorded accessibility violations at the audited narrow viewport. `pnpm audit --prod` reported no known vulnerabilities. [Local browser results](verification/release-demo/local-browser/result.json)

See [AR compatibility](AR_COMPATIBILITY_REPORT.md), [physical device acceptance](AR_DEVICE_TESTING.md), [performance](PERFORMANCE_REPORT.md), [deployment checklist](DEPLOYMENT_CHECKLIST.md) and [known limitations](KNOWN_LIMITATIONS.md).

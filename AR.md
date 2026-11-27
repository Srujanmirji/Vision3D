# Mobile camera and AR
Take Photo opens a live HTTPS preview using getUserMedia with a rear-facing preference and no microphone. Capture produces a JPEG for the existing validation, preview and consent-gated generation path. On denial or failure, the dialog offers the gallery and a native file input with `capture="environment"`. Camera tracks stop on capture, close, and page exit.

Desktop View in AR opens a QR dialog containing HTTPS /ar/{token}. Mobile scans QR using its camera and opens the model page. Render model-viewer with camera-controls, ar, ar-modes="webxr scene-viewer quick-look", src pointing to GLB and ios-src to USDZ when available. Quick Look uses Model Viewer to generate a textured USDZ blob on demand when no explicit `ios-src` is supplied. The blob uses `model/vnd.usdz+zip`. A generated textured GLB passed package validation with `usdchecker --arkit --strict`. Phone launch and rendering remain unverified. AR launch requires a user tap. Native AR handles camera permission, tracking, floor placement and gestures. Native UI is OS-controlled; do not promise custom controls inside it.

Use reachable HTTPS asset URLs, correct MIME types (model/gltf-binary, model/vnd.usdz+zip), sufficient expiry and CORS. Native viewers must fetch without custom auth headers. Do not encode localhost in QR. For development use an HTTPS tunnel or deployed preview; verify phone can reach assets. Detect unsupported AR and show interactive 3D fallback. Model size is estimated; allow scaling and avoid claiming measured dimensions. Test Safari on iPhone and Chrome on ARCore-capable Android. No phone camera streaming or WebRTC needed.


## Deployment and verification

Set FastAPI `PUBLIC_APP_URL` to the canonical public HTTPS DNS origin. Route the origin's `/api/*` through Next.js to FastAPI. The QR must be scanned from a different network before a demo. A localhost or private-LAN address cannot substitute for that check. Use a normal TLS certificate trusted by both phones.

A share token protects read-only metadata and file access. Its GLB endpoint accepts GET and HEAD, serves byte ranges, and returns `model/gltf-binary` with public-asset CORS and no-store. Private models still require the owner session. The public AR page refuses mismatched asset hosts or tokens and expires at the backend-provided time. Open the browser from the QR directly in Safari or Chrome if a scanner's embedded browser does not support AR.

The [physical-device checklist](AR_DEVICE_TESTING.md) covers rear camera permissions, QR scanning, WebXR, Scene Viewer, Quick Look, texture appearance and real placement. Native placement and app handoff have not been device tested.

# Requirements
## MVP
- Accept JPEG, PNG and WebP up to a configurable 10 MB limit; validate decoded image and dimensions.
- Accept general images; optimize for a single opaque foreground object. Hidden geometry is inferred, not measured. Reject or explain unsuitable images gracefully.
- Upload or capture a photo on mobile; preview and replace it.
- Generate a genuine textured 3D mesh via a verified hosted provider; return GLB.
- Orbit through 360°, zoom, pan, reset, auto-rotate and fullscreen.
- Download GLB and open a shareable mobile AR page via QR code.
- Support iOS Quick Look and Android Scene Viewer/WebXR on compatible devices; offer 3D fallback.
- Recent models, retry, clear errors and delete assets.
## Optional after MVP
Wireframe, USDZ download, OBJ/STL conversion, custom lighting, multiple images. Only expose working features. No claim of exact reconstruction or real-world dimensions from a single image.
## Acceptance
A real uploaded photo produces a downloadable valid GLB, rotates freely, and opens in AR on a supported phone. Failures never masquerade as success.

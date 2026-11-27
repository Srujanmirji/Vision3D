# Vision3D physical-device checklist

Run against a public HTTPS deployment or tunnel pointing to Next.js, with the same external origin configured in FastAPI as `PUBLIC_APP_URL`. The Next.js `/api/*` rewrite must reach FastAPI. Keep the frontend API base at `/api`. Use a recognizable generated model with a baked base-color texture. Avoid real personal photos in the test.

Record the phone model, OS version, browser version, runtime used, external URL hostname, job/model ID, outcome, and any observed limitations. Do not publish live share tokens in the report. Record each step as Pass, Fail, Not supported, or Not run.

## Both phones

- [ ] Open the HTTPS workspace on the phone, using cellular data as a second network where practical. Check that the upload page and health endpoint are reachable.
- [ ] Tap Take Photo, grant camera access, and confirm a rear camera is preferred when available. Capture a photo, confirm the JPEG preview, and retake it. Confirm the camera indicator turns off after capture and after closing the dialog.
- [ ] Reset site camera permission and deny access. Confirm denial messaging, gallery recovery, and that selecting a supported JPEG, PNG, or WebP shows a preview. Test leaving the page while the camera is open.
- [ ] Confirm no upload occurs until inference consent is checked and Generate is tapped. Submit a captured image and wait for a genuine job result. Record any provider failure as a failure of that run.
- [ ] From desktop, open View in AR for that generated model. Scan the QR with the phone's built-in camera. Open it in a fresh browser session without logging into the desktop's session, and confirm the model matches.
- [ ] On the guest phone, orbit the model a full turn, zoom, and download its GLB. Confirm the asset opens independently and that the anonymous visitor cannot use the private library or delete the model.
- [ ] Confirm the link expires and that reload after expiry shows the expired state. For a faster test, configure a short `SHARE_TTL_SECONDS` on a disposable backend. Generate a new QR and confirm it works. Delete the model on desktop and check that its active share stops serving the asset.
- [ ] Open the shared URL on a device/browser without AR support and confirm the 360° viewer and download still work. An unsupported runtime is distinct from a missing GLB.

## iPhone and Safari

- [ ] Tap View in Your Space and confirm Apple Quick Look opens. Vision3D currently uses an on-device USDZ generated from the shared textured GLB.
- [ ] Confirm Quick Look displays the correct orientation and retains the expected texture/colors.
- [ ] Scan a well-lit horizontal surface, place the model, move around it, rotate it, and pinch to resize. Record whether placement and tracking remain stable. Generated model dimensions are estimates.
- [ ] Exit Quick Look and confirm Safari returns to the same interactive 3D page. Try denying camera permission or launching in an unsupported in-app browser, then open Safari and retry.

## ARCore-capable Android and Chrome

- [ ] With Google Play Services for AR and Chrome available, tap View in Your Space. Record whether Chrome enters WebXR or opens Scene Viewer.
- [ ] In WebXR, confirm horizontal hit testing, placement, tracking feedback, rotation, and scaling. Exit and verify 3D fallback still works.
- [ ] Test Scene Viewer separately against the same share URL on an ARCore phone where WebXR is unavailable or disabled. Confirm Scene Viewer can fetch the GLB without browser cookies, place it, rotate it, and pinch to scale. Record if your device/browser cannot expose this route.
- [ ] Deny camera access or test a device without a compatible runtime. Confirm a usable 3D view and download remain available.

No physical-device checks were run during implementation. Browser emulation and USDZ package validation do not establish native device acceptance.

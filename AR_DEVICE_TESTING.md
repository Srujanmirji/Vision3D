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

## Active release rehearsal — 28 November 2026

Use the [public creation page](https://vision3d-sigma.vercel.app/create). Generate from a non-personal photo with a simple solid object, such as a sneaker. Record the model ID from the desktop model details URL. Keep its AR share dialog open for both phones. Scan it rather than typing the address. Record outcomes before revoking the link or deleting the model.

1. On the iPhone 14 Pro Max, turn off Wi-Fi, scan the desktop QR with Camera, and open it in Safari. Confirm the guest model matches and orbit it in 3D. Tap **View in Your Space**. In Quick Look choose AR, scan a well-lit floor, place the model, walk around it, rotate it and pinch to scale. Check texture and orientation as well as stable anchoring. Exit Quick Look and confirm the same Safari page. Repeat on Wi-Fi if practical.
2. On Android, open the same QR with Chrome on a second network. Verify the Google app and Google Play Services for AR are available. Record which AR runtime opens and test the same placement and gestures. To cover the other Android path separately, use a compatible phone/browser where that path is selected. Report any path that cannot be selected as not run.
3. On each phone, open `/create`, tap **Take Photo**, allow access, check rear camera, capture, retake and submit a non-personal photo. Reset permissions and deny access to test the gallery fallback. Record camera and AR permission behavior separately.
4. Check the same link in a fresh guest browsing session with no desktop cookie. Test an expired disposable share and a revoked share as separate cases. After deleting a disposable model, reload its link and confirm the GLB no longer opens. Keep tokens private.

| Device | OS / browser | Network | Model ID | Expected result | Observed result | Status |
|---|---|---|---|---|---|---|
| iPhone 14 Pro Max | iOS 27.2.1 reported by device discovery, Safari version to record | Cellular, then optional Wi-Fi | Pending | Camera scan, guest viewer, Quick Look and return | Awaiting hands-on results | Not run by verifier |
| Android ARCore device | Model, OS, Chrome and AR runtime to record | Separate Wi-Fi or cellular | Pending | Camera scan, guest viewer, WebXR or Scene Viewer and return | Awaiting hands-on results | Not run by verifier |

For each result send the device model, OS version, browser version, network type, runtime, model ID, first failed step or confirmation of the individual steps, and screenshots or logs if available. Redact the share token and avoid capturing personal surroundings.

# Vision3D AR compatibility

28 November 2026, IST. The public rehearsal used the [Vercel demo](https://vision3d-sigma.vercel.app) and its Mac backend. Native runtime results are recorded in [AR_DEVICE_TESTING.md](AR_DEVICE_TESTING.md).

| Path | Evidence | Verification |
|---|---|---|
| iPhone Safari, Apple Quick Look | Exported the actual SDK's `prepareUSDZ()` from the generated sneaker's public viewer. Independently validated the package with `usdchecker --arkit --strict`, inspected Y-up and `metersPerUnit = 1`, and confirmed an embedded image connected to the base color of a USD Preview Surface. | Package passes. Native texture appearance, orientation, floor tracking, rotation, scale and return remain physical-device checks. |
| Android Chrome, WebXR | The app asks Model Viewer for immersive AR over HTTPS, requests floor placement and allows scale gestures. | Runtime configuration checked. Surface hit testing, textures, tracking and gestures require an ARCore device. |
| Android Chrome, Scene Viewer | Model Viewer supplies the public cookie-free HTTPS GLB to the Android intent. The app supports an interactive fallback when native activation is unavailable. | The asset route is exercised independently. Google app launch, placement and return require a physical device. |
| Unsupported runtime | Chromium opened a generated public share in a fresh mobile-sized context, loaded the GLB and showed the fallback 360° viewer. | Browser fallback verified. Chromium mobile emulation does not establish Safari, Chrome Android or native AR results. |

The USDZ viewer declares a metre-based coordinate system, but the source model has no real-world calibration. Treat initial placement size as an estimate and adjust it with the device gestures. Structural validation confirms files and bindings. Visual fidelity, orientation on a real floor, permissions and runtime return depend on device testing. [Apple AR Quick Look](https://developer.apple.com/quick-look-gallery/) · [Google Scene Viewer requirements](https://developers.google.com/ar/develop/scene-viewer) · [Model Viewer AR examples](https://modelviewer.dev/examples/augmentedreality/)

## Server-side USDZ decision

The two browser-generated packages serve separate purposes. `quick-look-sdk.usdz` comes directly from Model Viewer, the path used when Quick Look has no `ios-src`. `sneaker.usdz` comes from the explicit Download USDZ action. Both passed strict ARKit package validation and carry an embedded diffuse texture. The SDK conversion took 4.00 s in the desktop Chromium guest. This cannot establish phone conversion time, mobile memory pressure or whether serving a second asset would reduce native launch failures. Server conversion would require an additional generation and storage step, an expiring HTTPS delivery endpoint and a comparable device test. The on-demand SDK path remains in place pending that evidence. [USDZ package inspection](verification/release-demo/usd-validation.json)

```sh
usdchecker --arkit --strict verification/release-demo/quick-look-sdk.usdz
usdchecker --arkit --strict verification/release-demo/sneaker.usdz
usdcat verification/release-demo/quick-look-sdk.usdz
```

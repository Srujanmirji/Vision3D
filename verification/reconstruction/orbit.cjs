const { chromium } = require("playwright-core");
const fs = require("node:fs");
const http = require("node:http");
const crypto = require("node:crypto");
const path = require("node:path");
const [mesh, bundle] = process.argv.slice(2);
if (!mesh || !bundle || !fs.existsSync(mesh) || !fs.existsSync(bundle)) {
  console.error("Usage: node orbit.cjs <mesh.glb> <model-viewer bundle>");
  process.exit(2);
}
const html =
  '<!doctype html><meta charset="utf-8"><script type="module" src="/viewer.js"></script><model-viewer style="display:block;width:480px;height:400px;background:#eee" src="/mesh.glb" camera-controls interaction-prompt="none" camera-orbit="0deg 75deg 105%" interpolation-decay="0"></model-viewer>';
const server = http.createServer((req, res) => {
  if (req.url === "/viewer.js" || req.url === "/mesh.glb") {
    const isMesh = req.url === "/mesh.glb";
    res.setHeader(
      "Content-Type",
      isMesh ? "model/gltf-binary" : "text/javascript",
    );
    fs.createReadStream(isMesh ? mesh : bundle).pipe(res);
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end(html);
  }
});
(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({
      executablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
    const page = await browser.newPage({
      viewport: { width: 500, height: 420 },
    });
    await page.goto("http://127.0.0.1:" + server.address().port);
    const viewer = page.locator("model-viewer");
    await page.waitForFunction(
      () => document.querySelector("model-viewer").loaded,
      undefined,
      { timeout: 20000 },
    );
    const shots = [];
    for (const angle of [0, 45, 90, 135, 180, 225, 270, 315, 360]) {
      const readback = await viewer.evaluate(async (el, value) => {
        el.cameraOrbit = value + "deg 75deg 105%";
        el.jumpCameraToGoal();
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        return (el.getCameraOrbit().theta * 180) / Math.PI;
      }, angle);
      const filename = "orbit-" + angle + ".png";
      const data = await viewer.screenshot({
        path: path.join(path.dirname(mesh), filename),
      });
      shots.push({
        angle,
        readback,
        filename,
        sha256: crypto.createHash("sha256").update(data).digest("hex"),
      });
    }
    function angularDistance(a, b) {
      return Math.abs(((a - b + 540) % 360) - 180);
    }
    if (
      shots.some((x) => angularDistance(x.readback, x.angle) > 1) ||
      new Set(shots.slice(0, 8).map((x) => x.sha256)).size < 2
    )
      throw new Error("Orbit did not render changing views");
    fs.writeFileSync(
      path.join(path.dirname(mesh), "orbit.json"),
      JSON.stringify({ browser: browser.version(), shots }, null, 2) + "\n",
    );
    console.log(
      "360-degree orbit rendered",
      shots.map((x) => x.readback),
    );
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

/* Build with the environment documented in AUDIT_RESOLUTION.md. */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import axe from "axe-core";
import { chromium } from "playwright-core";

const frontend = fileURLToPath(new URL("../", import.meta.url));
const root = path.resolve(frontend, "..");
const origin = "https://vision3d.test:3446";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "vision3d-browser-"));
const target = process.env.VISION3D_BROWSER_EVIDENCE;
const children = [];
const logs = [];

function start(command, args, cwd, extraEnv = {}) {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...extraEnv } });
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
  children.push(child);
}
const hash = (data) => createHash("sha256").update(data).digest("hex");

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch("http://127.0.0.1:3316/api/health")).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("The production frontend could not reach the fixture backend");
}

async function run() {
  const key = path.join(temp, "key.pem");
  const cert = path.join(temp, "cert.pem");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", key, "-out", cert,
    "-subj", "/CN=vision3d.test", "-addext", "subjectAltName=DNS:vision3d.test",
  ], { stdio: "ignore" });

  start(process.env.VISION3D_PYTHON || path.join(root, ".venv", "bin", "python"),
    ["tests/browser_fixture.py"], path.join(root, "backend"),
    { PYTHONPATH: path.join(root, "backend"), VISION3D_BROWSER_STORE: path.join(temp, "data") });
  start(process.execPath, [path.join(frontend, "node_modules/next/dist/bin/next"), "start", "--port", "3316"], frontend);
  await waitForServer();

  const proxy = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
    const upstream = http.request({
      host: "127.0.0.1", port: 3316, method: req.method, path: req.url,
      headers: { ...req.headers, "x-forwarded-proto": "https" },
    }, (reply) => {
      res.writeHead(reply.statusCode, reply.headers);
      reply.pipe(res);
    });
    upstream.on("error", () => res.writeHead(502).end());
    req.pipe(upstream);
  });
  await new Promise((resolve) => proxy.listen(3446, "127.0.0.1", resolve));

  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      args: ["--no-proxy-server", "--host-resolver-rules=MAP vision3d.test 127.0.0.1",
        "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
    const context = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true });
    await context.addInitScript({ content: axe.source });
    function recordPolicyViolations() {
      window.visionCsp = [];
      document.addEventListener("securitypolicyviolation", (event) => {
        window.visionCsp.push(event.violatedDirective);
      });
    }
    await context.addInitScript(recordPolicyViolations);
    const page = await context.newPage();
    const mainResponse = await page.goto(origin + "/create");
    assert.equal(mainResponse.headers()["x-frame-options"], "DENY");
    assert.equal(mainResponse.headers()["strict-transport-security"], "max-age=31536000");
    assert.equal(mainResponse.headers()["x-content-type-options"], "nosniff");
    assert.match(mainResponse.headers()["content-security-policy"], /frame-ancestors 'none'/);
    await page.locator('input[type="file"]').first().setInputFiles(
      path.join(root, "verification/reconstruction/inputs/shoes.jpg"));
    await page.getByRole("checkbox", { name: /Allow server-side upload/ }).check();
    const accepted = page.waitForResponse((r) => r.url().endsWith("/v1/jobs") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Generate 3D", exact: true }).click();
    assert.equal((await accepted).status(), 202);
    await page.getByText("3D model generated and validated.", { exact: true }).waitFor();
    const statusBox = await page.getByRole("status").first().boundingBox();
    assert.ok(statusBox && statusBox.height <= 56, "Success status should be compact");

    // Quality controls remain hidden when not advertised by backend /health
    assert.equal(await page.getByLabel("Quality").count(), 0);

    const pendingRequests = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.match(/\/api\/v1\/models\/[^/]+\/glb$/)) {
        pendingRequests.push(request.url());
      }
    });
    await page.waitForFunction(() => document.querySelector("model-viewer")?.loaded);
    const source = await page.locator("model-viewer").evaluate((element) => element.src);
    assert.match(source, /^blob:/);

    // Before & After 2D/3D comparison without re-fetching GLB
    await page.getByRole("button", { name: "Compare", exact: true }).click();
    await page.getByText("Before · Source 2D", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Align 3D Front", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Front", exact: true }).getAttribute("aria-pressed"), "true");
    if (target) await page.screenshot({ path: path.join(target, "compare.png") });
    await page.getByRole("button", { name: "Compare", exact: true }).click();
    assert.equal(pendingRequests.length, 0);

    // Top & Bottom camera presets
    await page.getByRole("button", { name: "Top", exact: true }).click();
    assert.equal(await page.locator("model-viewer").evaluate((el) => el.cameraOrbit), "0deg 2deg 98%");
    await page.getByRole("button", { name: "Bottom", exact: true }).click();
    assert.equal(await page.locator("model-viewer").evaluate((el) => el.cameraOrbit), "0deg 178deg 98%");
    await page.getByRole("button", { name: "Perspective", exact: true }).click();

    // Ground grid & Lighting controls
    await page.getByRole("button", { name: "Ground grid" }).click();
    await page.getByTestId("textured-ground-grid").waitFor();
    await page.getByRole("button", { name: "Lighting controls" }).click();
    await page.getByRole("region", { name: "Viewer lighting settings" }).waitFor();
    await page.getByRole("button", { name: "Soft", exact: true }).click();
    await page.getByLabel("Exposure").fill("1.2");
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await page.getByRole("button", { name: "Lighting controls" }).click();
    await page.getByRole("button", { name: "Ground grid" }).click();

    // Geometry-only inspection mode & Wireframe mode reusing shared blob URL
    await page.getByRole("button", { name: "Geometry", exact: true }).click();
    await page.locator('[data-testid="three-wireframe-canvas"][data-mode="geometry"] canvas').waitFor();
    await page.getByText("Preparing geometry view…").waitFor({ state: "hidden" });
    assert.equal(pendingRequests.length, 0);
    if (target) await page.screenshot({ path: path.join(target, "geometry.png") });

    await page.getByRole("button", { name: "Wireframe", exact: true }).click();
    await page.locator('[data-testid="three-wireframe-canvas"][data-mode="wireframe"] canvas').waitFor();
    await page.getByText("Building wireframe mesh…").waitFor({ state: "hidden" });
    assert.equal(pendingRequests.length, 0);
    if (target) await page.screenshot({ path: path.join(target, "wireframe.png") });
    await page.getByRole("button", { name: "Textured", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("model-viewer")?.loaded);
    assert.equal(await page.locator("model-viewer").evaluate((element) => element.src), source);

    await page.getByRole("button", { name: "Download", exact: true }).click();
    const downloading = page.waitForEvent("download");
    await page.getByRole("dialog").getByRole("button", { name: "Download GLB", exact: true }).click();
    const file = await (await downloading).path();
    assert.equal(hash(fs.readFileSync(file)),
      hash(fs.readFileSync(path.join(root, "verification/frontend-live/generated.glb"))));
    await page.keyboard.press("Escape");
    const sharing = page.waitForResponse((r) => r.url().endsWith("/share") && r.request().method() === "POST");
    await page.getByRole("button", { name: "View in AR", exact: true }).click();
    const share = await (await sharing).json();
    await page.getByRole("img", { name: "QR code for mobile AR page" }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.visionCsp), []);

    const guest = await browser.newContext({ ignoreHTTPSErrors: true });
    await guest.addInitScript(recordPolicyViolations);
    const mobile = await guest.newPage();
    await mobile.setViewportSize({ width: 375, height: 812 });
    await mobile.goto(share.mobile_url);
    await mobile.waitForFunction(() => document.querySelector("model-viewer")?.loaded);
    assert.equal((await guest.cookies()).length, 0);
    assert.deepEqual(await mobile.evaluate(() => window.visionCsp), []);
    await mobile.getByText(/Native AR unavailable here/).waitFor();
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), 375);
    const arControls = mobile.getByRole("group", { name: "Camera angle presets" }).getByRole("button");
    const heights = await arControls.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
    assert.ok(heights.length > 0 && heights.every((height) => height >= 44));
    await mobile.goto(origin + "/ar/sample");
    await mobile.waitForFunction(() => document.querySelector("model-viewer")?.loaded);

    const viewports = [];
    const accessibility = [];
    for (const [width, height] of [[1440, 900], [834, 1194], [390, 844], [375, 812]]) {
      await page.setViewportSize({ width, height });
      await page.goto(origin + "/create?sample=1");
      await page.waitForFunction(() => document.querySelector("model-viewer")?.loaded);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      const button = await page.getByRole("button", { name: "Enter fullscreen" }).boundingBox();
      assert.ok(button.width >= 44 && button.height >= 44, "The fullscreen control is undersized");
      assert.deepEqual(await page.evaluate(() => window.visionCsp), []);
      viewports.push({ width, height });
      if (width === 375) {
        const report = await page.evaluate(() => window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        }));
        accessibility.push(...report.violations.map((item) => ({
          id: item.id, impact: item.impact, targets: item.nodes.map((node) => node.target),
        })));
      }
      if (target) await page.screenshot({ path: path.join(target, `workspace-${width}.png`) });
    }
    assert.deepEqual(await mobile.evaluate(() => window.visionCsp), []);
    assert.deepEqual(accessibility, []);
    const result = { fixtureOnly: true, uploaded: true, downloadedMatchingGlb: true,
      successfulShareWithoutOwnerCookie: true, sampleLoaded: true, wireframeReusedBlob: true,
      noPolicyViolations: true, viewports, accessibility, physicalDevice: false };
    if (target) fs.writeFileSync(path.join(target, "result.json"), JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => proxy.close(resolve));
  }
}

if (target) fs.mkdirSync(target, { recursive: true });
run().catch((error) => {
  console.error(error);
  console.error(logs.slice(-12).join(""));
  process.exitCode = 1;
}).finally(() => {
  for (const child of children) child.kill("SIGTERM");
  fs.rmSync(temp, { recursive: true, force: true });
});

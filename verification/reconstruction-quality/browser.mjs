import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../../frontend/node_modules/playwright-core/index.mjs";

const origin = process.env.VISION3D_BROWSER_ORIGIN || "http://127.0.0.1:3391";
const here = fileURLToPath(new URL(".", import.meta.url));
const photo = path.resolve(here, "../reconstruction/inputs/shoes.jpg");
const evidence = path.join(here, "browser");
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const prepare = async () => {
    await page.goto(`${origin}/create`);
    await page.locator('input[type="file"]').first().setInputFiles(photo);
    const button = page.getByRole("button", { name: "Preview foreground" });
    await button.focus();
    await page.keyboard.press("Enter");
    await page.locator("dialog[open] canvas").waitFor({ timeout: 35000 });
    return page.getByRole("dialog", { name: "Preview background removal" });
  };
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    const dialog = await prepare();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    const controls = await dialog.locator("button:visible, input:visible").evaluateAll((items) =>
      items.map((item) => [item.textContent || item.getAttribute("aria-label"), item.getBoundingClientRect().height]));
    controls.forEach(([name, height]) => assert.ok(height >= 44, `${name} hit area is ${height}px`));
    await page.screenshot({ path: path.join(evidence, `preview-${width}.jpg`) });
    if (width === 1280) {
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
    }
  }
  const dialog = page.getByRole("dialog", { name: "Preview background removal" });
  const editor = page.getByLabel("Foreground mask editor");
  const slider = page.getByRole("slider", { name: "Minimum opacity" });
  const before = await editor.evaluate((canvas) => canvas.toDataURL());
  await dialog.getByRole("button", { name: "Reset mask" }).focus();
  await page.keyboard.press("Tab");
  assert.equal(await editor.evaluate((canvas) => document.activeElement === canvas), true);
  const focus = await editor.evaluate((canvas) => getComputedStyle(canvas).outlineWidth);
  assert.ok(Number.parseFloat(focus) >= 2);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await page.keyboard.press("Tab");
  assert.equal(await slider.evaluate((input) => document.activeElement === input), true);
  await page.keyboard.press("ArrowRight");
  assert.equal(await slider.inputValue(), "1");
  const after = await editor.evaluate((canvas) => canvas.toDataURL());
  assert.notEqual(before, after);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Clear reviewed mask" }).waitFor();

  const accepting = page.waitForResponse((reply) =>
    reply.url().endsWith("/api/v1/jobs") && reply.request().method() === "POST");
  const started = performance.now();
  await page.getByRole("button", { name: "Generate 3D", exact: true }).click();
  const job = await accepting;
  assert.equal(job.status(), 202);
  const { job_id: jobId } = await job.json();
  await page.getByText("3D model generated and validated.", { exact: true }).waitFor({ timeout: 310000 });
  const seconds = (performance.now() - started) / 1000;
  const terminal = await (await page.request.get(`${origin}/api/v1/jobs/${jobId}`)).json();
  assert.equal(terminal.provider, "sf3d-local");
  assert.equal(terminal.progress, null);
  const model = await (await page.request.get(`${origin}/api/v1/models/${terminal.model_id}`)).json();
  await page.waitForFunction(() => document.querySelector("model-viewer")?.loaded);
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button", { name: "Download GLB", exact: true }).click();
  await (await download).saveAs(path.join(evidence, "shoe.glb"));
  const glb = await readFile(path.join(evidence, "shoe.glb"));
  assert.equal(glb.toString("ascii", 0, 4), "glTF");
  assert.equal(glb.length, model.byte_size);
  const results = {
    viewports: [1280, 375], keyboardBrushAndSlider: true, generatedSeconds: +seconds.toFixed(2),
    model: { bytes: glb.length, provider: model.provider, vertices: model.vertices, triangles: model.triangles },
  };
  await writeFile(path.join(evidence, "results.json"), JSON.stringify(results, null, 2) + "\n");
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}

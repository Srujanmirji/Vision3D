// Live-site browser audit. Usage: node browser_audit.mjs OUT_DIR PHOTO
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "/Users/srujanmirji/Downloads/Vision3D/.claude/worktrees/client-mac-autorun-f89c07/frontend/node_modules/playwright-core/index.mjs";

const { firefox, webkit } = await import("/Users/srujanmirji/port1/node_modules/playwright-core/index.mjs");
const SITE = "https://vision3d-sigma.vercel.app";
const [out, photo] = process.argv.slice(2);
const results = [];
const record = (test, pass, detail) => {
  const row = { test, result: pass === null ? "BLOCKED" : pass ? "PASS" : "FAIL", detail: String(detail).slice(0, 300) };
  results.push(row);
  console.log(JSON.stringify(row));
};
const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`) });

async function smoke(name, type, options = {}) {
  let browser;
  try {
    browser = await type.launch(options);
  } catch (error) {
    record(`${name}: launch`, null, error.message);
    return;
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
    page.on("response", (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`));
    for (const route of ["/", "/create", "/models", "/settings", "/ar/sample"]) {
      errors.length = 0;
      const response = await page.goto(SITE + route, { waitUntil: "load", timeout: 60000 });
      await page.waitForTimeout(1500);
      record(`${name}: ${route} loads without errors`, response.ok() && errors.length === 0,
        `HTTP ${response.status()} ${errors.join(" | ") || "no errors"}`);
    }
    await page.goto(SITE + "/ar/sample", { waitUntil: "load" });
    const viewer = await page.locator("model-viewer").count();
    await page.waitForTimeout(4000);
    const loaded = await page.evaluate(() => Boolean(document.querySelector("model-viewer")?.loaded));
    record(`${name}: sample model renders in model-viewer`, viewer > 0 && loaded, `elements=${viewer} loaded=${loaded}`);
    await shot(page, `${name}-ar-sample-1280`);
  } finally {
    await browser.close();
  }
}

async function fullFlow() {
  const browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(SITE + "/create", { waitUntil: "load" });
    const generate = page.getByRole("button", { name: /Generate 3D/ });
    record("Generate disabled before an image is chosen", await generate.isDisabled(), "");
    await page.locator('input[aria-label="Choose image file"]').setInputFiles(photo);
    await page.waitForTimeout(1000);
    const consent = page.locator("#external-processing-consent");
    const needsConsent = (await consent.count()) > 0;
    record("Generate disabled until consent is ticked (hosted fallback configured)",
      needsConsent ? await generate.isDisabled() : null, needsConsent ? "" : "no consent box");
    if (needsConsent) await consent.click();
    await shot(page, "create-ready-1280");
    const started = Date.now();
    await generate.click();
    await page.getByText("Generated GLB").first().waitFor({ timeout: 240000 });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    record("live upload -> generation -> model shown", true, `${seconds}s in browser`);
    await page.waitForTimeout(3000);
    await shot(page, "result-textured-1280");

    const presets = page.locator('[aria-label="Camera angle presets"] button');
    const presetNames = await presets.allInnerTexts();
    for (let i = 0; i < (await presets.count()); i++) {
      await presets.nth(i).click();
      await page.waitForTimeout(700);
      await shot(page, `preset-${presetNames[i].toLowerCase()}`);
    }
    record("camera presets switch and report aria-pressed",
      (await presets.last().getAttribute("aria-pressed")) === "true", presetNames.join(", "));
    for (const label of ["Zoom in", "Zoom out", "Pan camera mode", "Orbit camera mode", "Reset camera view"]) {
      const control = page.getByRole("button", { name: label });
      const ok = (await control.count()) > 0 && (await control.first().isEnabled());
      if (ok) await control.first().click();
      record(`viewer control "${label}" is clickable`, ok, "");
    }
    await page.getByRole("button", { name: /Wireframe/ }).click();
    await page.waitForTimeout(3000);
    const canvas = await page.locator("canvas").count();
    record("wireframe mode renders a canvas", canvas > 0, `canvases=${canvas}`);
    await shot(page, "result-wireframe-1280");
    await page.getByRole("button", { name: /Textured/ }).click();
    await page.waitForTimeout(1500);

    const fullscreen = page.getByRole("button", { name: "Enter fullscreen" });
    if (await fullscreen.count()) {
      await fullscreen.click();
      await page.waitForTimeout(800);
      const inFullscreen = await page.evaluate(() => Boolean(document.fullscreenElement));
      record("fullscreen toggles", inFullscreen, "");
      if (inFullscreen) await page.getByRole("button", { name: "Exit fullscreen" }).click();
    } else record("fullscreen toggles", false, "no Enter fullscreen button");

    const download = page.waitForEvent("download", { timeout: 30000 });
    await page.getByRole("button", { name: /Download/ }).first().click();
    const dialogDownload = page.getByRole("dialog").getByRole("button", { name: /Download/ });
    if (await dialogDownload.count()) await dialogDownload.first().click();
    const file = await download;
    const saved = path.join(out, "downloaded.glb");
    await file.saveAs(saved);
    const { readFile } = await import("node:fs/promises");
    const head = (await readFile(saved)).subarray(0, 4).toString();
    record("download saves a GLB", head === "glTF", file.suggestedFilename());

    // Cancel: start a second job, cancel it.
    await page.goto(SITE + "/create", { waitUntil: "load" });
    await page.locator('input[aria-label="Choose image file"]').setInputFiles(photo);
    if (await page.locator("#external-processing-consent").count()) await page.locator("#external-processing-consent").click();
    await page.getByRole("button", { name: /Generate 3D/ }).click();
    const cancel = page.getByRole("button", { name: /Cancel Job/ });
    await cancel.waitFor({ timeout: 30000 });
    await cancel.click();
    await page.waitForTimeout(3000);
    const body = await page.locator("body").innerText();
    record("cancel stops the job and offers retry", /cancel/i.test(body) && /Retry|Check Job/i.test(body),
      body.match(/[^\n]*cancel[^\n]*/i)?.[0] ?? "");
    await shot(page, "after-cancel-1280");

    // Keyboard: tab through /create with an image chosen.
    await page.goto(SITE + "/create", { waitUntil: "load" });
    const stops = [];
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      stops.push(await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const visible = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0 || style.boxShadow !== "none";
        return { name: el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 30) || el.tagName,
          tag: el.tagName, visible, w: Math.round(rect.width), h: Math.round(rect.height) };
      }));
    }
    const real = stops.filter(Boolean);
    const invisible = real.filter((s) => !s.visible);
    record("every keyboard stop on /create shows a focus indicator", invisible.length === 0,
      invisible.length ? invisible.map((s) => s.name).join(", ") : `${real.length} stops`);
    const small = real.filter((s) => s.tag !== "A" && (s.w < 44 || s.h < 44));
    record("tab stops are at least 44x44 px at 1280", small.length === 0,
      small.map((s) => `${s.name} ${s.w}x${s.h}`).join("; "));
    await writeFile(path.join(out, "tab-stops.json"), JSON.stringify(real, null, 1));

    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 860 });
      for (const route of ["/", "/create", "/models"]) {
        await page.goto(SITE + route, { waitUntil: "load" });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        record(`${route} at ${width}px has no horizontal overflow`, overflow <= 0, `overflow=${overflow}px`);
        await shot(page, `layout${route.replace(/\//g, "_") || "_home"}-${width}`);
      }
    }
    record("no page errors during the Chrome flow", errors.length === 0, errors.join(" | ") || "none");
  } catch (error) {
    record("Chrome full flow", false, error.message);
    await shot(page, "flow-error");
  } finally {
    await browser.close();
  }
}

await smoke("chrome", chromium, {
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
await smoke("firefox", firefox);
await smoke("webkit", webkit);
await fullFlow();
await writeFile(path.join(out, "browser-results.json"), JSON.stringify(results, null, 1));

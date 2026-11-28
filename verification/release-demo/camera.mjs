import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "../../frontend/node_modules/playwright-core/index.mjs";

const app = process.env.VISION3D_TEST_ORIGIN || "https://vision3d-sigma.vercel.app";
const evidence = fileURLToPath(new URL(".", import.meta.url));
const photo = fileURLToPath(new URL("../reconstruction/inputs/shoes.jpg", import.meta.url));
const temp = await mkdtemp(path.join(os.tmpdir(), "vision3d-camera-rehearsal-"));
let browser;
try {
  const video = path.join(temp, "camera.y4m");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-loop", "1", "-i", photo,
    "-vf", "scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2",
    "-t", "1", "-r", "15", "-pix_fmt", "yuv420p", video]);
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: ["--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${video}`],
  });
  const context = await browser.newContext(devices["Pixel 7"]);
  await context.grantPermissions(["camera"], { origin: app });
  const page = await context.newPage();
  let jobPosts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/v1/jobs")) jobPosts += 1;
  });
  await page.goto(`${app}/create`);
  await page.getByRole("button", { name: "Take Photo" }).click();
  const capture = page.getByRole("button", { name: "Capture Photo", exact: true });
  const waitForTrack = () => page.waitForFunction(() =>
    document.querySelector("dialog video")?.srcObject?.getVideoTracks().some((track) => track.readyState === "live"));
  const preview = page.getByRole("img", { name: "Captured object photo preview" });
  await waitForTrack();
  await capture.click();
  await preview.waitFor();
  assert.equal(await page.locator("dialog video").count(), 0);
  await page.getByRole("button", { name: "Retake", exact: true }).click();
  await capture.waitFor();
  await waitForTrack();
  await capture.click();
  await page.getByRole("button", { name: "Use Photo", exact: true }).click();
  await page.getByRole("button", { name: "Retake Photo", exact: true }).waitFor();
  assert.equal(jobPosts, 0);

  const deniedContext = await browser.newContext(devices["Pixel 7"]);
  await deniedContext.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Denied", "NotAllowedError"));
  });
  const denied = await deniedContext.newPage();
  await denied.goto(`${app}/create`);
  await denied.getByRole("button", { name: "Take Photo" }).click();
  await denied.getByText(/camera access was denied/i).waitFor();
  await denied.getByRole("button", { name: "Choose from Gallery" }).waitFor();
  const result = { publicOrigin: app, preview: true, retake: true, noAutomaticUpload: true,
    permissionDenialRecovery: true, physicalDevice: false };
  await writeFile(path.join(evidence, "camera.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(result);
} finally {
  if (browser) await browser.close();
  await rm(temp, { recursive: true, force: true });
}

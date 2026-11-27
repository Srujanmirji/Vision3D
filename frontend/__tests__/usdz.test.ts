// @vitest-environment node
// Node, not jsdom: three.js checks `instanceof ArrayBuffer`, which fails across jsdom's realm.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { glbToUsdz, USDZ_MIME } from "@/lib/usdz";

const sampleGlb = () =>
  new Blob([readFileSync(path.join(__dirname, "../public/samples/sample-chair.glb"))]);

describe("glbToUsdz", () => {
  it("converts the bundled sample GLB into a USDZ zip with a USD stage", async () => {
    const usdz = await glbToUsdz(sampleGlb());
    const bytes = new Uint8Array(await usdz.arrayBuffer());

    expect(usdz.type).toBe(USDZ_MIME);
    expect(new TextDecoder().decode(bytes.subarray(0, 2))).toBe("PK"); // zip container
    expect(new TextDecoder().decode(bytes)).toContain("model.usda");
  });

  it("rejects data that is not a GLB", async () => {
    await expect(glbToUsdz(new Blob(["not a model"]))).rejects.toThrow();
  });
});

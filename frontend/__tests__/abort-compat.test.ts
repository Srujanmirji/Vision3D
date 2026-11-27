import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSharedAsset } from "@/lib/api";

// iOS Safari < 17.4 and Chrome < 116 ship without AbortSignal.any.
describe("API calls without AbortSignal.any", () => {
  const original = AbortSignal.any;
  const timeout = AbortSignal.timeout;

  beforeEach(() => {
    Reflect.deleteProperty(AbortSignal, "any");
    Reflect.deleteProperty(AbortSignal, "timeout");
  });

  afterEach(() => {
    AbortSignal.any = original;
    AbortSignal.timeout = timeout;
    vi.restoreAllMocks();
  });

  it("loads a shared asset when the caller passes a signal", async () => {
    const asset = { model_id: "m1", name: "Model", glb_url: "https://x.example/a.glb" };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(asset), { status: 200 })
    );

    await expect(getSharedAsset("token", new AbortController().signal)).resolves.toEqual(asset);
  });

  it("still aborts the request when the caller aborts", async () => {
    let seen: AbortSignal | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementationOnce((_url, init) => {
      seen = init?.signal ?? undefined;
      // Like real fetch: reject once the signal aborts.
      return new Promise((_resolve, reject) => {
        seen?.addEventListener("abort", () => reject(seen?.reason));
      });
    });
    const caller = new AbortController();

    const pending = getSharedAsset("token", caller.signal);
    caller.abort();

    await expect(pending).rejects.toThrow();
    expect(seen?.aborted).toBe(true);
  });
});

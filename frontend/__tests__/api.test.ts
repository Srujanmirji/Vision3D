import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isHttpsUrl,
  isLocalhostUrl,
  listModels,
  Vision3DApiError,
} from "@/lib/api";

describe("API URL helpers and error handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("identifies localhost and HTTPS URLs accurately for QR safety", () => {
    expect(isLocalhostUrl("http://localhost:3000/ar/sample")).toBe(true);
    expect(isLocalhostUrl("http://127.0.0.1:3000/ar/sample")).toBe(true);
    expect(isLocalhostUrl("https://vision3d.example.com/ar/abc")).toBe(false);

    expect(isHttpsUrl("https://vision3d.example.com/ar/abc")).toBe(true);
    expect(isHttpsUrl("http://vision3d.example.com/ar/abc")).toBe(false);
  });

  it("parses structured backend error codes without exposing stack traces", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: "PROVIDER_UNAVAILABLE",
          message: "Upstream inference endpoint is currently offline.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(listModels()).rejects.toMatchObject({
      name: "Vision3DApiError",
      code: "PROVIDER_UNAVAILABLE",
      message: "Upstream inference endpoint is currently offline.",
      status: 503,
    });
  });

  it("maps network failures to structured NETWORK_ERROR", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));

    try {
      await listModels();
      expect.unreachable("Should have thrown Vision3DApiError");
    } catch (err) {
      expect(err).toBeInstanceOf(Vision3DApiError);
      expect((err as Vision3DApiError).code).toBe("NETWORK_ERROR");
    }
  });
});

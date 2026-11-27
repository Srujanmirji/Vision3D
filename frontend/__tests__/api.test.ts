import { Blob as NodeBlob } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createJob,
  downloadModel,
  getModel,
  isHttpsUrl,
  isLocalhostUrl,
  listJobs,
  listModels,
  pollJobUntilDone,
  Vision3DApiError,
} from "@/lib/api";

describe("API URL helpers and error handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
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
          error: {
            code: "PROVIDER_UNAVAILABLE",
            message: "Upstream inference endpoint is currently offline.",
          },
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

  it("uploads the photo and consent through the same-origin session proxy", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ job_id: "real-job", status: "queued" }, { status: 202 })
    );
    const photo = new File(["photo"], "chair.jpg", { type: "image/jpeg" });
    await expect(createJob(photo, {
      allow_external_processing: true,
      provider: "triposr",
      remove_background: false,
    })).resolves.toEqual({ job_id: "real-job", status: "queued" });
    const [path, init] = fetchSpy.mock.calls[0] ?? [];
    expect(path).toBe("/api/v1/jobs");
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    const form = init?.body as FormData;
    expect(form.get("image")).toEqual(photo);
    expect(form.get("allow_external_processing")).toBe("true");
    expect(form.get("remove_background")).toBe("false");
  });

  it("polls real states, recovers from a network interruption and preserves null progress", async () => {
    vi.useFakeTimers();
    const queued = { job_id: "job", status: "queued", progress: null };
    const complete = { job_id: "job", status: "succeeded", model_id: "model", progress: null };
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(queued))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(Response.json(complete));
    const updates = vi.fn();
    const job = pollJobUntilDone("job", updates);
    await vi.advanceTimersByTimeAsync(4000);
    await expect(job).resolves.toEqual(complete);
    expect(updates.mock.calls).toEqual([[queued], [complete]]);
  });

  it("stops polling when the caller aborts", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ job_id: "job", status: "processing", progress: null })
    );
    const controller = new AbortController();
    const job = pollJobUntilDone("job", () => controller.abort(), controller.signal);
    await expect(job).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("bounds polling and asks the caller to check the existing job again", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ job_id: "job", status: "queued", progress: null })
    );
    await expect(pollJobUntilDone("job", vi.fn(), undefined, 10)).rejects.toMatchObject({
      code: "TIMEOUT",
      message: expect.stringContaining("without re-uploading"),
    });
  });

  it("reads persisted jobs and downloads a private GLB through the proxy", async () => {
    // jsdom's Blob lacks arrayBuffer. Use the browser-compatible Node implementation.
    vi.stubGlobal("Blob", NodeBlob);
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ jobs: [{ job_id: "job" }] }))
      .mockResolvedValueOnce(Response.json({
        id: "model",
        glb_url: "http://localhost:8000/v1/models/model/glb",
      }))
      .mockResolvedValueOnce(new Response("glTF data"))
      .mockResolvedValueOnce(new Response("not a glb"));
    await expect(listJobs(20)).resolves.toEqual([{ job_id: "job" }]);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/api/v1/jobs?limit=20&offset=20");
    const model = await getModel("model");
    expect(model.glb_url).toBe("/api/v1/models/model/glb");
    await expect(downloadModel(model)).resolves.toMatchObject({ size: 9 });
    expect(fetchSpy.mock.calls[2]?.[0]).toBe("/api/v1/models/model/glb?download=true");
    await expect(downloadModel(model)).rejects.toMatchObject({ code: "INVALID_MODEL" });
  });
});

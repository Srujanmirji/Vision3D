import { afterEach, describe, expect, it, vi } from "vitest";
import { shrinkForUpload, UPLOAD_MAX_EDGE } from "@/lib/uploadImage";
import { createJob, Vision3DApiError } from "@/lib/api";

const photo = (bytes: number, type = "image/jpeg") =>
  new File([new Uint8Array(bytes)], "IMG_0001.jpeg", { type });

function stubBrowserImageApis(width: number, height: number, encodedBytes: number) {
  const drawn: number[][] = [];
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width, height, close: vi.fn() })));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: (...args: unknown[]) => drawn.push(args.slice(1) as number[]),
    imageSmoothingQuality: "low",
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (callback, type) {
    callback(new Blob([new Uint8Array(encodedBytes)], { type }));
  });
  return drawn;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("shrinkForUpload", () => {
  it("scales a 12 MP phone photo to the upload size as JPEG", async () => {
    const drawn = stubBrowserImageApis(3024, 4032, 400_000);
    const result = await shrinkForUpload(photo(5_000_000));

    expect(drawn[0]).toEqual([0, 0, 1536, UPLOAD_MAX_EDGE]); // aspect ratio kept, long edge capped
    expect(result.type).toBe("image/jpeg");
    expect(result.size).toBe(400_000);
    expect(result.name).toBe("IMG_0001.jpg");
  });

  it("keeps small photos untouched", async () => {
    const drawn = stubBrowserImageApis(800, 600, 50_000);
    const original = photo(200_000);
    expect(await shrinkForUpload(original)).toBe(original);
    expect(drawn).toHaveLength(0);
  });

  it("keeps PNG transparency", async () => {
    stubBrowserImageApis(4000, 3000, 900_000);
    const result = await shrinkForUpload(photo(6_000_000, "image/png"));
    expect(result.type).toBe("image/png");
  });

  it("falls back to the original when the browser cannot decode it", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new Error("unsupported"); }));
    const original = photo(5_000_000);
    expect(await shrinkForUpload(original)).toBe(original);
  });
});

describe("upload time limit", () => {
  it("allows uploads longer than normal requests and explains an upload timeout", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })
    );
    let settled: unknown = "pending";
    const pending = createJob(photo(100), { allow_external_processing: true }).catch((err) => {
      settled = err;
    });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).toBe("pending"); // a normal request would have given up at 30 s

    await vi.advanceTimersByTimeAsync(61_000);
    await pending;
    expect(settled).toBeInstanceOf(Vision3DApiError);
    expect((settled as Vision3DApiError).code).toBe("TIMEOUT");
    expect((settled as Vision3DApiError).message).toMatch(/upload took too long/);
  });
});

describe("original photo limit", () => {
  it("accepts phone originals larger than the server limit, because they are shrunk first", async () => {
    const { originalPhotoLimit, ORIGINAL_PHOTO_MAX_BYTES } = await import("@/lib/uploadImage");
    expect(originalPhotoLimit(10_000_000)).toBe(ORIGINAL_PHOTO_MAX_BYTES);
    expect(originalPhotoLimit(50_000_000)).toBe(50_000_000);
  });
});

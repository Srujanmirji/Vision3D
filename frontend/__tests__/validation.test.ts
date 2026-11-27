import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_UPLOAD_BYTES,
  formatBytes,
  validateFileMetadata,
} from "@/lib/validation";

describe("image file metadata validation", () => {
  it("accepts valid JPEG, PNG, and WebP files under the 10 MB limit", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      const file = new File([new Uint8Array(1024)], "object.png", { type });
      expect(validateFileMetadata(file)).toBeNull();
    }
  });

  it("rejects unsupported MIME types", () => {
    const file = new File([new Uint8Array(512)], "doc.pdf", {
      type: "application/pdf",
    });
    const err = validateFileMetadata(file);
    expect(err?.code).toBe("INVALID_TYPE");
  });

  it("rejects empty files", () => {
    const file = new File([], "empty.png", { type: "image/png" });
    const err = validateFileMetadata(file);
    expect(err?.code).toBe("DECODE_FAILED");
  });

  it("rejects files larger than the configured limit", () => {
    const oversized = new File(
      [new Uint8Array(DEFAULT_MAX_UPLOAD_BYTES + 1)],
      "huge.jpg",
      { type: "image/jpeg" }
    );
    const err = validateFileMetadata(oversized);
    expect(err?.code).toBe("FILE_TOO_LARGE");
  });

  it("formats byte sizes cleanly", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10.00 MB");
  });
});

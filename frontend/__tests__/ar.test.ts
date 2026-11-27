import { describe, expect, it } from "vitest";
import { cameraErrorMessage } from "@/components/upload/CameraCaptureDialog";
import { publicArUrl, sharedModelUrl } from "@/lib/ar";

describe("AR share URL policy", () => {
  it.each([
    "http://vision3d.example/ar/token",
    "https://localhost/ar/token",
    "https://studio.local/ar/token",
    "https://192.168.1.10/ar/token",
    "https://[::1]/ar/token",
    "https://name:secret@vision3d.example/ar/token",
  ])("rejects a share URL that cannot be used as a public HTTPS link: %s", (input) => {
    expect(publicArUrl(input)).toBeNull();
  });

  it("requires the correct token, asset type and canonical share origin", () => {
    const origin = "https://vision3d.example";
    const glb = origin + "/api/v1/share/example-token/glb";
    expect(sharedModelUrl(glb, origin, "example-token", "glb")).toBe(glb);
    expect(sharedModelUrl(glb, origin, "wrong-token", "glb")).toBeNull();
    expect(sharedModelUrl(glb, origin, "example-token", "usdz")).toBeNull();
    expect(sharedModelUrl(glb + "?a=b", origin, "example-token", "glb")).toBeNull();
    expect(sharedModelUrl(glb, "https://other.example", "example-token", "glb")).toBeNull();
  });
});

describe("Camera permissions", () => {
  it("explains access denial and keeps gallery selection available", () => {
    expect(cameraErrorMessage(new DOMException("Denied", "NotAllowedError"))).toMatch(/denied.*gallery/);
  });

  it("distinguishes an unusable camera from permission denial", () => {
    expect(cameraErrorMessage(new DOMException("In use", "NotReadableError"))).toMatch(/other apps/);
    expect(cameraErrorMessage(new DOMException("Missing", "NotFoundError"))).toMatch(/No usable camera/);
  });
});

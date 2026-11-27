import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CameraCaptureDialog } from "@/components/upload/CameraCaptureDialog";
import { QrArDialog } from "@/components/ar-dialog/QrArDialog";
import { SAMPLE_MODEL } from "@/lib/sample";

describe("Mobile Camera, QR, and AR UX components", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (
      this: HTMLDialogElement
    ) {
      this.setAttribute("open", "");
    });
    HTMLDialogElement.prototype.close = vi.fn(function (
      this: HTMLDialogElement
    ) {
      this.removeAttribute("open");
    });
  });

  it("shows permission recovery guidance when camera access is denied", async () => {
    Object.defineProperty(window, "isSecureContext", {
      value: true,
      configurable: true,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi
          .fn()
          .mockRejectedValue(new DOMException("Permission denied", "NotAllowedError")),
      },
      configurable: true,
    });

    render(
      <CameraCaptureDialog
        onClose={vi.fn()}
        onCapture={vi.fn()}
        onGallery={vi.fn()}
        onNativeCamera={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/How to re-enable camera access/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Choose from Gallery/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Use Device Camera/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
  });

  it("renders Desktop QR dialog with honest native AR guidance and localhost guard", async () => {
    render(
      <QrArDialog open={true} onClose={vi.fn()} model={SAMPLE_MODEL} />
    );

    await waitFor(() => {
      expect(
        screen.getByText(/HTTPS public URL required for phone QR scanning/i)
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(/iPhone \(Safari Quick Look\) & Android/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open Mobile AR Page/i })
    ).toHaveAttribute("href", "/ar/sample");
  });
});

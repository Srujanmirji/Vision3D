import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Vision3DApiError } from "@/lib/api";

const api = vi.hoisted(() => ({
  createCapture: vi.fn(),
  getCaptureJob: vi.fn(),
  getCaptureInfo: vi.fn(),
  sendCapture: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  ...api,
}));

// jsdom cannot decode images, so stand in for the browser's decode step.
vi.mock("@/lib/validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/validation")>()),
  validateImageFile: vi.fn(async (file: File) => ({
    ok: true,
    data: { file, previewUrl: "blob:photo", width: 640, height: 480, sizeBytes: file.size, mimeType: file.type, warning: null },
  })),
}));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
  Object.assign(URL, { revokeObjectURL: vi.fn() });
});

afterEach(() => {
  vi.useRealTimers();
  Object.values(api).forEach((fn) => fn.mockReset());
});

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

describe("PhoneCaptureDialog (desktop)", () => {
  it("shows a QR for the public capture link and hands over the job when the phone sends", async () => {
    const { PhoneCaptureDialog } = await import("@/components/upload/PhoneCaptureDialog");
    api.createCapture.mockResolvedValue({
      token: "tok123", capture_url: "https://vision3d.example.com/capture/tok123", expires_at: inMinutes(10),
    });
    api.getCaptureJob.mockResolvedValueOnce(null).mockResolvedValueOnce("job-42");
    const onJob = vi.fn();

    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<PhoneCaptureDialog open onClose={() => {}} onJob={onJob} />);

    expect(await screen.findByAltText(/QR code that opens the phone camera page/)).toBeInTheDocument();
    expect(screen.getByText(/Waiting for your phone/)).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    await waitFor(() => expect(onJob).toHaveBeenCalledWith("job-42"));
    expect(api.getCaptureJob).toHaveBeenCalledWith("tok123", expect.anything());
  });

  it("refuses a non-HTTPS or local capture link", async () => {
    const { PhoneCaptureDialog } = await import("@/components/upload/PhoneCaptureDialog");
    api.createCapture.mockResolvedValue({
      token: "tok123", capture_url: "http://localhost:3000/capture/tok123", expires_at: inMinutes(10),
    });
    render(<PhoneCaptureDialog open onClose={() => {}} onJob={vi.fn()} />);
    expect(await screen.findByText(/valid expiring HTTPS link/)).toBeInTheDocument();
    expect(screen.queryByAltText(/QR code/)).not.toBeInTheDocument();
  });

  it("explains that phone capture needs the public site", async () => {
    const { PhoneCaptureDialog } = await import("@/components/upload/PhoneCaptureDialog");
    api.createCapture.mockRejectedValue(new Vision3DApiError("CAPTURE_UNAVAILABLE", "x", 503));
    render(<PhoneCaptureDialog open onClose={() => {}} onJob={vi.fn()} />);
    expect(await screen.findByText(/works on the public HTTPS site/)).toBeInTheDocument();
  });
});

describe("Phone capture page", () => {
  async function renderPage(token = "tok123") {
    const { default: PhoneCapturePage } = await import("@/app/capture/[token]/page");
    await act(async () => {
      render(<PhoneCapturePage params={Promise.resolve({ token })} />);
    });
  }

  it("sends one photo only after consent and confirms it", async () => {
    api.getCaptureInfo.mockResolvedValue({ expires_at: inMinutes(9), received: false });
    api.sendCapture.mockResolvedValue({ expires_at: inMinutes(9), received: true });
    await renderPage();

    expect(await screen.findByRole("heading", { name: /Take a photo for your 3D model/ })).toBeInTheDocument();
    const file = new File(["jpeg"], "shoe.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Choose a photo from the gallery"), { target: { files: [file] } });

    const sendButton = await screen.findByRole("button", { name: /Send to Computer/ });
    expect(sendButton).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(sendButton);

    expect(await screen.findByRole("heading", { name: "Photo sent" })).toBeInTheDocument();
    expect(api.sendCapture).toHaveBeenCalledWith("tok123", file, { allow_external_processing: true });
  });

  it("explains an already-used link", async () => {
    api.getCaptureInfo.mockResolvedValue({ expires_at: inMinutes(5), received: true });
    await renderPage();
    expect(await screen.findByText(/already sent with this code/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Take Photo/ })).not.toBeInTheDocument();
  });

  it("explains an expired link", async () => {
    api.getCaptureInfo.mockRejectedValue(
      new Vision3DApiError("EXPIRED", "This capture link expired. Scan a new code on your computer.", 410)
    );
    await renderPage();
    expect(await screen.findByText(/capture link expired/)).toBeInTheDocument();
  });
});

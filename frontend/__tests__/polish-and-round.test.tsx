import { createRef, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ImageInputPanel } from "@/components/upload/ImageInputPanel";
import {
  availableModes,
  availableQualityOptions,
} from "@/components/upload/ShapeModeSelect";
import { formatElapsed } from "@/components/viewer/ElapsedTime";
import { friendlyError } from "@/lib/errorCopy";
import type { ValidatedImageInfo } from "@/lib/validation";

const api = vi.hoisted(() => ({ checkHealth: vi.fn(), getCaptureInfo: vi.fn(), sendCapture: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  ...api,
}));
vi.mock("@/lib/validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/validation")>()),
  validateImageFile: vi.fn(async (file: File) => ({
    ok: true,
    data: { file, previewUrl: "blob:photo", width: 640, height: 480, sizeBytes: file.size, mimeType: file.type, warning: null },
  })),
}));

const image: ValidatedImageInfo = {
  file: new File(["x"], "bottle.jpg", { type: "image/jpeg" }),
  previewUrl: "blob:x", width: 640, height: 480, sizeBytes: 1, mimeType: "image/jpeg", warning: null,
};

function panel(props: Partial<ComponentProps<typeof ImageInputPanel>> = {}) {
  return render(
    <ImageInputPanel
      uploadedImage={image}
      onImageValidated={vi.fn()}
      onClearImage={vi.fn()}
      verifiedProviders={[{ id: "triposr-local", label: "TripoSR on this computer", verified: true, supports_background_removal: true }]}
      selectedProvider="triposr-local"
      onProviderChange={vi.fn()}
      removeBackground
      onRemoveBackgroundChange={vi.fn()}
      allowExternalProcessing={false}
      onAllowExternalProcessingChange={vi.fn()}
      isGenerating={false}
      onGenerate={vi.fn()}
      onPhoneJob={vi.fn()}
      fileInputRef={createRef<HTMLInputElement>()}
      {...props}
    />
  );
}

afterEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
});

describe("consent only when photos can leave the server", () => {
  it("asks for consent and blocks Generate until it is given", () => {
    panel({ consentRequired: true });
    expect(screen.getByLabelText(/hosted 3D inference provider/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate 3D/ })).toBeDisabled();
  });

  it("explains local processing and allows Generate without a checkbox", () => {
    panel({ consentRequired: false });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText(/processed on this server only/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate 3D/ })).toBeEnabled();
  });
});

describe("shape mode", () => {
  it("is hidden unless the server offers a shape mode", () => {
    panel({ modes: ["auto"], onModeChange: vi.fn() });
    expect(screen.queryByLabelText("Shape")).not.toBeInTheDocument();
  });

  it("offers round and box, and hides background removal outside AI mode", () => {
    const onModeChange = vi.fn();
    const { rerender } = panel({ modes: ["auto", "round", "box"], mode: "auto", onModeChange });
    expect(screen.getByText("Background Removal")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Shape"), { target: { value: "box" } });
    expect(onModeChange).toHaveBeenCalledWith("box");

    rerender(
      <ImageInputPanel
        uploadedImage={image}
        onImageValidated={vi.fn()}
        onClearImage={vi.fn()}
        verifiedProviders={[{ id: "triposr-local", label: "TripoSR", verified: true, supports_background_removal: true }]}
        selectedProvider="triposr-local"
        onProviderChange={vi.fn()}
        removeBackground
        onRemoveBackgroundChange={vi.fn()}
        allowExternalProcessing={false}
        onAllowExternalProcessingChange={vi.fn()}
        isGenerating={false}
        onGenerate={vi.fn()}
        onPhoneJob={vi.fn()}
        fileInputRef={createRef<HTMLInputElement>()}
        modes={["auto", "round", "box"]}
        mode="box"
        onModeChange={onModeChange}
      />
    );
    expect(screen.queryByText("Background Removal")).not.toBeInTheDocument();
    expect(screen.getByText(/Depth is estimated/)).toBeInTheDocument();
  });

  it("lists only the modes the server reports", () => {
    expect(availableModes({ status: "ok", round_mode: true, box_mode: false })).toEqual(["auto", "round"]);
    expect(availableModes(null)).toEqual(["auto"]);
  });

  it("exposes quality controls strictly when advertised by the backend", () => {
    expect(availableQualityOptions({ status: "ok" }, "sf3d-local")).toEqual([]);
    panel({ qualityOptions: [], onQualityChange: vi.fn() });
    expect(screen.queryByLabelText("Quality")).not.toBeInTheDocument();

    const onQualityChange = vi.fn();
    panel({
      qualityOptions: [
        { id: "standard", label: "Standard (1024px)" },
        { id: "high", label: "High (2048px)" },
      ],
      quality: "standard",
      onQualityChange,
    });
    const select = screen.getByLabelText("Quality");
    expect(select).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "high" } });
    expect(onQualityChange).toHaveBeenCalledWith("high");
  });
});

describe("phone page round mode", () => {
  it("sends round mode without consent when the server offers it", async () => {
    Object.assign(URL, { revokeObjectURL: vi.fn() }); // jsdom lacks it
    api.checkHealth.mockResolvedValue({ status: "ok", external_processing: true, round_mode: true, box_mode: true });
    api.getCaptureInfo.mockResolvedValue({ expires_at: new Date(Date.now() + 600_000).toISOString(), received: false });
    api.sendCapture.mockResolvedValue({ expires_at: new Date().toISOString(), received: true });
    const { default: Page } = await import("@/app/capture/[token]/page");
    await act(async () => {
      render(<Page params={Promise.resolve({ token: "tok" })} />);
    });
    const file = new File(["jpeg"], "bottle.jpg", { type: "image/jpeg" });
    fireEvent.change(await screen.findByLabelText("Choose a photo from the gallery"), { target: { files: [file] } });

    fireEvent.change(await screen.findByLabelText("Shape"), { target: { value: "round" } });
    expect(screen.queryByRole("checkbox", { name: /hosted 3D AI provider/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Send to Computer/ }));

    expect(await screen.findByRole("heading", { name: "Photo sent" })).toBeInTheDocument();
    expect(api.sendCapture).toHaveBeenCalledWith("tok", file, { allow_external_processing: false, mode: "round" });
  });
});

describe("friendly copy", () => {
  it("turns known codes into plain advice and keeps server detail otherwise", () => {
    expect(friendlyError({ code: "QUEUE_FULL", message: "The generation queue is full." }).title).toBe("Vision3D is busy");
    expect(friendlyError({ code: "INVALID_IMAGE", message: "Upload a JPEG." })).toEqual({
      title: "3D generation did not complete",
      message: "Upload a JPEG.",
    });
  });

  it("formats elapsed time as m:ss", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(65_400)).toBe("1:05");
    expect(formatElapsed(-5)).toBe("0:00");
  });
});

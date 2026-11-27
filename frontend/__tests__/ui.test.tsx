import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImageInputPanel } from "@/components/upload/ImageInputPanel";
import { ModelViewport } from "@/components/viewer/ModelViewport";
import { SAMPLE_MODEL } from "@/lib/sample";

vi.mock("@google/model-viewer", () => ({}));

describe("ImageInputPanel honesty and capabilities", () => {
  it("hides provider selector, background removal, and fictional quality tiers when no verified provider exists", () => {
    const fileRef = createRef<HTMLInputElement>();
    render(
      <ImageInputPanel
        uploadedImage={null}
        onImageValidated={vi.fn()}
        onClearImage={vi.fn()}
        verifiedProviders={[]}
        selectedProvider=""
        onProviderChange={vi.fn()}
        removeBackground={false}
        onRemoveBackgroundChange={vi.fn()}
        isGenerating={false}
        onGenerate={vi.fn()}
        fileInputRef={fileRef}
      />
    );

    expect(screen.queryByText("Standard")).not.toBeInTheDocument();
    expect(screen.queryByText("Ultra")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Verified Provider")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Background Removal")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Capture photo with camera")).toHaveAttribute(
      "capture",
      "environment"
    );
    expect(screen.getByRole("button", { name: /Generate 3D/i })).toBeDisabled();
  });

  it("shows provider selector and background removal toggle only when verified providers support them", () => {
    const fileRef = createRef<HTMLInputElement>();
    render(
      <ImageInputPanel
        uploadedImage={null}
        onImageValidated={vi.fn()}
        onClearImage={vi.fn()}
        verifiedProviders={[
          { id: "p1", label: "Provider One", verified: true, supports_background_removal: true },
          { id: "p2", label: "Provider Two", verified: true, supports_background_removal: false },
        ]}
        selectedProvider="p1"
        onProviderChange={vi.fn()}
        removeBackground={true}
        onRemoveBackgroundChange={vi.fn()}
        isGenerating={false}
        onGenerate={vi.fn()}
        fileInputRef={fileRef}
      />
    );

    expect(screen.getByLabelText("Verified Provider")).toBeInTheDocument();
    expect(screen.getByLabelText("Background Removal")).toBeInTheDocument();
  });
});

describe("ModelViewport states", () => {
  it("explicitly labels the sample 3D model when loaded", () => {
    render(
      <ModelViewport
        stage="result"
        model={SAMPLE_MODEL}
        uploadedImage={null}
        jobStatus={null}
        error={null}
        autoRotate={false}
        onAutoRotateChange={vi.fn()}
        onOpenArDialog={vi.fn()}
        onLoadSample={vi.fn()}
        onRetry={vi.fn()}
        onTriggerUpload={vi.fn()}
      />
    );

    expect(screen.getByText(/Sample 3D Model \(Demo Preview\)/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /View in AR/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Download GLB/i })).toBeEnabled();
  });

  it("renders indeterminate progress when backend omits numeric progress", () => {
    render(
      <ModelViewport
        stage="processing"
        model={null}
        uploadedImage={null}
        jobStatus={{ status: "processing", stage: "Inferring 3D mesh", progress: null }}
        error={null}
        autoRotate={false}
        onAutoRotateChange={vi.fn()}
        onOpenArDialog={vi.fn()}
        onLoadSample={vi.fn()}
        onRetry={vi.fn()}
        onTriggerUpload={vi.fn()}
      />
    );

    const bar = screen.getByRole("progressbar");
    expect(bar).not.toHaveAttribute("value");
    expect(screen.getByText(/Inferring 3D mesh/i)).toBeInTheDocument();
  });

  it("renders structured error code and retry action on failure", () => {
    render(
      <ModelViewport
        stage="error"
        model={null}
        uploadedImage={null}
        jobStatus={null}
        error={{ code: "PROVIDER_UNAVAILABLE", message: "Provider returned 503." }}
        autoRotate={false}
        onAutoRotateChange={vi.fn()}
        onOpenArDialog={vi.fn()}
        onLoadSample={vi.fn()}
        onRetry={vi.fn()}
        onTriggerUpload={vi.fn()}
      />
    );

    expect(screen.getByText("PROVIDER_UNAVAILABLE")).toBeInTheDocument();
    expect(screen.getByText("Provider returned 503.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry Generation/i })).toBeInTheDocument();
  });
});

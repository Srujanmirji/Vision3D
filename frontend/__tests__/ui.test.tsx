import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImageInputPanel } from "@/components/upload/ImageInputPanel";
import { ModelViewport } from "@/components/viewer/ModelViewport";
import { ExportDialog } from "@/components/export-dialog/ExportDialog";
import LandingPage from "@/app/page";
import { Button, Select, Tooltip } from "@/components/ui";
import { SAMPLE_MODEL } from "@/lib/sample";

vi.mock("@google/model-viewer", () => ({}));

describe("Design system primitives", () => {
  it("renders Button variants and accessible loading state", () => {
    render(
      <Button variant="primary" loading>
        Saving
      </Button>
    );
    const btn = screen.getByRole("button", { name: /Saving/i });
    expect(btn).toBeDisabled();
    expect(screen.getByRole("progressbar", { name: /Loading/i })).toBeInTheDocument();
  });

  it("renders Select options and Tooltip hint popover", () => {
    render(
      <>
        <Select
          label="Provider"
          value="triposr"
          onChange={vi.fn()}
          options={[{ value: "triposr", label: "TripoSR" }]}
        />
        <Tooltip content="Rotate 360 degrees">
          {(tip) => (
            <button type="button" {...tip}>
              Orbit
            </button>
          )}
        </Tooltip>
      </>
    );

    expect(screen.getByLabelText("Provider")).toHaveValue("triposr");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Rotate 360 degrees");
  });
});

describe("LandingPage and ExportDialog", () => {
  it("renders LandingPage with sample label and no pricing or credit claims", () => {
    render(<LandingPage />);

    expect(screen.getByText(/Sample 3D Model \(Demo Preview\)/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start Creating/i })).toHaveAttribute(
      "href",
      "/create"
    );
    expect(screen.queryByText(/Pricing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Credits/i)).not.toBeInTheDocument();
  });

  it("renders ExportDialog with GLB specs and honest format disclosure", () => {
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

    render(<ExportDialog open={true} onClose={vi.fn()} model={SAMPLE_MODEL} />);

    expect(screen.getByText("Export 3D Model")).toBeInTheDocument();
    expect(screen.getByText(".glb (glTF 2.0)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download GLB/i })).toBeInTheDocument();
    expect(
      screen.getByText(/OBJ and STL export are not available/i)
    ).toBeInTheDocument();
  });
});

describe("ImageInputPanel honesty, consent, and capabilities", () => {
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
        allowExternalProcessing={false}
        onAllowExternalProcessingChange={vi.fn()}
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
    expect(
      screen.getByRole("checkbox", { name: /Allow server-side upload/i })
    ).not.toBeChecked();
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
        allowExternalProcessing={true}
        onAllowExternalProcessingChange={vi.fn()}
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
  it("explicitly labels the sample 3D model and renders success banner when provided", () => {
    const pending = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    const { unmount } = render(
      <ModelViewport
        stage="result"
        model={SAMPLE_MODEL}
        uploadedImage={null}
        jobStatus={null}
        error={null}
        autoRotate={false}
        successNotice="3D model generated and validated."
        onAutoRotateChange={vi.fn()}
        onOpenArDialog={vi.fn()}
        onOpenExportDialog={vi.fn()}
        onLoadSample={vi.fn()}
        onRetry={vi.fn()}
        onCancelJob={vi.fn()}
        onTriggerUpload={vi.fn()}
      />
    );

    expect(screen.getByText(/Sample 3D Model \(Demo Preview\)/i)).toBeInTheDocument();
    expect(screen.getByText("3D model generated and validated.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /View in AR/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Download/i })).toBeEnabled();
    unmount();
    pending.mockRestore();
  });

  it("renders indeterminate progress and Cancel Job action during processing", () => {
    render(
      <ModelViewport
        stage="processing"
        model={null}
        uploadedImage={null}
        jobStatus={{
          job_id: "job-123",
          status: "processing",
          stage: "Baking texture",
          progress: null,
        }}
        error={null}
        autoRotate={false}
        onAutoRotateChange={vi.fn()}
        onOpenArDialog={vi.fn()}
        onOpenExportDialog={vi.fn()}
        onLoadSample={vi.fn()}
        onRetry={vi.fn()}
        onCancelJob={vi.fn()}
        onTriggerUpload={vi.fn()}
      />
    );

    const bars = screen.getAllByRole("progressbar");
    expect(bars.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("progressbar", { name: "3D generation progress" })).not.toHaveAttribute("value");
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
    expect(screen.getByText(/Baking texture/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel Job/i })).toBeInTheDocument();
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
        onOpenExportDialog={vi.fn()}
        onLoadSample={vi.fn()}
        onRetry={vi.fn()}
        onCancelJob={vi.fn()}
        onTriggerUpload={vi.fn()}
      />
    );

    expect(screen.getByText("PROVIDER_UNAVAILABLE")).toBeInTheDocument();
    expect(screen.getByText("Provider returned 503.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry Generation/i })).toBeInTheDocument();
  });
});

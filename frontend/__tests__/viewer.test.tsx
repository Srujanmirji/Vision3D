import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ModelViewport } from "@/components/viewer/ModelViewport";
import type { ModelAsset } from "@/lib/api";
import type { ValidatedImageInfo } from "@/lib/validation";

vi.mock("@google/model-viewer", () => ({}));
vi.mock("@/components/viewer/ThreeWireframeCanvas", () => ({
  ThreeWireframeCanvas: ({
    src,
    mode,
    showGrid,
  }: {
    src: string;
    mode?: string;
    showGrid?: boolean;
  }) => (
    <div
      data-testid="mock-wireframe"
      data-src={src}
      data-mode={mode}
      data-grid={String(Boolean(showGrid))}
    />
  ),
}));

const GENERATED_SNEAKER: ModelAsset = {
  id: "sneaker-001",
  name: "Running Sneaker",
  glb_url: "/api/v1/models/sneaker-001/glb",
  usdz_url: null,
  provider: "triposr",
  vertices: 50017,
  triangles: 63725,
  bounds_extent: [0.79, 0.71, 0.47],
  appearance: "baked_texture",
  byte_size: 2608380,
  created_at: "2026-11-27T15:36:34Z",
  is_sample: false,
};

const GENERATED_CHAIR: ModelAsset = {
  id: "chair-002",
  name: "Lounge Chair",
  glb_url: "/api/v1/models/chair-002/glb",
  usdz_url: null,
  provider: "triposr",
  vertices: 64120,
  triangles: 82911,
  bounds_extent: [0.82, 0.91, 0.76],
  appearance: "baked_texture",
  byte_size: 2998884,
  created_at: "2026-11-27T15:39:10Z",
  is_sample: false,
};

const UPLOADED_PHOTO: ValidatedImageInfo = {
  file: new File(["jpeg"], "shoes.jpg", { type: "image/jpeg" }),
  previewUrl: "blob:shoes-preview",
  width: 800,
  height: 600,
  sizeBytes: 42000,
  mimeType: "image/jpeg",
  warning: null,
};

describe("Production 3D ModelViewport", () => {
  beforeEach(() => {
    // These tests exercise controls without waiting for the actual renderer.
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
  });

  afterEach(() => vi.restoreAllMocks());

  it("renders actual backend model metadata, all 6 camera presets, and Textured/Geometry/Wireframe toggles", async () => {
    render(
      <ModelViewport
        stage="result"
        model={GENERATED_SNEAKER}
        uploadedImage={UPLOADED_PHOTO}
        reviewedCutoutUrl="data:image/png;base64,cutout"
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

    expect(screen.getByText("Generated GLB")).toBeInTheDocument();
    expect(screen.getByText("Baked Texture")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "3D model generated and validated."
    );
    expect(screen.getByText(/63,725 tris/)).toBeInTheDocument();
    expect(screen.getByText(/50,017 verts/)).toBeInTheDocument();
    expect(screen.getByText(/0\.79 × 0\.71 × 0\.47 u/)).toBeInTheDocument();

    // All 6 camera presets including Top and Bottom
    for (const label of [
      "Perspective",
      "Front",
      "Rear",
      "Side",
      "Top",
      "Bottom",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: "Top" }));
    expect(screen.getByRole("button", { name: "Top" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    fireEvent.click(screen.getByRole("button", { name: "Bottom" }));
    expect(screen.getByRole("button", { name: "Bottom" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // Shading toggle: Textured | Geometry | Wireframe
    const texturedBtn = screen.getByRole("button", { name: "Textured" });
    const geometryBtn = screen.getByRole("button", { name: "Geometry" });
    const wireframeBtn = screen.getByRole("button", { name: "Wireframe" });
    expect(texturedBtn).toHaveAttribute("aria-pressed", "true");
    expect(geometryBtn).toHaveAttribute("aria-pressed", "false");
    expect(wireframeBtn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(geometryBtn);
    expect(geometryBtn).toHaveAttribute("aria-pressed", "true");
    expect(texturedBtn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(wireframeBtn);
    expect(wireframeBtn).toHaveAttribute("aria-pressed", "true");
    expect(geometryBtn).toHaveAttribute("aria-pressed", "false");

    // Before/After comparison toggle + Photo/Cutout layer switch + Align 3D Front
    const compareBtn = screen.getByRole("button", { name: "Compare" });
    expect(compareBtn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(compareBtn);
    expect(compareBtn).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Before · Source 2D")).toBeInTheDocument();
    expect(
      screen.getByAltText("Source input photo for 2D to 3D comparison")
    ).toHaveAttribute("src", "blob:shoes-preview");

    fireEvent.click(screen.getByRole("button", { name: "Cutout" }));
    expect(
      screen.getByAltText("Source input photo for 2D to 3D comparison")
    ).toHaveAttribute("src", "data:image/png;base64,cutout");

    fireEvent.click(screen.getByRole("button", { name: "Align 3D Front" }));
    expect(screen.getByRole("button", { name: "Front" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // Ground grid & Lighting controls
    const gridBtn = screen.getByRole("button", { name: "Ground grid" });
    expect(gridBtn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(gridBtn);
    expect(gridBtn).toHaveAttribute("aria-pressed", "true");

    const lightingBtn = screen.getByRole("button", {
      name: "Lighting controls",
    });
    expect(lightingBtn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(lightingBtn);
    expect(lightingBtn).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("region", { name: "Viewer lighting settings" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Soft" }));
    expect(screen.getByRole("button", { name: "Soft" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.change(screen.getByLabelText("Exposure"), {
      target: { value: "1.2" },
    });
    expect(screen.getByText("1.20×")).toBeInTheDocument();

    await act(async () => {
      await import("@google/model-viewer");
    });
  });

  it("resets camera preset and updates metadata cleanly when switching between generated models", async () => {
    const { rerender } = render(
      <ModelViewport
        stage="result"
        model={GENERATED_SNEAKER}
        uploadedImage={null}
        jobStatus={null}
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

    const rearBtn = screen.getByRole("button", { name: "Rear" });
    fireEvent.click(rearBtn);
    expect(rearBtn).toHaveAttribute("aria-pressed", "true");

    // Switch to a second real generated GLB model
    rerender(
      <ModelViewport
        stage="result"
        model={GENERATED_CHAIR}
        uploadedImage={null}
        jobStatus={null}
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

    expect(screen.getByRole("button", { name: "Perspective" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByText(/82,911 tris/)).toBeInTheDocument();
    expect(screen.getByText(/64,120 verts/)).toBeInTheDocument();
    await act(async () => {
      await import("@google/model-viewer");
    });
  });

  it("switches cleanly between Orbit and Pan interaction modes", async () => {
    render(
      <ModelViewport
        stage="result"
        model={GENERATED_SNEAKER}
        uploadedImage={null}
        jobStatus={null}
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

    const panBtn = screen.getByRole("button", { name: "Pan camera mode" });
    fireEvent.click(panBtn);
    expect(panBtn).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Pan active/i)).toBeInTheDocument();
    await act(async () => {
      await import("@google/model-viewer");
    });
  });
});

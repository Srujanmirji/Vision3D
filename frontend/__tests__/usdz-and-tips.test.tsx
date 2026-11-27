import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PhotoTips } from "@/components/upload/PhotoTips";
import { SAMPLE_MODEL } from "@/lib/sample";
import { USDZ_MIME } from "@/lib/usdz";

// jsdom's <dialog> lacks showModal(); browsers have it.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

describe("PhotoTips", () => {
  it("lists what makes a good photo and what to avoid", () => {
    render(<PhotoTips />);
    expect(screen.getByRole("heading", { name: "For the best 3D result" })).toBeInTheDocument();
    expect(screen.getByText(/One object, fully in frame/)).toBeInTheDocument();
    expect(screen.getByText(/Avoid:/)).toBeInTheDocument();
  });
});

describe("ExportDialog USDZ download", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("@/lib/api");
    vi.doUnmock("@/lib/usdz");
  });

  async function renderDialog(convert: () => Promise<Blob>) {
    const glb = new Blob(["glTF"]);
    vi.doMock("@/lib/api", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/api")>()),
      downloadModel: vi.fn().mockResolvedValue(glb),
    }));
    const glbToUsdz = vi.fn(convert);
    vi.doMock("@/lib/usdz", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/usdz")>()),
      glbToUsdz,
    }));
    const createUrl = vi.fn<(blob: Blob) => string>(() => "blob:usdz");
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { ExportDialog } = await import("@/components/export-dialog/ExportDialog");
    render(<ExportDialog open onClose={() => {}} model={SAMPLE_MODEL} />);
    fireEvent.click(screen.getByRole("button", { name: /Download USDZ/ }));
    return { glb, glbToUsdz, createUrl, click };
  }

  it("converts the downloaded GLB and saves a .usdz file", async () => {
    const usdz = new Blob(["PK"], { type: USDZ_MIME });
    const { glb, glbToUsdz, createUrl, click } = await renderDialog(async () => usdz);

    await waitFor(() => expect(screen.getByText("USDZ Saved")).toBeInTheDocument());
    expect(glbToUsdz).toHaveBeenCalledWith(glb);
    expect(createUrl).toHaveBeenCalledWith(usdz);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("shows an error and allows retry when conversion fails", async () => {
    const { click } = await renderDialog(async () => {
      throw new Error("bad mesh");
    });

    await waitFor(() => expect(screen.getByText(/USDZ conversion failed\. bad mesh/)).toBeInTheDocument());
    expect(click).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Download USDZ/ })).toBeEnabled();
  });
});

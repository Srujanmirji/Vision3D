"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { AlertBanner, Button, Dialog, Spinner } from "@/components/ui";
import {
  previewForeground,
  type ForegroundPreview,
  type ReviewedForeground,
} from "@/lib/api";

type Tool = "erase" | "restore";
type BrushPreset = "fine" | "medium" | "broad";
type PreviewLayer = "cutout" | "mask";
type Point = { x: number; y: number };
type Images = {
  cutout: ImageData;
  photo: ImageData;
  mask: ImageData;
  edits: CanvasRenderingContext2D;
};

const BRUSH_FACTORS: Record<BrushPreset, { label: string; scale: number }> = {
  fine: { label: "Fine", scale: 0.009 },
  medium: { label: "Medium", scale: 0.019 },
  broad: { label: "Broad", scale: 0.038 },
};

function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  return image.decode().then(() => image);
}

async function loadImages(preview: ForegroundPreview): Promise<Images> {
  const url = URL.createObjectURL(preview.upload);
  try {
    const images = await Promise.all([
      loadImage(`data:image/png;base64,${preview.cutout_png}`),
      loadImage(url),
      loadImage(`data:image/png;base64,${preview.mask_png}`),
    ]);
    const canvas = document.createElement("canvas");
    const { width, height } = preview;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Mask editing is unavailable in this browser.");
    }
    const [cutout, photo, mask] = images.map((image) => {
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      return context.getImageData(0, 0, width, height);
    });
    if (!cutout || !photo || !mask) {
      throw new Error("Could not open the foreground images.");
    }
    context.clearRect(0, 0, width, height);
    return { cutout, photo, mask, edits: context };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function compose(
  images: Images,
  minimum: number,
  type: "preview" | "mask"
): ImageData {
  const { width, height, data: cutout } = images.cutout;
  const output = new ImageData(width, height);
  const original = images.mask.data;
  const edits = images.edits.getImageData(0, 0, width, height).data;
  for (let i = 0; i < output.data.length; i += 4) {
    const overridden = (edits[i + 3] ?? 0) > 127;
    const value = overridden
      ? (edits[i] ?? 0) > 127
        ? 255
        : 0
      : (original[i] ?? 0);
    const alpha = overridden || value >= minimum ? value : 0;
    if (type === "mask") {
      output.data[i] = output.data[i + 1] = output.data[i + 2] = alpha;
      output.data[i + 3] = 255;
    } else if (alpha) {
      const color = overridden ? images.photo.data : cutout;
      output.data[i] = color[i] ?? 0;
      output.data[i + 1] = color[i + 1] ?? 0;
      output.data[i + 2] = color[i + 2] ?? 0;
      output.data[i + 3] = alpha;
    }
  }
  return output;
}

interface ForegroundDialogProps {
  photo: File;
  onUse: (review: ReviewedForeground) => void;
  onClose: () => void;
}

export function ForegroundDialog({
  photo,
  onUse,
  onClose,
}: ForegroundDialogProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const priorPoint = useRef<Point | null>(null);
  const [preview, setPreview] = useState<ForegroundPreview | null>(null);
  const [images, setImages] = useState<Images | null>(null);
  const [minimum, setMinimum] = useState(0);
  const [tool, setTool] = useState<Tool>("erase");
  const [brushPreset, setBrushPreset] = useState<BrushPreset>("medium");
  const [layer, setLayer] = useState<PreviewLayer>("cutout");
  const [cursor, setCursor] = useState<Point | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const radius = preview
    ? Math.max(
        3,
        Math.round(
          Math.max(preview.width, preview.height) *
            BRUSH_FACTORS[brushPreset].scale
        )
      )
    : 3;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const result = await previewForeground(photo, controller.signal);
        const layers = await loadImages(result);
        if (controller.signal.aborted) return;
        setPreview(result);
        setImages(layers);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not preview this foreground."
          );
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [photo]);

  useEffect(() => {
    if (!canvas.current || !images) return;
    const element = canvas.current;
    const context = element.getContext("2d");
    if (!context) return;
    context.putImageData(
      compose(images, minimum, layer === "mask" ? "mask" : "preview"),
      0,
      0
    );
    if (cursor) {
      context.beginPath();
      context.arc(cursor.x, cursor.y, radius, 0, 2 * Math.PI);
      context.strokeStyle = getComputedStyle(element).color;
      context.lineWidth = Math.max(2, radius / 7);
      context.stroke();
    }
  }, [cursor, images, layer, minimum, radius, revision]);

  function paint(from: Point, to: Point) {
    if (!images) return;
    const brush = images.edits;
    const color = tool === "erase" ? "black" : "white";
    brush.strokeStyle = brush.fillStyle = color;
    brush.lineWidth = radius * 2;
    brush.lineCap = "round";
    brush.beginPath();
    brush.moveTo(from.x, from.y);
    brush.lineTo(to.x, to.y);
    brush.stroke();
    brush.beginPath();
    brush.arc(to.x, to.y, radius, 0, 2 * Math.PI);
    brush.fill();
    setRevision((value) => value + 1);
  }

  function pointerPosition(event: PointerEvent<HTMLCanvasElement>): Point {
    const element = event.currentTarget;
    const bounds = element.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) * element.width) / bounds.width,
      y: ((event.clientY - bounds.top) * element.height) / bounds.height,
    };
  }

  function moveKeyboard(event: KeyboardEvent<HTMLCanvasElement>) {
    const { width, height } = event.currentTarget;
    const current = cursor ?? { x: width / 2, y: height / 2 };
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      paint(current, current);
      return;
    }
    const moves: Record<string, Point> = {
      ArrowLeft: { x: -radius, y: 0 },
      ArrowRight: { x: radius, y: 0 },
      ArrowUp: { x: 0, y: -radius },
      ArrowDown: { x: 0, y: radius },
    };
    const change = moves[event.key];
    if (!change) return;
    event.preventDefault();
    setCursor({
      x: Math.min(width - 1, Math.max(0, current.x + change.x)),
      y: Math.min(height - 1, Math.max(0, current.y + change.y)),
    });
  }

  function useMask() {
    if (!preview || !images) return;
    const working = document.createElement("canvas");
    working.width = preview.width;
    working.height = preview.height;
    const context = working.getContext("2d");
    if (!context) return;
    const mask = compose(images, minimum, "mask");
    if (!mask.data.some((value, index) => index % 4 === 0 && value >= 48)) {
      setError("Keep some foreground before applying the mask.");
      return;
    }

    // Build a clean preview data URL of the edited cutout for workspace inspection
    let cutoutPreviewUrl: string | undefined;
    const cutoutCanvas = document.createElement("canvas");
    cutoutCanvas.width = preview.width;
    cutoutCanvas.height = preview.height;
    const cutoutCtx = cutoutCanvas.getContext("2d");
    if (cutoutCtx) {
      cutoutCtx.putImageData(compose(images, minimum, "preview"), 0, 0);
      cutoutPreviewUrl = cutoutCanvas.toDataURL("image/png");
    }

    context.putImageData(mask, 0, 0);
    setError("");
    setSaving(true);
    working.toBlob((blob) => {
      if (!canvas.current) return;
      if (blob) {
        onUse({ upload: preview.upload, mask: blob, cutoutPreviewUrl });
      } else {
        setSaving(false);
        setError("Could not save the foreground mask.");
      }
    }, "image/png");
  }

  return (
    <Dialog
      open
      title="Preview background removal"
      description="Erase leftover background or restore missing details. Raise minimum opacity to remove faint shadows."
      onClose={onClose}
      className="!max-w-[min(540px,calc(100vw-32px))]"
      footer={
        <>
          <Button size="lg" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="lg"
            variant="primary"
            disabled={!images || saving}
            onClick={useMask}
          >
            Use this mask
          </Button>
        </>
      }
    >
      {error ? (
        <AlertBanner tone="error" title="Foreground preview">
          {error}
        </AlertBanner>
      ) : null}
      {!images && !error ? <Spinner label="Removing background" /> : null}
      {images && preview ? (
        <div className="space-y-3">
          {/* Primary brush + size + view controls. Note: "Reset mask" stays last before <canvas> for keyboard navigation */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="lg"
              variant={tool === "erase" ? "secondary" : "ghost"}
              aria-pressed={tool === "erase"}
              className={tool === "erase" ? "border-copper/60 text-copper" : ""}
              onClick={() => setTool("erase")}
            >
              Erase
            </Button>
            <Button
              size="lg"
              variant={tool === "restore" ? "secondary" : "ghost"}
              aria-pressed={tool === "restore"}
              className={
                tool === "restore" ? "border-copper/60 text-copper" : ""
              }
              onClick={() => setTool("restore")}
            >
              Restore
            </Button>

            {(["fine", "medium", "broad"] as const).map((preset) => (
              <Button
                key={preset}
                size="lg"
                variant={brushPreset === preset ? "secondary" : "ghost"}
                aria-pressed={brushPreset === preset}
                aria-label={`${BRUSH_FACTORS[preset].label} brush`}
                onClick={() => setBrushPreset(preset)}
              >
                {BRUSH_FACTORS[preset].label}
              </Button>
            ))}

            <Button
              size="lg"
              variant={layer === "mask" ? "secondary" : "ghost"}
              aria-pressed={layer === "mask"}
              onClick={() =>
                setLayer((prev) => (prev === "cutout" ? "mask" : "cutout"))
              }
            >
              {layer === "mask" ? "Show cutout" : "Show mask"}
            </Button>

            <Button
              size="lg"
              variant="ghost"
              onClick={() => {
                images.edits.clearRect(0, 0, preview.width, preview.height);
                setMinimum(0);
                setRevision((value) => value + 1);
              }}
            >
              Reset mask
            </Button>
          </div>

          <canvas
            ref={canvas}
            width={preview.width}
            height={preview.height}
            tabIndex={0}
            aria-label="Foreground mask editor"
            aria-describedby="foreground-keyboard-help"
            style={{
              backgroundImage:
                layer === "cutout"
                  ? "repeating-conic-gradient(#1b1b1e 0% 25%, #121214 0% 50%)"
                  : undefined,
              backgroundSize: "16px 16px",
            }}
            className="mx-auto block h-auto max-h-[34vh] max-w-full cursor-crosshair touch-none rounded-[8px] border border-border-subtle bg-obsidian text-copper"
            onKeyDown={moveKeyboard}
            onBlur={() => setCursor(null)}
            onFocus={() =>
              setCursor({ x: preview.width / 2, y: preview.height / 2 })
            }
            onPointerLeave={() => {
              if (!priorPoint.current) setCursor(null);
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              const point = pointerPosition(event);
              priorPoint.current = point;
              setCursor(point);
              paint(point, point);
            }}
            onPointerMove={(event) => {
              const point = pointerPosition(event);
              setCursor(point);
              const start = priorPoint.current;
              if (!start) return;
              priorPoint.current = point;
              paint(start, point);
            }}
            onLostPointerCapture={() => {
              priorPoint.current = null;
            }}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-secondary">
            <p id="foreground-keyboard-help">
              Use the arrow keys to move the brush, then press Space to apply it.
            </p>
            <span className="font-mono text-[11px] text-ink-muted">
              {preview.width} × {preview.height}px
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="foreground-opacity"
                className="block text-xs font-medium text-ink-secondary"
              >
                Minimum opacity
              </label>
              <span className="font-mono text-[11px] text-ink-muted">
                {minimum} / 160
              </span>
            </div>
            <input
              id="foreground-opacity"
              type="range"
              min="0"
              max="160"
              value={minimum}
              onChange={(event) => setMinimum(event.currentTarget.valueAsNumber)}
              className="h-11 w-full accent-copper"
            />
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

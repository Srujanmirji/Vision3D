"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Box,
  Download,
  Hand,
  Maximize2,
  Minimize2,
  Orbit,
  Play,
  RefreshCw,
  Smartphone,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { ApiErrorPayload, JobStatusResponse, ModelAsset } from "@/lib/api";
import type { ValidatedImageInfo } from "@/lib/validation";
import { formatBytes } from "@/lib/validation";
import { CopperSwitch } from "@/components/ui/CopperSwitch";
import type { ModelViewerElement } from "@/types/model-viewer";

export type WorkspaceStage =
  | "empty"
  | "uploaded"
  | "processing"
  | "result"
  | "error";

interface ModelViewportProps {
  stage: WorkspaceStage;
  model: ModelAsset | null;
  uploadedImage: ValidatedImageInfo | null;
  jobStatus: JobStatusResponse | null;
  error: ApiErrorPayload | null;
  autoRotate: boolean;
  onAutoRotateChange: (enabled: boolean) => void;
  onOpenArDialog: () => void;
  onLoadSample: () => void;
  onRetry: () => void;
  onTriggerUpload: () => void;
}

const DEFAULT_ORBIT = "35deg 75deg 105%";
const DEFAULT_FOV = 34;

export function ModelViewport({
  stage,
  model,
  uploadedImage,
  jobStatus,
  error,
  autoRotate,
  onAutoRotateChange,
  onOpenArDialog,
  onLoadSample,
  onRetry,
  onTriggerUpload,
}: ModelViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ModelViewerElement>(null);

  const [viewerReady, setViewerReady] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const [interactionMode, setInteractionMode] = useState<"orbit" | "pan">("orbit");
  const [fov, setFov] = useState(DEFAULT_FOV);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Load @google/model-viewer strictly on the client to isolate browser APIs from SSR
  useEffect(() => {
    let active = true;
    import("@google/model-viewer")
      .then(() => {
        if (active) setViewerReady(true);
      })
      .catch(() => {
        if (active) setModelLoadError("Failed to initialize 3D viewer module.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setModelLoaded(false);
    setModelLoadError(null);
  }, [model?.glb_url]);

  useEffect(() => {
    const el = viewerRef.current;
    if (!el || !viewerReady || !model) return;

    const handleLoad = () => {
      setModelLoaded(true);
      setModelLoadError(null);
    };
    const handleError = () => {
      setModelLoadError("Could not load the 3D GLB model file.");
    };

    el.addEventListener("load", handleLoad);
    el.addEventListener("error", handleError);
    return () => {
      el.removeEventListener("load", handleLoad);
      el.removeEventListener("error", handleError);
    };
  }, [viewerReady, model]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const handleZoomIn = useCallback(() => {
    setFov((prev) => {
      const next = Math.max(14, prev - 5);
      if (viewerRef.current) {
        viewerRef.current.fieldOfView = `${next}deg`;
      }
      return next;
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setFov((prev) => {
      const next = Math.min(60, prev + 5);
      if (viewerRef.current) {
        viewerRef.current.fieldOfView = `${next}deg`;
      }
      return next;
    });
  }, []);

  const handleResetView = useCallback(() => {
    setFov(DEFAULT_FOV);
    const el = viewerRef.current;
    if (!el) return;
    el.cameraOrbit = DEFAULT_ORBIT;
    el.cameraTarget = "auto auto auto";
    el.fieldOfView = `${DEFAULT_FOV}deg`;
    el.resetTurntableRotation?.(0);
    el.jumpCameraToGoal?.();
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    const target = containerRef.current;
    if (!target) return;
    try {
      if (!document.fullscreenElement) {
        await target.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore if fullscreen is blocked by browser policy
    }
  }, []);

  const handleDownload = useCallback(() => {
    if (!model) return;
    const link = document.createElement("a");
    link.href = model.glb_url;
    const safeName = model.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    link.download = `${safeName || "vision3d-model"}.glb`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [model]);

  const hasModel = stage === "result" && Boolean(model);
  const progressValue =
    typeof jobStatus?.progress === "number" && Number.isFinite(jobStatus.progress)
      ? Math.max(0, Math.min(100, Math.round(jobStatus.progress)))
      : null;

  return (
    <section
      ref={containerRef}
      aria-label="3D model viewport"
      className="relative flex flex-col justify-between overflow-hidden rounded-[20px] border border-border-subtle bg-[#141416] min-h-[440px] lg:min-h-[600px]"
    >
      {/* Subtle studio floor radial wash — restrained, no excessive glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(56% 42% at 50% 68%, rgba(247, 148, 72, 0.08) 0%, rgba(25, 25, 27, 0.25) 55%, transparent 100%)",
        }}
      />

      {/* Top Overlay Bar: Status / Sample Label */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <div className="flex items-center gap-2">
          {hasModel && model && (
            <span
              className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${
                model.is_sample
                  ? "border-copper/35 bg-copper/12 text-copper"
                  : "border-border-subtle bg-raised/90 text-ink-primary"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  model.is_sample ? "bg-copper" : "bg-emerald-400"
                }`}
              />
              {model.is_sample ? "Sample 3D Model (Demo Preview)" : "Generated GLB"}
            </span>
          )}
        </div>

        {hasModel && model?.byte_size ? (
          <span className="shrink-0 whitespace-nowrap rounded-full border border-border-subtle bg-raised/85 px-3 py-1 text-xs text-ink-secondary">
            GLB · {formatBytes(model.byte_size)}
          </span>
        ) : null}
      </div>

      {/* Left Vertical Floating Toolbar (matches design-reference.png) */}
      <div
        role="toolbar"
        aria-label="Viewport camera controls"
        className="absolute left-4 top-16 z-20 flex flex-col gap-1 rounded-2xl border border-border-subtle bg-raised/90 p-1.5 backdrop-blur-md"
      >
        <button
          type="button"
          onClick={() => setInteractionMode("orbit")}
          disabled={!hasModel}
          aria-pressed={interactionMode === "orbit"}
          aria-label="Orbit camera mode"
          title="Orbit (drag to rotate 360°)"
          className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
            interactionMode === "orbit" && hasModel
              ? "border-copper/45 bg-copper/18 text-copper"
              : "border-transparent text-ink-secondary hover:bg-panel hover:text-ink-primary"
          }`}
        >
          <Orbit className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={() => setInteractionMode("pan")}
          disabled={!hasModel}
          aria-pressed={interactionMode === "pan"}
          aria-label="Pan camera mode"
          title="Pan (Shift + drag or two-finger drag)"
          className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
            interactionMode === "pan" && hasModel
              ? "border-copper/45 bg-copper/18 text-copper"
              : "border-transparent text-ink-secondary hover:bg-panel hover:text-ink-primary"
          }`}
        >
          <Hand className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={handleZoomIn}
          disabled={!hasModel}
          aria-label="Zoom in"
          title="Zoom in"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-ink-secondary transition-colors hover:bg-panel hover:text-ink-primary disabled:opacity-35 disabled:cursor-not-allowed"
        >
          <ZoomIn className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={handleZoomOut}
          disabled={!hasModel}
          aria-label="Zoom out"
          title="Zoom out"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-ink-secondary transition-colors hover:bg-panel hover:text-ink-primary disabled:opacity-35 disabled:cursor-not-allowed"
        >
          <ZoomOut className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={handleResetView}
          disabled={!hasModel}
          aria-label="Reset camera view"
          title="Reset camera view"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-ink-secondary transition-colors hover:bg-panel hover:text-ink-primary disabled:opacity-35 disabled:cursor-not-allowed"
        >
          <Box className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={handleToggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-ink-secondary transition-colors hover:bg-panel hover:text-ink-primary"
        >
          {isFullscreen ? (
            <Minimize2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
          ) : (
            <Maximize2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
          )}
        </button>
      </div>

      {/* Central Stage */}
      <div className="relative z-0 flex flex-1 items-center justify-center pl-[76px] pr-4 py-6 sm:px-16">
        {stage === "empty" && (
          <div className="flex max-w-md flex-col items-center text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-border-subtle bg-panel">
              <Box className="h-8 w-8 text-copper" strokeWidth={1.5} />
            </div>
            <h2 className="text-lg font-semibold text-ink-primary">
              Ready for your 2D image
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
              Upload a JPEG, PNG, or WebP photo of a single foreground object to
              generate an interactive 360° GLB model and mobile AR preview.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onTriggerUpload}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-copper px-4 py-2.5 text-sm font-semibold text-ink-on-copper transition-colors hover:bg-copper-hover active:bg-copper-pressed"
              >
                <Upload className="h-4 w-4" />
                Upload Image
              </button>
              <button
                type="button"
                onClick={onLoadSample}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border-subtle bg-raised px-4 py-2.5 text-sm font-medium text-ink-primary transition-colors hover:border-border-strong hover:bg-[#2a2a2e]"
              >
                <Box className="h-4 w-4 text-copper" />
                Load Sample 3D Model
              </button>
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              Sample model is a local demo GLB for inspecting the 3D viewer and AR flow.
            </p>
          </div>
        )}

        {stage === "uploaded" && uploadedImage && (
          <div className="flex max-w-md flex-col items-center text-center">
            <div className="relative overflow-hidden rounded-2xl border border-border-subtle bg-panel p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={uploadedImage.previewUrl}
                alt="Uploaded source image ready for 3D generation"
                className="max-h-[280px] max-w-full rounded-xl object-contain"
              />
            </div>
            <p className="mt-4 text-sm font-medium text-ink-primary">
              Source image validated ({uploadedImage.width} × {uploadedImage.height}px ·{" "}
              {formatBytes(uploadedImage.sizeBytes)})
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
              Click <span className="text-copper font-medium">Generate 3D</span> in the
              panel to submit this photo to the server-side inference API.
            </p>
          </div>
        )}

        {stage === "processing" && (
          <div
            role="status"
            aria-live="polite"
            className="flex w-full max-w-sm flex-col items-center text-center"
          >
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-copper/30 bg-copper/10">
              <Orbit className="h-7 w-7 text-copper" strokeWidth={1.6} />
            </div>
            <h2 className="text-base font-semibold text-ink-primary">
              {jobStatus?.status === "queued"
                ? "Queued for 3D generation"
                : "Generating 3D mesh"}
            </h2>
            <p className="mt-1 text-xs text-ink-secondary">
              {jobStatus?.stage
                ? jobStatus.stage
                : "Waiting for server-side provider response…"}
            </p>
            <div className="mt-5 w-full">
              <label htmlFor="v3d-job-progress" className="sr-only">
                3D generation progress
              </label>
              <progress
                id="v3d-job-progress"
                className="v3d-progress"
                max={100}
                {...(progressValue !== null ? { value: progressValue } : {})}
              />
              <p className="mt-2 text-xs text-ink-muted">
                {progressValue !== null
                  ? `${progressValue}% reported by provider`
                  : "Indeterminate stage — progress percentage not reported by provider"}
              </p>
            </div>
          </div>
        )}

        {stage === "error" && error && (
          <div
            role="alert"
            className="flex max-w-md flex-col items-center rounded-2xl border border-border-subtle bg-panel/90 p-6 text-center"
          >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-copper/35 bg-copper/12 text-copper">
              <AlertTriangle className="h-6 w-6" strokeWidth={1.75} />
            </div>
            <span className="rounded-md border border-border-subtle bg-raised px-2 py-0.5 font-mono text-[11px] text-ink-secondary">
              {error.code}
            </span>
            <h2 className="mt-3 text-base font-semibold text-ink-primary">
              3D generation did not complete
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">
              {error.message}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-copper px-4 py-2 text-sm font-semibold text-ink-on-copper transition-colors hover:bg-copper-hover active:bg-copper-pressed"
              >
                <RefreshCw className="h-4 w-4" />
                Retry Generation
              </button>
              <button
                type="button"
                onClick={onLoadSample}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-border-subtle bg-raised px-4 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-[#2a2a2e]"
              >
                Inspect Sample 3D Model
              </button>
            </div>
          </div>
        )}

        {hasModel && model && (
          <div className="relative h-[340px] w-full sm:h-[420px] lg:h-[470px]">
            {/* Subtle 360° turntable floor ring matching design-reference.png */}
            <svg
              aria-hidden="true"
              viewBox="0 0 600 140"
              className="pointer-events-none absolute bottom-3 left-1/2 w-[min(92%,520px)] -translate-x-1/2 opacity-65"
            >
              <defs>
                <linearGradient id="ringFade" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#A6A3A0" stopOpacity="0.15" />
                  <stop offset="30%" stopColor="#F5F3F0" stopOpacity="0.55" />
                  <stop offset="50%" stopColor="#F79448" stopOpacity="0.5" />
                  <stop offset="70%" stopColor="#F5F3F0" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#A6A3A0" stopOpacity="0.15" />
                </linearGradient>
              </defs>
              <path
                d="M 246 116 A 252 54 0 1 1 354 116"
                fill="none"
                stroke="url(#ringFade)"
                strokeWidth="1.25"
              />
              <circle cx="176" cy="108" r="2.5" fill="#F5F3F0" fillOpacity="0.65" />
              <circle cx="424" cy="108" r="2.5" fill="#F5F3F0" fillOpacity="0.65" />
              <text
                x="300"
                y="121"
                textAnchor="middle"
                fill="#F5F3F0"
                fontSize="15"
                fontWeight="500"
                fontFamily="Inter, system-ui, sans-serif"
              >
                360°
              </text>
            </svg>

            {viewerReady ? (
              <model-viewer
                ref={viewerRef}
                src={model.glb_url}
                ios-src={model.usdz_url ?? undefined}
                alt={`Interactive 3D model: ${model.name}`}
                camera-controls
                auto-rotate={autoRotate || undefined}
                auto-rotate-delay={0}
                rotation-per-second="18deg"
                camera-orbit={DEFAULT_ORBIT}
                field-of-view={`${fov}deg`}
                shadow-intensity="1"
                shadow-softness="0.85"
                exposure="1.05"
                interaction-prompt="none"
                touch-action="pan-y"
                style={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-ink-secondary">
                Initializing 3D viewport…
              </div>
            )}

            {viewerReady && !modelLoaded && !modelLoadError && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="rounded-full border border-border-subtle bg-panel/90 px-3.5 py-1.5 text-xs text-ink-secondary">
                  Loading GLB geometry…
                </span>
              </div>
            )}

            {modelLoadError && (
              <div
                role="alert"
                className="absolute inset-0 flex items-center justify-center"
              >
                <div className="rounded-2xl border border-border-subtle bg-panel px-5 py-4 text-center">
                  <p className="text-sm font-medium text-ink-primary">{modelLoadError}</p>
                </div>
              </div>
            )}

            {interactionMode === "pan" && (
              <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-full border border-border-subtle bg-panel/90 px-3 py-1 text-[11px] text-ink-secondary">
                Pan: Hold Shift + drag (desktop) or two-finger drag (touch)
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Viewport Controls Bar (matches design-reference.png) */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-4 pb-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex min-h-[42px] items-center gap-2.5 rounded-xl border border-border-subtle bg-raised/90 px-3.5 py-2 backdrop-blur-md">
            <Play className="h-3.5 w-3.5 text-ink-secondary" strokeWidth={1.75} />
            <CopperSwitch
              id="viewport-auto-rotate"
              label="Auto Rotate"
              labelClassName="text-xs sm:text-sm font-medium text-ink-primary"
              checked={autoRotate}
              disabled={!hasModel}
              onCheckedChange={onAutoRotateChange}
            />
          </div>

          <button
            type="button"
            onClick={handleResetView}
            disabled={!hasModel}
            className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-border-subtle bg-raised/90 px-3.5 py-2 text-xs sm:text-sm font-medium text-ink-primary backdrop-blur-md transition-colors hover:border-border-strong hover:bg-[#2a2a2e] disabled:opacity-40 disabled:cursor-not-allowed"
            title="Reset 360° camera angle"
          >
            360°
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenArDialog}
            disabled={!hasModel}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-border-subtle bg-raised/90 px-4 py-2 text-xs sm:text-sm font-medium text-ink-primary backdrop-blur-md transition-colors hover:border-copper/50 hover:bg-[#2a2a2e] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Smartphone className="h-4 w-4 text-ink-secondary" strokeWidth={1.75} />
            <span>View in AR</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={!hasModel}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-border-subtle bg-raised/90 px-4 py-2 text-xs sm:text-sm font-medium text-ink-primary backdrop-blur-md transition-colors hover:border-copper/50 hover:bg-[#2a2a2e] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="h-4 w-4 text-ink-secondary" strokeWidth={1.75} />
            <span>Download GLB</span>
          </button>
        </div>
      </div>
    </section>
  );
}

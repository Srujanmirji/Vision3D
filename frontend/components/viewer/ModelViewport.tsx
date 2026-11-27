"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  CheckCircle2,
  ChevronDown,
  Download,
  Hand,
  Maximize2,
  Minimize2,
  Orbit,
  Play,
  RefreshCw,
  Smartphone,
  Upload,
  XCircle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Link from "next/link";
import {
  formatAppearanceLabel,
  jobStageLabel,
  type ApiErrorPayload,
  type JobStatusResponse,
  type ModelAsset,
} from "@/lib/api";
import type { ValidatedImageInfo } from "@/lib/validation";
import { formatBytes } from "@/lib/validation";
import {
  Badge,
  Button,
  CopperSwitch,
  ErrorState,
  ProgressBar,
  Spinner,
  Tooltip,
} from "@/components/ui";
import { InteractiveModelCanvas } from "./InteractiveModelCanvas";
import {
  CAMERA_PRESETS,
  DEFAULT_FOV_DEG,
  MAX_FOV_DEG,
  MIN_FOV_DEG,
  type CameraPreset,
  type InteractionMode,
  type RenderMode,
  type RuntimeMeshMetadata,
} from "./viewerTypes";

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
  cancelling?: boolean;
  successNotice?: string | null;
  onAutoRotateChange: (enabled: boolean) => void;
  onOpenArDialog: () => void;
  onOpenExportDialog: () => void;
  onLoadSample: () => void;
  onRetry: () => void;
  retryLabel?: string;
  onCancelJob: () => void;
  onTriggerUpload: () => void;
}

export function ModelViewport({
  stage,
  model,
  uploadedImage,
  jobStatus,
  error,
  autoRotate,
  cancelling = false,
  successNotice = null,
  onAutoRotateChange,
  onOpenArDialog,
  onOpenExportDialog,
  onLoadSample,
  onRetry,
  retryLabel = "Retry Generation",
  onCancelJob,
  onTriggerUpload,
}: ModelViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [interactionMode, setInteractionMode] = useState<InteractionMode>("orbit");
  const [renderMode, setRenderMode] = useState<RenderMode>("textured");
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("perspective");
  const [presetVersion, setPresetVersion] = useState(0);
  const [fov, setFov] = useState(DEFAULT_FOV_DEG);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [runtimeStats, setRuntimeStats] = useState<RuntimeMeshMetadata | null>(
    null
  );

  // Reset per-model camera & inspected runtime stats cleanly on model switch
  useEffect(() => {
    setRuntimeStats(null);
    setCameraPreset("perspective");
    setFov(DEFAULT_FOV_DEG);
    setPresetVersion((v) => v + 1);
  }, [model?.id, model?.glb_url]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const handleZoomIn = useCallback(() => {
    setFov((prev) => Math.max(MIN_FOV_DEG, prev - 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setFov((prev) => Math.min(MAX_FOV_DEG, prev + 5));
  }, []);

  const handleSelectPreset = useCallback((preset: CameraPreset) => {
    setCameraPreset(preset);
    setPresetVersion((v) => v + 1);
  }, []);

  const handleResetView = useCallback(() => {
    setFov(DEFAULT_FOV_DEG);
    setCameraPreset("perspective");
    setInteractionMode("orbit");
    setPresetVersion((v) => v + 1);
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

  const handleMetadataLoaded = useCallback((stats: RuntimeMeshMetadata) => {
    setRuntimeStats((prev) => ({
      vertices: stats.vertices ?? prev?.vertices,
      triangles: stats.triangles ?? prev?.triangles,
      dimensions: stats.dimensions ?? prev?.dimensions,
      materialCount: stats.materialCount ?? prev?.materialCount,
      hasTextures: stats.hasTextures ?? prev?.hasTextures,
    }));
  }, []);

  const hasModel = stage === "result" && Boolean(model);
  const appearanceLabel = formatAppearanceLabel(model?.appearance);
  const triangles = model?.triangles ?? runtimeStats?.triangles;
  const vertices = model?.vertices ?? runtimeStats?.vertices;
  const extents = model?.bounds_extent ?? runtimeStats?.dimensions;

  return (
    <section
      ref={containerRef}
      aria-label="3D model viewport"
      className="relative flex flex-col justify-between overflow-hidden rounded-[16px] border border-border-subtle bg-[#131315] min-h-[460px] md:min-h-[540px] lg:min-h-[600px]"
    >
      {/* Controlled warm floor wash — restrained studio lighting */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(54% 40% at 50% 68%, rgba(247, 148, 72, 0.08) 0%, rgba(25, 25, 27, 0.22) 55%, transparent 100%)",
        }}
      />

      {/* Top Overlay Bar: Status badges + Textured/Wireframe Segmented Control */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          {hasModel && model && (
            <Badge tone={model.is_sample ? "copper" : "success"} dot>
              {model.is_sample ? "Sample 3D Model (Demo Preview)" : "Generated GLB"}
            </Badge>
          )}
          {hasModel && appearanceLabel && (
            <Badge tone="neutral">{appearanceLabel}</Badge>
          )}
        </div>

        {hasModel && model ? (
          <div
            role="group"
            aria-label="Shading mode"
            className="v3d-glass inline-flex shrink-0 items-center rounded-[10px] border border-border-subtle p-0.5"
          >
            <button
              type="button"
              aria-pressed={renderMode === "textured"}
              onClick={() => setRenderMode("textured")}
              className={`min-h-[32px] rounded-[8px] px-3 py-1 text-xs font-medium transition-colors ${
                renderMode === "textured"
                  ? "bg-ink-primary text-ink-on-copper shadow-xs"
                  : "text-ink-secondary hover:text-ink-primary"
              }`}
            >
              Textured
            </button>
            <button
              type="button"
              aria-pressed={renderMode === "wireframe"}
              onClick={() => setRenderMode("wireframe")}
              className={`min-h-[32px] rounded-[8px] px-3 py-1 text-xs font-medium transition-colors ${
                renderMode === "wireframe"
                  ? "bg-ink-primary text-ink-on-copper shadow-xs"
                  : "text-ink-secondary hover:text-ink-primary"
              }`}
            >
              Wireframe
            </button>
          </div>
        ) : null}
      </div>

      {/* Optional Generation Success Status Banner */}
      {hasModel && successNotice && model ? (
        <div
          role="status"
          aria-live="polite"
          className="relative z-10 mx-4 mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs text-emerald-300 sm:mx-5"
        >
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>{successNotice}</span>
          </span>
          <Link
            href={
              model.is_sample
                ? "/models/sample"
                : `/models/${encodeURIComponent(model.id)}`
            }
            className="font-medium text-ink-primary underline underline-offset-2 hover:text-copper"
          >
            View Details
          </Link>
        </div>
      ) : null}

      {/* Central Stage */}
      <div className="relative z-0 flex flex-1 items-center justify-center pl-[74px] pr-4 py-4 sm:px-16">
        {/* Left Vertical Floating Glass Toolbar */}
        <div
          role="toolbar"
          aria-label="Viewport camera controls"
          data-result={hasModel ? "true" : undefined}
          className="v3d-glass absolute left-3.5 top-12 data-[result=true]:top-3 z-20 flex flex-col gap-1 rounded-[12px] border border-border-subtle p-1"
        >
          <Tooltip content="Orbit camera (drag to rotate 360°)">
            {(tip) => (
              <Button
                variant="icon"
                size="md"
                active={interactionMode === "orbit" && hasModel}
                disabled={!hasModel}
                aria-pressed={interactionMode === "orbit"}
                aria-label="Orbit camera mode"
                onClick={() => setInteractionMode("orbit")}
                {...tip}
              >
                <Orbit className="h-[17px] w-[17px]" strokeWidth={1.75} />
              </Button>
            )}
          </Tooltip>

          <Tooltip content="Pan camera (drag to move target)">
            {(tip) => (
              <Button
                variant="icon"
                size="md"
                active={interactionMode === "pan" && hasModel}
                disabled={!hasModel}
                aria-pressed={interactionMode === "pan"}
                aria-label="Pan camera mode"
                onClick={() => setInteractionMode("pan")}
                {...tip}
              >
                <Hand className="h-[17px] w-[17px]" strokeWidth={1.75} />
              </Button>
            )}
          </Tooltip>

          <Tooltip content="Zoom in">
            {(tip) => (
              <Button
                variant="icon"
                size="md"
                disabled={!hasModel}
                aria-label="Zoom in"
                onClick={handleZoomIn}
                {...tip}
              >
                <ZoomIn className="h-[17px] w-[17px]" strokeWidth={1.75} />
              </Button>
            )}
          </Tooltip>

          <Tooltip content="Zoom out">
            {(tip) => (
              <Button
                variant="icon"
                size="md"
                disabled={!hasModel}
                aria-label="Zoom out"
                onClick={handleZoomOut}
                {...tip}
              >
                <ZoomOut className="h-[17px] w-[17px]" strokeWidth={1.75} />
              </Button>
            )}
          </Tooltip>

          <Tooltip content="Reset camera view">
            {(tip) => (
              <Button
                variant="icon"
                size="md"
                disabled={!hasModel}
                aria-label="Reset camera view"
                onClick={handleResetView}
                {...tip}
              >
                <Box className="h-[17px] w-[17px]" strokeWidth={1.75} />
              </Button>
            )}
          </Tooltip>

          <Tooltip content={isFullscreen ? "Exit fullscreen" : "Fullscreen viewport"}>
            {(tip) => (
              <Button
                variant="icon"
                size="md"
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                onClick={handleToggleFullscreen}
                {...tip}
              >
                {isFullscreen ? (
                  <Minimize2 className="h-[17px] w-[17px]" strokeWidth={1.75} />
                ) : (
                  <Maximize2 className="h-[17px] w-[17px]" strokeWidth={1.75} />
                )}
              </Button>
            )}
          </Tooltip>
        </div>

        {stage === "empty" && (
          <div className="flex max-w-md flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[12px] border border-border-subtle bg-panel">
              <Box className="h-7 w-7 text-copper" strokeWidth={1.5} />
            </div>
            <h2 className="text-base font-semibold text-ink-primary">
              Ready for your 2D image
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-ink-secondary">
              Upload a JPEG, PNG, or WebP photo of a single foreground object to
              generate an interactive 360° GLB model and mobile AR preview.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              <Button variant="primary" size="md" onClick={onTriggerUpload}>
                <Upload className="h-4 w-4" />
                Upload Image
              </Button>
              <Button variant="secondary" size="md" onClick={onLoadSample}>
                <Box className="h-4 w-4 text-copper" />
                Load Sample 3D Model
              </Button>
            </div>
            <p className="mt-3 text-[11px] text-ink-muted">
              Sample model is a local demo GLB for inspecting the 3D viewer and AR flow.
            </p>
          </div>
        )}

        {stage === "uploaded" && uploadedImage && (
          <div className="flex max-w-md flex-col items-center text-center">
            <div className="relative overflow-hidden rounded-[12px] border border-border-subtle bg-panel p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={uploadedImage.previewUrl}
                alt="Uploaded source image ready for 3D generation"
                className="max-h-[260px] max-w-full rounded-[8px] object-contain"
              />
            </div>
            <p className="mt-3.5 text-xs sm:text-sm font-medium text-ink-primary">
              Source image validated ({uploadedImage.width} × {uploadedImage.height}px ·{" "}
              {formatBytes(uploadedImage.sizeBytes)})
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
              Confirm external processing consent and click{" "}
              <span className="font-medium text-copper">Generate 3D</span> to start.
            </p>
          </div>
        )}

        {stage === "processing" && (
          <div
            role="status"
            aria-live="polite"
            className="flex w-full max-w-sm flex-col items-center text-center"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[12px] border border-copper/30 bg-copper/10">
              <Spinner size="md" label="Generating 3D model" />
            </div>
            <h2 className="text-sm font-semibold text-ink-primary">
              {jobStatus?.status === "queued"
                ? "Queued for 3D generation"
                : jobStatus
                ? "Generating 3D mesh"
                : "Preparing generation"}
            </h2>
            <p className="mt-1 text-xs text-ink-secondary">
              {jobStageLabel(jobStatus?.stage) ?? "Waiting for the backend…"}
            </p>
            <ProgressBar
              id="v3d-job-progress"
              label="3D generation progress"
              value={null}
              className="mt-4"
            />
            <p className="mt-2 text-[11px] text-ink-muted">
              Progress is reported by stage.
            </p>
            {jobStatus?.job_id &&
            (jobStatus.status === "queued" || jobStatus.status === "processing") ? (
              <Button
                variant="secondary"
                size="sm"
                loading={cancelling}
                onClick={onCancelJob}
                className="mt-4"
              >
                <XCircle className="h-3.5 w-3.5 text-ink-secondary" />
                Cancel Job
              </Button>
            ) : null}
          </div>
        )}

        {stage === "error" && error && (
          <ErrorState
            code={error.code}
            title="3D generation did not complete"
            message={error.message}
            actions={
              <>
                <Button variant="primary" size="md" onClick={onRetry}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  {retryLabel}
                </Button>
                <Button variant="secondary" size="md" onClick={onLoadSample}>
                  Inspect Sample 3D Model
                </Button>
              </>
            }
          />
        )}

        {hasModel && model && (
          <div className="relative h-[340px] w-full sm:h-[410px] lg:h-[448px]">
            <InteractiveModelCanvas
              modelKey={model.id}
              src={model.glb_url}
              iosSrc={model.usdz_url}
              alt={`Interactive 3D model: ${model.name}`}
              renderMode={renderMode}
              interactionMode={interactionMode}
              cameraPreset={cameraPreset}
              presetVersion={presetVersion}
              fov={fov}
              autoRotate={autoRotate}
              onMetadataLoaded={handleMetadataLoaded}
              onRenderModeFallback={() => setRenderMode("textured")}
            />

            {interactionMode === "pan" && (
              <div className="v3d-glass pointer-events-none absolute top-2 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-[8px] border border-border-subtle px-3 py-1 text-[11px] text-ink-secondary">
                Pan active · Drag to move camera target
              </div>
            )}
          </div>
        )}
      </div>

      {/* Camera Presets + Real Model Metadata Strip */}
      {hasModel && model ? (
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle/60 bg-obsidian/45 px-4 py-2 sm:px-5">
          <div
            role="group"
            aria-label="Camera angle presets"
            className="flex max-w-full items-center gap-1 overflow-x-auto"
          >
            {CAMERA_PRESETS.map((preset) => {
              const active = cameraPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`min-h-[36px] sm:min-h-[30px] shrink-0 rounded-[7px] px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? "border border-copper/50 bg-copper/16 text-copper"
                      : "border border-transparent text-ink-secondary hover:bg-raised/80 hover:text-ink-primary"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div
            aria-label="Model geometry metadata"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-ink-muted"
          >
            {typeof triangles === "number" ? (
              <span>{triangles.toLocaleString()} tris</span>
            ) : null}
            {typeof vertices === "number" ? (
              <span>{vertices.toLocaleString()} verts</span>
            ) : null}
            {extents ? (
              <span title="Bounding box dimensions in model units">
                {extents.map((n) => n.toFixed(2)).join(" × ")} u
              </span>
            ) : null}
            {model.byte_size ? <span>{formatBytes(model.byte_size)}</span> : null}
          </div>
        </div>
      ) : null}

      {/* Bottom Viewport Controls Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2.5 px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="v3d-glass inline-flex min-h-[42px] items-center gap-2.5 rounded-[10px] border border-border-subtle px-3 py-1.5">
            <Play className="h-3.5 w-3.5 text-ink-secondary" strokeWidth={1.75} />
            <CopperSwitch
              id="viewport-auto-rotate"
              label="Auto Rotate"
              labelClassName="text-xs font-medium text-ink-primary"
              checked={autoRotate}
              disabled={!hasModel}
              onCheckedChange={onAutoRotateChange}
            />
          </div>

          <Button
            variant="secondary"
            size="md"
            disabled={!hasModel}
            onClick={handleResetView}
            title="Reset 360° camera angle"
            className="v3d-glass"
          >
            360°
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="md"
            disabled={!hasModel}
            onClick={onOpenArDialog}
            className="v3d-glass hover:border-copper/50"
          >
            <Smartphone className="h-4 w-4 text-ink-secondary" strokeWidth={1.75} />
            <span>View in AR</span>
          </Button>

          <Button
            variant="secondary"
            size="md"
            disabled={!hasModel}
            onClick={onOpenExportDialog}
            className="v3d-glass hover:border-copper/50"
          >
            <Download className="h-4 w-4 text-ink-secondary" strokeWidth={1.75} />
            <span>Download</span>
            <ChevronDown className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.75} />
          </Button>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  ChevronDown,
  Columns2,
  Download,
  Grid3x3,
  Hand,
  Maximize2,
  Minimize2,
  Orbit,
  Play,
  RefreshCw,
  Smartphone,
  SunMedium,
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
import { friendlyError } from "@/lib/errorCopy";
import { ElapsedTime } from "./ElapsedTime";
import { InteractiveModelCanvas } from "./InteractiveModelCanvas";
import {
  CAMERA_PRESETS,
  DEFAULT_FOV_DEG,
  DEFAULT_VIEWER_ENVIRONMENT,
  LIGHTING_PRESETS,
  MAX_FOV_DEG,
  MIN_FOV_DEG,
  type CameraPreset,
  type InteractionMode,
  type LightingPreset,
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
  reviewedCutoutUrl?: string;
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

const RENDER_MODES: readonly { id: RenderMode; label: string }[] = [
  { id: "textured", label: "Textured" },
  { id: "geometry", label: "Geometry" },
  { id: "wireframe", label: "Wireframe" },
];

export function ModelViewport({
  stage,
  model,
  uploadedImage,
  reviewedCutoutUrl,
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

  const [interactionMode, setInteractionMode] =
    useState<InteractionMode>("orbit");
  const [renderMode, setRenderMode] = useState<RenderMode>("textured");
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("perspective");
  const [presetVersion, setPresetVersion] = useState(0);
  const [fov, setFov] = useState(DEFAULT_FOV_DEG);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareSourceView, setCompareSourceView] = useState<
    "original" | "cutout"
  >("original");
  const [lightingOpen, setLightingOpen] = useState(false);
  const [showGrid, setShowGrid] = useState(DEFAULT_VIEWER_ENVIRONMENT.showGrid);
  const [lightingPreset, setLightingPreset] = useState<LightingPreset>(
    DEFAULT_VIEWER_ENVIRONMENT.lightingPreset
  );
  const [exposure, setExposure] = useState(DEFAULT_VIEWER_ENVIRONMENT.exposure);
  const [shadows, setShadows] = useState(DEFAULT_VIEWER_ENVIRONMENT.shadows);
  const [runtimeStats, setRuntimeStats] = useState<RuntimeMeshMetadata | null>(
    null
  );

  // Reset per-model camera & inspected runtime stats cleanly on model switch
  useEffect(() => {
    setRuntimeStats(null);
    setCameraPreset("perspective");
    setFov(DEFAULT_FOV_DEG);
    setCompareOpen(false);
    setCompareSourceView("original");
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

  const handleResetLighting = useCallback(() => {
    setLightingPreset(DEFAULT_VIEWER_ENVIRONMENT.lightingPreset);
    setExposure(DEFAULT_VIEWER_ENVIRONMENT.exposure);
    setShadows(DEFAULT_VIEWER_ENVIRONMENT.shadows);
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
  const canCompare = Boolean(
    hasModel && model && !model.is_sample && uploadedImage
  );
  const activeCompareView =
    compareSourceView === "cutout" && reviewedCutoutUrl ? "cutout" : "original";
  const appearanceLabel = formatAppearanceLabel(model?.appearance);
  const triangles = model?.triangles ?? runtimeStats?.triangles;
  const vertices = model?.vertices ?? runtimeStats?.vertices;
  const extents = model?.bounds_extent ?? runtimeStats?.dimensions;

  const floorWashOpacity =
    lightingPreset === "soft" ? 0.05 : lightingPreset === "contrast" ? 0.1 : 0.08;

  return (
    <section
      ref={containerRef}
      aria-label="3D model viewport"
      className="relative flex flex-col justify-between overflow-hidden rounded-[16px] border border-border-subtle bg-[#131315] min-h-[430px] md:min-h-[556px] lg:min-h-[624px]"
    >
      {/* Controlled warm floor wash — restrained studio lighting */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(54% 40% at 50% 68%, rgba(247, 148, 72, ${floorWashOpacity}) 0%, rgba(25, 25, 27, 0.22) 55%, transparent 100%)`,
        }}
      />

      {/* Top Overlay Bar: Compact Status + Before/After Compare + Textured/Geometry/Wireframe Segmented Control */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-1.5">
          {hasModel && model && (
            <Badge tone={model.is_sample ? "copper" : "success"} dot>
              {model.is_sample
                ? "Sample 3D Model (Demo Preview)"
                : "Generated GLB"}
            </Badge>
          )}
          {hasModel && appearanceLabel && (
            <Badge tone="neutral">{appearanceLabel}</Badge>
          )}

          {/* Compact inline generation success status (replaces full-width green banner) */}
          {hasModel && successNotice && model ? (
            <div
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-2 rounded-[8px] border border-border-subtle bg-obsidian/85 px-2.5 py-1 text-[11px] text-ink-secondary"
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"
              />
              <span className="text-ink-primary">{successNotice}</span>
              <Link
                href={
                  model.is_sample
                    ? "/models/sample"
                    : `/models/${encodeURIComponent(model.id)}`
                }
                className="font-medium text-copper underline underline-offset-2 hover:text-copper-hover"
              >
                Details
              </Link>
            </div>
          ) : null}
        </div>

        {hasModel && model ? (
          <div className="flex flex-wrap items-center gap-2">
            {canCompare ? (
              <button
                type="button"
                aria-pressed={compareOpen}
                onClick={() => setCompareOpen((prev) => !prev)}
                className={`v3d-glass inline-flex min-h-[38px] items-center gap-1.5 rounded-[10px] border px-3 py-1 text-xs font-medium transition-colors ${
                  compareOpen
                    ? "border-copper/60 bg-copper/15 text-copper"
                    : "border-border-subtle text-ink-secondary hover:border-border-strong hover:text-ink-primary"
                }`}
              >
                <Columns2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>Compare</span>
              </button>
            ) : null}

            <div
              role="group"
              aria-label="Shading mode"
              className="v3d-glass inline-flex shrink-0 items-center rounded-[10px] border border-border-subtle p-0.5"
            >
              {RENDER_MODES.map((item) => {
                const active = renderMode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setRenderMode(item.id)}
                    className={`min-h-[36px] rounded-[8px] px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? "bg-ink-primary text-ink-on-copper shadow-xs"
                        : "text-ink-secondary hover:text-ink-primary"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* Central Stage — balanced clearance keeps 3D model centered on desktop and clear of toolbar on mobile */}
      <div
        className={`relative z-0 flex flex-1 items-center justify-center min-h-[320px] sm:min-h-[380px] ${
          hasModel
            ? compareOpen && canCompare
              ? "pl-16 pr-3 py-3 sm:pl-[68px] sm:pr-5"
              : "pl-15 pr-2 py-2 sm:px-14"
            : "pl-16 pr-4 py-4 sm:px-16"
        }`}
      >
        {/* Left Vertical Floating Glass Toolbar */}
        <div
          role="toolbar"
          aria-label="Viewport camera controls"
          data-result={hasModel ? "true" : undefined}
          className="v3d-glass absolute left-3 top-3 z-20 flex flex-col gap-1 rounded-[12px] border border-border-subtle p-1"
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

          <Tooltip
            content={isFullscreen ? "Exit fullscreen" : "Fullscreen viewport"}
          >
            {(tip) => (
              <Button
                variant="icon"
                size="md"
                aria-label={
                  isFullscreen ? "Exit fullscreen" : "Enter fullscreen"
                }
                onClick={() => void handleToggleFullscreen()}
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
              Sample model is a local demo GLB for inspecting the 3D viewer and
              AR flow.
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
              Source image validated ({uploadedImage.width} ×{" "}
              {uploadedImage.height}px · {formatBytes(uploadedImage.sizeBytes)})
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
              Review generation settings and click{" "}
              <span className="font-medium text-copper">Generate 3D</span> to
              start.
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
            <ElapsedTime
              key={jobStatus?.job_id ?? "pending"}
              since={jobStatus?.created_at}
            />
            {jobStatus?.job_id &&
            (jobStatus.status === "queued" ||
              jobStatus.status === "processing") ? (
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
            title={friendlyError(error).title}
            message={friendlyError(error).message}
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
          <div
            className={`w-full ${
              compareOpen && canCompare
                ? "grid grid-cols-1 gap-3 lg:grid-cols-2"
                : ""
            }`}
          >
            {/* Before · Source 2D Panel (mounted alongside 3D without remounting canvas) */}
            {compareOpen && canCompare && uploadedImage ? (
              <div
                aria-label="Source image comparison panel"
                className="flex flex-col justify-between overflow-hidden rounded-[12px] border border-border-subtle bg-panel/90 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-ink-secondary">
                    Before · Source 2D
                  </span>
                  <div className="flex items-center gap-1.5">
                    {reviewedCutoutUrl ? (
                      <div
                        role="group"
                        aria-label="Source comparison layer"
                        className="inline-flex rounded-[7px] border border-border-subtle bg-obsidian p-0.5"
                      >
                        <button
                          type="button"
                          aria-pressed={activeCompareView === "original"}
                          onClick={() => setCompareSourceView("original")}
                          className={`min-h-[28px] rounded-[5px] px-2 text-[11px] font-medium ${
                            activeCompareView === "original"
                              ? "bg-raised text-ink-primary"
                              : "text-ink-secondary hover:text-ink-primary"
                          }`}
                        >
                          Photo
                        </button>
                        <button
                          type="button"
                          aria-pressed={activeCompareView === "cutout"}
                          onClick={() => setCompareSourceView("cutout")}
                          className={`min-h-[28px] rounded-[5px] px-2 text-[11px] font-medium ${
                            activeCompareView === "cutout"
                              ? "bg-raised text-ink-primary"
                              : "text-ink-secondary hover:text-ink-primary"
                          }`}
                        >
                          Cutout
                        </button>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleSelectPreset("front")}
                      className="min-h-[28px] rounded-[7px] border border-border-subtle bg-raised px-2.5 py-0.5 text-[11px] font-medium text-ink-primary transition-colors hover:border-copper/50 hover:text-copper"
                    >
                      Align 3D Front
                    </button>
                  </div>
                </div>

                <div
                  className="flex h-[220px] sm:h-[340px] lg:h-[420px] items-center justify-center overflow-hidden rounded-[8px] border border-border-subtle bg-obsidian p-2"
                  style={
                    activeCompareView === "cutout"
                      ? {
                          backgroundImage:
                            "repeating-conic-gradient(#1b1b1e 0% 25%, #121214 0% 50%)",
                          backgroundSize: "14px 14px",
                        }
                      : undefined
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      activeCompareView === "cutout" && reviewedCutoutUrl
                        ? reviewedCutoutUrl
                        : uploadedImage.previewUrl
                    }
                    alt="Source input photo for 2D to 3D comparison"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>

                <p className="pt-2 font-mono text-[11px] text-ink-muted">
                  {uploadedImage.file.name} · {uploadedImage.width} ×{" "}
                  {uploadedImage.height}px
                </p>
              </div>
            ) : null}

            {/* Live Interactive 3D Stage (kept in stable tree branch so toggling Compare never re-fetches GLB) */}
            <div
              className={
                compareOpen && canCompare
                  ? "flex flex-col justify-between rounded-[12px] border border-border-subtle bg-obsidian/55 p-3"
                  : "relative h-[332px] w-full sm:h-[456px] lg:h-[504px]"
              }
            >
              {compareOpen && canCompare ? (
                <div className="flex items-center justify-between gap-2 pb-2">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-copper">
                    After · 3D Model ({renderMode})
                  </span>
                  <span className="text-[11px] text-ink-muted">
                    Drag to orbit · Scroll to zoom
                  </span>
                </div>
              ) : null}

              <div
                className={
                  compareOpen && canCompare
                    ? "relative h-[240px] w-full sm:h-[340px] lg:h-[420px]"
                    : "relative h-full w-full"
                }
              >
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
                  showFloorRing={!compareOpen}
                  showGrid={showGrid}
                  lightingPreset={lightingPreset}
                  exposure={exposure}
                  shadows={shadows}
                  onMetadataLoaded={handleMetadataLoaded}
                  onRenderModeFallback={() => setRenderMode("textured")}
                />

                {interactionMode === "pan" && (
                  <div className="v3d-glass pointer-events-none absolute top-2 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-[8px] border border-border-subtle px-3 py-1 text-[11px] text-ink-secondary">
                    Pan active · Drag to move camera target
                  </div>
                )}
              </div>

              {compareOpen && canCompare ? (
                <p className="pt-2 font-mono text-[11px] text-ink-muted">
                  Camera: {cameraPreset}
                  {typeof triangles === "number"
                    ? ` · ${triangles.toLocaleString()} tris`
                    : ""}
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Camera Presets + Real Model Metadata Strip */}
      {hasModel && model ? (
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle/60 bg-obsidian/45 px-4 py-2 sm:px-5">
          <div
            role="group"
            aria-label="Camera angle presets"
            className="flex flex-wrap items-center gap-1"
          >
            {CAMERA_PRESETS.map((preset) => {
              const active = cameraPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`min-h-[36px] sm:min-h-[30px] shrink-0 rounded-[7px] px-2 py-1 text-[11px] font-medium transition-colors ${
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

      {/* Expandable Studio Lighting Controls Strip */}
      {hasModel && lightingOpen ? (
        <div
          role="region"
          aria-label="Viewer lighting settings"
          className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle/60 bg-panel/95 px-4 py-2.5 sm:px-5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-ink-secondary">
              Lighting
            </span>
            <div
              role="group"
              aria-label="Lighting preset"
              className="inline-flex rounded-[8px] border border-border-subtle bg-obsidian p-0.5"
            >
              {LIGHTING_PRESETS.map((preset) => {
                const active = lightingPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={active}
                    title={preset.description}
                    onClick={() => setLightingPreset(preset.id)}
                    className={`min-h-[32px] rounded-[6px] px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      active
                        ? "bg-raised text-copper"
                        : "text-ink-secondary hover:text-ink-primary"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label
                htmlFor="viewport-exposure"
                className="text-[11px] font-medium text-ink-secondary"
              >
                Exposure
              </label>
              <input
                id="viewport-exposure"
                type="range"
                min="0.65"
                max="1.45"
                step="0.05"
                value={exposure}
                onChange={(e) => setExposure(e.currentTarget.valueAsNumber)}
                className="h-8 w-24 accent-copper"
              />
              <span className="w-9 font-mono text-[11px] text-ink-muted">
                {exposure.toFixed(2)}×
              </span>
            </div>

            <CopperSwitch
              id="viewport-shadows"
              label="Shadows"
              labelClassName="text-[11px] font-medium text-ink-primary"
              checked={shadows}
              onCheckedChange={setShadows}
            />

            <button
              type="button"
              onClick={handleResetLighting}
              className="min-h-[32px] rounded-[7px] px-2 text-[11px] font-medium text-ink-secondary hover:bg-raised hover:text-ink-primary"
            >
              Reset
            </button>
          </div>
        </div>
      ) : null}

      {/* Bottom Viewport Controls Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2.5 px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="v3d-glass inline-flex min-h-[42px] items-center gap-2.5 rounded-[10px] border border-border-subtle px-3 py-1.5">
            <Play
              className="h-3.5 w-3.5 text-ink-secondary"
              strokeWidth={1.75}
            />
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

          <Button
            variant="secondary"
            size="md"
            disabled={!hasModel}
            aria-pressed={showGrid}
            aria-label="Ground grid"
            onClick={() => setShowGrid((prev) => !prev)}
            className={`v3d-glass ${
              showGrid && hasModel ? "border-copper/60 text-copper" : ""
            }`}
          >
            <Grid3x3 className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>Grid</span>
          </Button>

          <Button
            variant="secondary"
            size="md"
            disabled={!hasModel}
            aria-expanded={lightingOpen && hasModel}
            aria-label="Lighting controls"
            onClick={() => setLightingOpen((prev) => !prev)}
            className={`v3d-glass ${
              lightingOpen && hasModel ? "border-copper/60 text-copper" : ""
            }`}
          >
            <SunMedium className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>Lighting</span>
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
            <Smartphone
              className="h-4 w-4 text-ink-secondary"
              strokeWidth={1.75}
            />
            <span>View in AR</span>
          </Button>

          <Button
            variant="secondary"
            size="md"
            disabled={!hasModel}
            onClick={onOpenExportDialog}
            className="v3d-glass hover:border-copper/50"
          >
            <Download
              className="h-4 w-4 text-ink-secondary"
              strokeWidth={1.75}
            />
            <span>Download</span>
            <ChevronDown
              className="h-3.5 w-3.5 text-ink-muted"
              strokeWidth={1.75}
            />
          </Button>
        </div>
      </div>
    </section>
  );
}

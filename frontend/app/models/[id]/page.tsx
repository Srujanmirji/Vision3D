"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Box,
  Download,
  ExternalLink,
  Grid3x3,
  Hand,
  Maximize2,
  Minimize2,
  Orbit,
  Play,
  Smartphone,
  SunMedium,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { AppShell } from "@/components/sidebar/AppShell";
import { QrArDialog } from "@/components/ar-dialog/QrArDialog";
import { ExportDialog } from "@/components/export-dialog/ExportDialog";
import { InteractiveModelCanvas } from "@/components/viewer/InteractiveModelCanvas";
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
} from "@/components/viewer/viewerTypes";
import {
  AlertBanner,
  Badge,
  Button,
  CopperSwitch,
  Dialog,
  ErrorState,
  Spinner,
  Tooltip,
} from "@/components/ui";
import {
  checkHealth,
  deleteModel,
  formatAppearanceLabel,
  formatUserError,
  getModel,
  type ApiErrorPayload,
  type ModelAsset,
} from "@/lib/api";
import { loadViewerPreferences } from "@/lib/preferences";
import { SAMPLE_MODEL } from "@/lib/sample";
import { formatBytes } from "@/lib/validation";

interface ModelDetailPageProps {
  params: Promise<{ id: string }>;
}

const RENDER_MODES: readonly { id: RenderMode; label: string }[] = [
  { id: "textured", label: "Textured" },
  { id: "geometry", label: "Geometry" },
  { id: "wireframe", label: "Wireframe" },
];

export default function ModelDetailPage({ params }: ModelDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const stageRef = useRef<HTMLElement>(null);

  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [model, setModel] = useState<ModelAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorPayload | null>(null);

  const [renderMode, setRenderMode] = useState<RenderMode>("textured");
  const [interactionMode, setInteractionMode] =
    useState<InteractionMode>("orbit");
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("perspective");
  const [presetVersion, setPresetVersion] = useState(0);
  const [fov, setFov] = useState(DEFAULT_FOV_DEG);
  const [autoRotate, setAutoRotate] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
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

  const [arOpen, setArOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setAutoRotate(loadViewerPreferences().defaultAutoRotate);
  }, []);

  useEffect(() => {
    const onFsChange = () =>
      setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const loadModel = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRuntimeStats(null);
    setCameraPreset("perspective");
    setFov(DEFAULT_FOV_DEG);
    setPresetVersion((v) => v + 1);

    checkHealth()
      .then(() => setBackendOnline(true))
      .catch(() => setBackendOnline(false));

    if (id === "sample" || id === SAMPLE_MODEL.id) {
      setModel(SAMPLE_MODEL);
      setLoading(false);
      return;
    }

    try {
      const data = await getModel(id);
      setModel(data);
    } catch (err) {
      setError(formatUserError(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadModel();
  }, [loadModel]);

  const handleConfirmDelete = async () => {
    if (!model || model.is_sample) return;
    setDeleting(true);
    try {
      await deleteModel(model.id);
      setDeleteOpen(false);
      router.push("/models");
    } catch (err) {
      setError(formatUserError(err));
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleFullscreen = async () => {
    const el = stageRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) await el.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      // Ignore fullscreen rejection
    }
  };

  const handleResetView = () => {
    setFov(DEFAULT_FOV_DEG);
    setCameraPreset("perspective");
    setInteractionMode("orbit");
    setPresetVersion((v) => v + 1);
  };

  const handleMetadataLoaded = useCallback((stats: RuntimeMeshMetadata) => {
    setRuntimeStats((prev) => ({
      vertices: stats.vertices ?? prev?.vertices,
      triangles: stats.triangles ?? prev?.triangles,
      dimensions: stats.dimensions ?? prev?.dimensions,
      materialCount: stats.materialCount ?? prev?.materialCount,
      hasTextures: stats.hasTextures ?? prev?.hasTextures,
    }));
  }, []);

  const appearanceLabel = formatAppearanceLabel(model?.appearance);
  const triangles = model?.triangles ?? runtimeStats?.triangles;
  const vertices = model?.vertices ?? runtimeStats?.vertices;
  const extents = model?.bounds_extent ?? runtimeStats?.dimensions;

  return (
    <AppShell backendOnline={backendOnline}>
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-7 lg:py-6">
        {/* Top Breadcrumb & Actions */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/models"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-[10px] border border-border-subtle bg-raised text-ink-secondary transition-colors hover:border-border-strong hover:text-ink-primary"
              aria-label="Back to My Models"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="break-words text-lg font-semibold tracking-tight text-ink-primary sm:text-2xl">
                  {model ? model.name : "Model Details"}
                </h1>
                {model ? (
                  <Badge tone={model.is_sample ? "copper" : "success"} dot>
                    {model.is_sample ? "Sample 3D Model" : "Generated GLB"}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-ink-secondary">
                Inspect geometry metadata, switch shading or camera views,
                export GLB, or launch mobile AR.
              </p>
            </div>
          </div>

          {model ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={
                  model.is_sample
                    ? "/create?sample=1"
                    : `/create?model=${encodeURIComponent(model.id)}`
                }
                className="inline-flex min-h-[40px] items-center gap-2 rounded-[10px] border border-border-subtle bg-raised px-3.5 py-2 text-xs font-medium text-ink-primary transition-colors hover:border-copper/50"
              >
                <ExternalLink className="h-3.5 w-3.5 text-copper" />
                Open in Studio
              </Link>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setArOpen(true)}
              >
                <Smartphone className="h-4 w-4 text-ink-secondary" />
                View in AR
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={() => setExportOpen(true)}
              >
                <Download className="h-4 w-4" />
                Export GLB
              </Button>
            </div>
          ) : null}
        </header>

        {loading && (
          <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-[16px] border border-border-subtle bg-panel p-8">
            <Spinner size="lg" label="Loading model details" />
            <p className="text-xs text-ink-secondary">
              Loading 3D model metadata…
            </p>
          </div>
        )}

        {!loading && error && (
          <div className="flex min-h-[420px] items-center justify-center rounded-[16px] border border-border-subtle bg-panel p-6">
            <ErrorState
              code={error.code}
              title="Could not load model details"
              message={error.message}
              actions={
                <>
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => void loadModel()}
                  >
                    Retry
                  </Button>
                  <Link
                    href="/models"
                    className="inline-flex min-h-[42px] items-center rounded-[10px] border border-border-subtle bg-raised px-4 py-2 text-xs font-medium text-ink-primary hover:border-border-strong"
                  >
                    Back to My Models
                  </Link>
                </>
              }
            />
          </div>
        )}

        {!loading && !error && model && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_348px]">
            {/* Dominant Interactive 3D Viewport */}
            <section
              ref={stageRef}
              aria-label="3D model preview"
              className="relative flex min-h-[460px] lg:min-h-[600px] flex-col justify-between overflow-hidden rounded-[16px] border border-border-subtle bg-[#131315]"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(54% 40% at 50% 68%, rgba(247, 148, 72, 0.08) 0%, transparent 72%)",
                }}
              />

              {/* Top Bar: Badges + Textured/Geometry/Wireframe Toggle */}
              <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  {appearanceLabel ? (
                    <Badge tone="neutral">{appearanceLabel}</Badge>
                  ) : null}
                  {model.byte_size ? (
                    <Badge tone="neutral">
                      GLB · {formatBytes(model.byte_size)}
                    </Badge>
                  ) : null}
                </div>

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
                        className={`min-h-[38px] rounded-[8px] px-3 py-1 text-xs font-medium transition-colors ${
                          active
                            ? "bg-ink-primary text-ink-on-copper"
                            : "text-ink-secondary hover:text-ink-primary"
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Central Canvas + Floating Toolbar */}
              <div className="relative z-0 flex flex-1 items-center justify-center pl-15 pr-2 py-2 sm:px-14">
                <div
                  role="toolbar"
                  aria-label="Model detail camera controls"
                  className="v3d-glass absolute left-3 top-3 z-20 flex flex-col gap-1 rounded-[12px] border border-border-subtle p-1"
                >
                  <Tooltip content="Orbit camera">
                    {(tip) => (
                      <Button
                        variant="icon"
                        size="md"
                        active={interactionMode === "orbit"}
                        aria-pressed={interactionMode === "orbit"}
                        aria-label="Orbit camera mode"
                        onClick={() => setInteractionMode("orbit")}
                        {...tip}
                      >
                        <Orbit
                          className="h-[17px] w-[17px]"
                          strokeWidth={1.75}
                        />
                      </Button>
                    )}
                  </Tooltip>
                  <Tooltip content="Pan camera">
                    {(tip) => (
                      <Button
                        variant="icon"
                        size="md"
                        active={interactionMode === "pan"}
                        aria-pressed={interactionMode === "pan"}
                        aria-label="Pan camera mode"
                        onClick={() => setInteractionMode("pan")}
                        {...tip}
                      >
                        <Hand
                          className="h-[17px] w-[17px]"
                          strokeWidth={1.75}
                        />
                      </Button>
                    )}
                  </Tooltip>
                  <Tooltip content="Zoom in">
                    {(tip) => (
                      <Button
                        variant="icon"
                        size="md"
                        aria-label="Zoom in"
                        onClick={() =>
                          setFov((f) => Math.max(MIN_FOV_DEG, f - 5))
                        }
                        {...tip}
                      >
                        <ZoomIn
                          className="h-[17px] w-[17px]"
                          strokeWidth={1.75}
                        />
                      </Button>
                    )}
                  </Tooltip>
                  <Tooltip content="Zoom out">
                    {(tip) => (
                      <Button
                        variant="icon"
                        size="md"
                        aria-label="Zoom out"
                        onClick={() =>
                          setFov((f) => Math.min(MAX_FOV_DEG, f + 5))
                        }
                        {...tip}
                      >
                        <ZoomOut
                          className="h-[17px] w-[17px]"
                          strokeWidth={1.75}
                        />
                      </Button>
                    )}
                  </Tooltip>
                  <Tooltip content="Reset camera view">
                    {(tip) => (
                      <Button
                        variant="icon"
                        size="md"
                        aria-label="Reset camera view"
                        onClick={handleResetView}
                        {...tip}
                      >
                        <Box
                          className="h-[17px] w-[17px]"
                          strokeWidth={1.75}
                        />
                      </Button>
                    )}
                  </Tooltip>
                  <Tooltip
                    content={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
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
                          <Minimize2
                            className="h-[17px] w-[17px]"
                            strokeWidth={1.75}
                          />
                        ) : (
                          <Maximize2
                            className="h-[17px] w-[17px]"
                            strokeWidth={1.75}
                          />
                        )}
                      </Button>
                    )}
                  </Tooltip>
                </div>

                <div className="h-[350px] w-full sm:h-[456px]">
                  <InteractiveModelCanvas
                    modelKey={model.id}
                    src={model.glb_url}
                    iosSrc={model.usdz_url}
                    alt={`3D preview of ${model.name}`}
                    renderMode={renderMode}
                    interactionMode={interactionMode}
                    cameraPreset={cameraPreset}
                    presetVersion={presetVersion}
                    fov={fov}
                    autoRotate={autoRotate}
                    showGrid={showGrid}
                    lightingPreset={lightingPreset}
                    exposure={exposure}
                    shadows={shadows}
                    onMetadataLoaded={handleMetadataLoaded}
                    onRenderModeFallback={() => setRenderMode("textured")}
                  />
                </div>
              </div>

              {lightingOpen ? (
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
                        htmlFor="detail-exposure"
                        className="text-[11px] font-medium text-ink-secondary"
                      >
                        Exposure
                      </label>
                      <input
                        id="detail-exposure"
                        type="range"
                        min="0.65"
                        max="1.45"
                        step="0.05"
                        value={exposure}
                        onChange={(e) =>
                          setExposure(e.currentTarget.valueAsNumber)
                        }
                        className="h-8 w-24 accent-copper"
                      />
                      <span className="w-9 font-mono text-[11px] text-ink-muted">
                        {exposure.toFixed(2)}×
                      </span>
                    </div>

                    <CopperSwitch
                      id="detail-shadows"
                      label="Shadows"
                      labelClassName="text-[11px] font-medium text-ink-primary"
                      checked={shadows}
                      onCheckedChange={setShadows}
                    />
                  </div>
                </div>
              ) : null}

              {/* Camera Presets, Grid, Lighting & Auto Rotate Bar */}
              <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle/60 bg-obsidian/50 px-4 py-3 sm:px-5">
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
                        onClick={() => {
                          setCameraPreset(preset.id);
                          setPresetVersion((v) => v + 1);
                        }}
                        className={`min-h-[38px] shrink-0 rounded-[7px] px-2.5 py-1 text-[11px] font-medium transition-colors ${
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

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-pressed={showGrid}
                    aria-label="Ground grid"
                    onClick={() => setShowGrid((prev) => !prev)}
                    className={`v3d-glass ${
                      showGrid ? "border-copper/60 text-copper" : ""
                    }`}
                  >
                    <Grid3x3 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span>Grid</span>
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    aria-expanded={lightingOpen}
                    aria-label="Lighting controls"
                    onClick={() => setLightingOpen((prev) => !prev)}
                    className={`v3d-glass ${
                      lightingOpen ? "border-copper/60 text-copper" : ""
                    }`}
                  >
                    <SunMedium className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span>Lighting</span>
                  </Button>

                  <div className="v3d-glass inline-flex min-h-[36px] items-center gap-2 rounded-[9px] border border-border-subtle px-3 py-1">
                    <Play
                      className="h-3 w-3 text-ink-secondary"
                      strokeWidth={1.75}
                    />
                    <CopperSwitch
                      id="detail-auto-rotate"
                      label="Auto Rotate"
                      labelClassName="text-[11px] font-medium text-ink-primary"
                      checked={autoRotate}
                      onCheckedChange={setAutoRotate}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Specification & Actions Sidebar */}
            <aside className="flex flex-col gap-4 rounded-[16px] border border-border-subtle bg-panel p-5">
              <div>
                <h2 className="text-sm font-semibold text-ink-primary">
                  Asset Specifications
                </h2>
                <dl className="mt-3.5 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2 rounded-[10px] border border-border-subtle bg-obsidian/55 px-3.5 py-2.5">
                    <dt className="text-ink-muted">Asset ID</dt>
                    <dd className="font-mono text-ink-primary truncate max-w-[180px]">
                      {model.id}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-[10px] border border-border-subtle bg-obsidian/55 px-3.5 py-2.5">
                    <dt className="text-ink-muted">Format</dt>
                    <dd className="text-ink-primary">glTF Binary (.glb)</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-[10px] border border-border-subtle bg-obsidian/55 px-3.5 py-2.5">
                    <dt className="text-ink-muted">File Size</dt>
                    <dd className="text-ink-primary">
                      {model.byte_size
                        ? formatBytes(model.byte_size)
                        : "Not reported"}
                    </dd>
                  </div>
                  {model.provider ? (
                    <div className="flex items-center justify-between gap-2 rounded-[10px] border border-border-subtle bg-obsidian/55 px-3.5 py-2.5">
                      <dt className="text-ink-muted">Provider</dt>
                      <dd className="text-ink-primary">{model.provider}</dd>
                    </div>
                  ) : null}
                  {appearanceLabel ? (
                    <div className="flex items-center justify-between gap-2 rounded-[10px] border border-border-subtle bg-obsidian/55 px-3.5 py-2.5">
                      <dt className="text-ink-muted">Surface Appearance</dt>
                      <dd className="text-ink-primary">{appearanceLabel}</dd>
                    </div>
                  ) : null}
                  {typeof triangles === "number" ? (
                    <div className="flex items-center justify-between gap-2 rounded-[10px] border border-border-subtle bg-obsidian/55 px-3.5 py-2.5">
                      <dt className="text-ink-muted">Triangles</dt>
                      <dd className="text-ink-primary">
                        {triangles.toLocaleString()}
                      </dd>
                    </div>
                  ) : null}
                  {typeof vertices === "number" ? (
                    <div className="flex items-center justify-between gap-2 rounded-[10px] border border-border-subtle bg-obsidian/55 px-3.5 py-2.5">
                      <dt className="text-ink-muted">Vertices</dt>
                      <dd className="text-ink-primary">
                        {vertices.toLocaleString()}
                      </dd>
                    </div>
                  ) : null}
                  {extents ? (
                    <div className="flex items-center justify-between gap-2 rounded-[10px] border border-border-subtle bg-obsidian/55 px-3.5 py-2.5">
                      <dt className="text-ink-muted">Extents (model units)</dt>
                      <dd className="font-mono text-ink-primary">
                        {extents.map((n) => n.toFixed(2)).join(" × ")}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-2 rounded-[10px] border border-border-subtle bg-obsidian/55 px-3.5 py-2.5">
                    <dt className="text-ink-muted">Created</dt>
                    <dd className="text-ink-primary">
                      {new Date(model.created_at).toLocaleDateString()}
                    </dd>
                  </div>
                </dl>
              </div>

              <AlertBanner tone="info">
                {model.is_sample
                  ? "This is a local bundled sample GLB for verifying the 3D viewer, export dialog, and mobile AR flow — not generated from an uploaded photo."
                  : "Dimensions are estimated from a single photo and not measured in physical units."}
              </AlertBanner>

              {!model.is_sample ? (
                <div className="mt-auto pt-3 border-t border-border-subtle/80">
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={() => setDeleteOpen(true)}
                    className="w-full text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Model &amp; Revoke Shares
                  </Button>
                </div>
              ) : null}
            </aside>
          </div>
        )}
      </div>

      <QrArDialog
        open={arOpen}
        onClose={() => setArOpen(false)}
        model={model}
      />
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        model={model}
      />

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete 3D model?"
        lightDismiss={false}
        footer={
          <>
            <Button
              variant="secondary"
              size="md"
              autoFocus
              disabled={deleting}
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              loading={deleting}
              onClick={() => void handleConfirmDelete()}
            >
              {deleting ? "Deleting…" : "Delete Model"}
            </Button>
          </>
        }
      >
        <p className="text-xs sm:text-sm leading-relaxed text-ink-secondary">
          This permanently deletes{" "}
          <span className="font-medium text-ink-primary">{model?.name}</span>{" "}
          from storage and revokes all active mobile AR share links.
        </p>
      </Dialog>
    </AppShell>
  );
}

"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Box,
  Download,
  Play,
  RotateCcw,
  Smartphone,
} from "lucide-react";
import {
  formatAppearanceLabel,
  formatUserError,
  getSharedAsset,
  type ApiErrorPayload,
  type SharedAssetResponse,
} from "@/lib/api";
import { sharedModelUrl } from "@/lib/ar";
import { loadViewerPreferences } from "@/lib/preferences";
import { SAMPLE_MODEL } from "@/lib/sample";
import {
  CAMERA_PRESETS,
  DEFAULT_FOV_DEG,
  getCameraPresetConfig,
  type CameraPreset,
} from "@/components/viewer/viewerTypes";
import {
  AlertBanner,
  Badge,
  Button,
  CopperSwitch,
  ErrorState,
  Spinner,
} from "@/components/ui";
import type { ModelViewerElement } from "@/types/model-viewer";

interface ArPageProps {
  params: Promise<{ token: string }>;
}

function detectPlatformRuntimeLabel(): string {
  if (typeof navigator === "undefined") return "native AR viewer";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS Quick Look";
  if (/Android/i.test(ua)) return "Android Scene Viewer / WebXR";
  return "native AR viewer";
}

export default function MobileArPage({ params }: ArPageProps) {
  const { token } = use(params);
  const viewerRef = useRef<ModelViewerElement>(null);

  const [asset, setAsset] = useState<SharedAssetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorPayload | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [canActivateAr, setCanActivateAr] = useState<boolean | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [arStatus, setArStatus] = useState("");
  const [tracking, setTracking] = useState("");
  const [autoRotate, setAutoRotate] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("perspective");
  const [platformRuntime, setPlatformRuntime] = useState("native AR viewer");

  useEffect(() => {
    setAutoRotate(loadViewerPreferences().defaultAutoRotate);
    setPlatformRuntime(detectPlatformRuntimeLabel());
  }, []);

  useEffect(() => {
    let active = true;
    import("@google/model-viewer")
      .then(() => {
        if (active) setViewerReady(true);
      })
      .catch(() => {
        if (active) {
          setError({
            code: "UNKNOWN_ERROR",
            message: "Could not initialize the 3D/AR viewer component.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setAsset(null);
    setError(null);
    setModelLoaded(false);
    setCanActivateAr(null);
    setLaunchError(null);
    setArStatus("");
    setTracking("");
    setLaunching(false);
    setCameraPreset("perspective");

    if (token === "sample") {
      setAsset({
        model_id: SAMPLE_MODEL.id,
        name: SAMPLE_MODEL.name,
        glb_url: SAMPLE_MODEL.glb_url,
        is_sample: true,
      });
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    getSharedAsset(token, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        const origin = window.location.origin;
        const glb = sharedModelUrl(data.glb_url, origin, token, "glb");
        const usdz =
          data.usdz_url && sharedModelUrl(data.usdz_url, origin, token, "usdz");
        if (
          !glb ||
          (data.usdz_url && !usdz) ||
          !data.expires_at ||
          !Number.isFinite(Date.parse(data.expires_at))
        ) {
          setError({
            code: "INVALID_MODEL",
            message: "This share does not have a valid HTTPS model URL.",
          });
          return;
        }
        setAsset({ ...data, glb_url: glb, usdz_url: usdz || null });
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(formatUserError(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    if (!asset?.expires_at) return;
    const deadline = Date.parse(asset.expires_at);
    function check() {
      if (Date.now() < deadline) return;
      setAsset(null);
      setError({
        code: "EXPIRED",
        message: "Ask the model owner to create a new link.",
      });
    }
    check();
    const timer = window.setInterval(check, 1000);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [asset?.expires_at]);

  useEffect(() => {
    const el = viewerRef.current;
    if (!el || !viewerReady || !asset) return;

    function updateCapability() {
      setCanActivateAr(Boolean(window.isSecureContext && el?.canActivateAR));
    }
    function onLoad() {
      setModelLoaded(true);
      updateCapability();
    }
    function onError() {
      setError({
        code: "INVALID_MODEL",
        message:
          "The shared model could not be loaded. Reload or ask for a new link.",
      });
    }
    function onArStatus(event: Event) {
      const status =
        (event as CustomEvent<{ status: string }>).detail?.status ?? "";
      setArStatus(status);
      if (status === "failed") {
        setLaunchError(
          "AR could not start on this device. You can keep using the interactive 3D viewer."
        );
        setCanActivateAr(false);
      }
      if (status === "not-presenting") setTracking("");
    }
    function onTracking(event: Event) {
      setTracking(
        (event as CustomEvent<{ status: string }>).detail?.status ?? ""
      );
    }

    el.addEventListener("load", onLoad);
    el.addEventListener("error", onError);
    el.addEventListener("ar-status", onArStatus);
    el.addEventListener("ar-tracking", onTracking);
    document.addEventListener("visibilitychange", updateCapability);
    if ((el as ModelViewerElement & { loaded?: boolean }).loaded) onLoad();

    // The SDK selects its native mode asynchronously, including WebXR feature detection.
    const timer = window.setInterval(updateCapability, 250);
    const end = window.setTimeout(() => window.clearInterval(timer), 3000);
    return () => {
      el.removeEventListener("load", onLoad);
      el.removeEventListener("error", onError);
      el.removeEventListener("ar-status", onArStatus);
      el.removeEventListener("ar-tracking", onTracking);
      document.removeEventListener("visibilitychange", updateCapability);
      window.clearInterval(timer);
      window.clearTimeout(end);
    };
  }, [viewerReady, asset]);

  const applyCameraPreset = useCallback((preset: CameraPreset) => {
    setCameraPreset(preset);
    const el = viewerRef.current;
    if (!el) return;
    const cfg = getCameraPresetConfig(preset);
    el.cameraOrbit = cfg.orbit;
    el.cameraTarget = "auto auto auto";
    el.fieldOfView = `${DEFAULT_FOV_DEG}deg`;
    el.resetTurntableRotation?.(0);
  }, []);

  async function handleLaunchAr() {
    const el = viewerRef.current;
    if (!el?.activateAR || !el.canActivateAR || launching || !modelLoaded) return;
    if (asset?.expires_at && Date.parse(asset.expires_at) <= Date.now()) {
      setAsset(null);
      setError({
        code: "EXPIRED",
        message: "Ask the model owner to create a new link.",
      });
      return;
    }
    setLaunching(true);
    setLaunchError(null);
    try {
      await el.activateAR();
    } catch {
      setLaunchError(
        "AR could not start. Try again or keep exploring the interactive 3D preview."
      );
    } finally {
      setLaunching(false);
    }
  }

  const appearanceLabel = formatAppearanceLabel(asset?.appearance);
  const activePresetCfg = getCameraPresetConfig(cameraPreset);
  const retryable = error && ["TIMEOUT", "NETWORK_ERROR", "PROVIDER_UNAVAILABLE", "INVALID_MODEL"]
    .includes(error.code);

  return (
    <div className="studio-ambient-bg flex min-h-dvh flex-col bg-obsidian text-ink-primary">
      {/* Compact Sticky Top Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border-subtle bg-[#121214]/95 backdrop-blur-md px-4 py-2.5">
        <Link
          href="/create"
          className="inline-flex min-h-11 items-center gap-2 rounded-[10px] px-2 text-xs font-medium text-ink-secondary transition-colors hover:text-ink-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Vision3D Studio</span>
        </Link>

        <div className="flex items-center gap-1.5">
          {asset?.is_sample ? <Badge tone="copper" dot>Sample</Badge> : null}
          {appearanceLabel ? <Badge tone="neutral">{appearanceLabel}</Badge> : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {loading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[16px] border border-border-subtle bg-panel p-8 text-center">
            <Spinner size="lg" label="Loading shared 3D model" />
            <p className="text-xs text-ink-secondary">
              Loading shared 3D asset…
            </p>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-1 items-center justify-center">
            <ErrorState
              code={error.code}
              title={
                error.code === "EXPIRED"
                  ? "This AR share link has expired"
                  : "Shared 3D model unavailable"
              }
              message={error.message}
              actions={retryable ? (
                <Button size="lg" variant="primary" onClick={() => window.location.reload()}>
                  Retry loading model
                </Button>
              ) : (
                <Link
                  href="/create"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-[10px] bg-copper px-5 py-2.5 text-xs font-semibold text-ink-on-copper transition-colors hover:bg-copper-hover"
                >
                  Return to Vision3D
                </Link>
              )}
            />
          </div>
        )}

        {!loading && !error && asset && (
          <>
            {/* Concise Asset Header */}
            <div className="space-y-1">
              <h1 className="text-lg font-semibold tracking-tight text-ink-primary sm:text-xl">
                {asset.name}
              </h1>
              <p className="text-xs text-ink-secondary">
                Drag to inspect 360°, pinch to zoom, or place in your room on a
                compatible phone.
              </p>
            </div>

            {/* Dominant Mobile 3D Stage */}
            <section
              aria-label="Mobile 3D preview"
              className="relative flex flex-col justify-between overflow-hidden rounded-[16px] border border-border-subtle bg-[#131315]"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(58% 42% at 50% 68%, rgba(247, 148, 72, 0.08) 0%, transparent 74%)",
                }}
              />

              <div className="relative h-[380px] sm:h-[430px] w-full">
                {/* Restrained 360° floor ring */}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 600 140"
                  className="pointer-events-none absolute bottom-3 left-1/2 w-[min(90%,420px)] -translate-x-1/2 opacity-60"
                >
                  <defs>
                    <linearGradient id="arRingFade" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#A6A3A0" stopOpacity="0.12" />
                      <stop offset="30%" stopColor="#F5F3F0" stopOpacity="0.48" />
                      <stop offset="50%" stopColor="#F79448" stopOpacity="0.48" />
                      <stop offset="70%" stopColor="#F5F3F0" stopOpacity="0.48" />
                      <stop offset="100%" stopColor="#A6A3A0" stopOpacity="0.12" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M 246 116 A 252 54 0 1 1 354 116"
                    fill="none"
                    stroke="url(#arRingFade)"
                    strokeWidth="1.2"
                  />
                  <text
                    x="300"
                    y="121"
                    textAnchor="middle"
                    fill="#F5F3F0"
                    fontSize="14"
                    fontWeight="500"
                    fontFamily="Inter, system-ui, sans-serif"
                  >
                    360°
                  </text>
                </svg>

                {viewerReady ? (
                  <model-viewer
                    ref={viewerRef}
                    src={asset.glb_url}
                    ios-src={asset.usdz_url ?? undefined}
                    alt={`3D model for AR placement: ${asset.name}`}
                    ar
                    ar-modes="webxr scene-viewer quick-look"
                    ar-scale="auto"
                    ar-placement="floor"
                    ar-usdz-max-texture-size="1024"
                    className="[&::part(default-ar-button)]:hidden"
                    camera-controls
                    auto-rotate={autoRotate || undefined}
                    auto-rotate-delay={0}
                    rotation-per-second="16deg"
                    camera-orbit={activePresetCfg.orbit}
                    field-of-view={`${DEFAULT_FOV_DEG}deg`}
                    interpolation-decay={120}
                    environment-image="neutral"
                    tone-mapping="commerce"
                    shadow-intensity="1.25"
                    shadow-softness="0.82"
                    exposure="1.08"
                    interaction-prompt="none"
                    touch-action="pan-y"
                    style={{ width: "100%", height: "100%" }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center gap-2 text-xs text-ink-secondary">
                    <Spinner size="sm" label="Loading interactive 3D viewer" />
                    <span>Initializing 3D viewer…</span>
                  </div>
                )}

                {/* Model Download/Parse Loading Overlay */}
                {viewerReady && !modelLoaded ? (
                  <div
                    role="status"
                    className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
                  >
                    <div className="v3d-glass inline-flex items-center gap-2 rounded-[10px] border border-border-subtle px-3.5 py-2 text-xs text-ink-secondary">
                      <Spinner size="sm" label="Loading 3D geometry" />
                      <span>Loading 3D geometry…</span>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Touch-Friendly Mobile Viewer Controls */}
              <div className="relative z-10 flex flex-col gap-2.5 border-t border-border-subtle/70 bg-obsidian/65 px-3.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div
                    role="group"
                    aria-label="Camera angle presets"
                    className="flex items-center gap-1 overflow-x-auto"
                  >
                    {CAMERA_PRESETS.map((preset) => {
                      const active = cameraPreset === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => applyCameraPreset(preset.id)}
                          className={`min-h-11 shrink-0 rounded-[8px] px-3 py-1.5 text-xs font-medium transition-colors ${
                            active
                              ? "border border-copper/55 bg-copper/16 text-copper"
                              : "border border-transparent text-ink-secondary hover:bg-raised hover:text-ink-primary"
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => applyCameraPreset("perspective")}
                    aria-label="Reset camera view"
                    className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[8px] border border-border-subtle bg-raised text-ink-secondary transition-colors hover:border-border-strong hover:text-ink-primary"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-border-subtle/50">
                  <div className="inline-flex items-center gap-2">
                    <Play className="h-3.5 w-3.5 text-ink-secondary" />
                    <CopperSwitch
                      id="ar-mobile-auto-rotate"
                      label="Auto Rotate"
                      labelClassName="text-xs font-medium text-ink-primary"
                      checked={autoRotate}
                      disabled={!modelLoaded}
                      onCheckedChange={setAutoRotate}
                    />
                  </div>
                  <span className="text-[11px] text-ink-muted">
                    1-finger rotate · pinch zoom
                  </span>
                </div>
              </div>
            </section>

            {/* Primary Action Card: View in Your Space OR Honest Unsupported Fallback */}
            <section
              aria-label="Augmented reality actions"
              className="flex flex-col gap-3 rounded-[16px] border border-border-subtle bg-panel p-4"
            >
              {canActivateAr === true ? (
                <div className="space-y-2">
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => void handleLaunchAr()}
                    disabled={!modelLoaded}
                    loading={launching || !modelLoaded}
                    className="min-h-[52px] w-full text-sm"
                  >
                    {!launching && modelLoaded ? (
                      <Box className="h-4 w-4" strokeWidth={2} />
                    ) : null}
                    <span>
                      {!modelLoaded
                        ? "Preparing model for AR…"
                        : launching
                        ? "Launching AR…"
                        : "View in Your Space"}
                    </span>
                  </Button>
                  <p className="text-center text-[11px] text-ink-secondary">
                    Opens {platformRuntime}. Placement, surface tracking, and
                    scaling are managed by your device.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <AlertBanner
                    tone="info"
                    title={
                      canActivateAr === false
                        ? "Interactive 360° Preview · Native AR unavailable here"
                        : "Checking device AR support…"
                    }
                  >
                    {canActivateAr === false ? (
                      <span>
                        This browser does not support native AR placement, so you
                        can inspect the full 360° model above instead.
                      </span>
                    ) : (
                      <span>
                        Detecting iOS Quick Look, Android Scene Viewer, or WebXR…
                      </span>
                    )}
                  </AlertBanner>

                  {canActivateAr === false ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-[11px] text-ink-secondary">
                      <div className="flex items-start gap-2 rounded-[10px] border border-border-subtle bg-obsidian/55 p-3">
                        <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-copper" />
                        <div>
                          <p className="font-medium text-ink-primary">iPhone / iPad</p>
                          <p className="mt-0.5">
                            Open this HTTPS link in Safari for native Quick Look AR.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 rounded-[10px] border border-border-subtle bg-obsidian/55 p-3">
                        <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-copper" />
                        <div>
                          <p className="font-medium text-ink-primary">Android</p>
                          <p className="mt-0.5">
                            Open in Chrome on an ARCore-supported phone for Scene
                            Viewer / WebXR.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {launchError ? (
                <AlertBanner tone="warning" title="AR could not launch">
                  {launchError}
                </AlertBanner>
              ) : null}

              {arStatus === "session-started" ? (
                <p
                  role="status"
                  className="rounded-[10px] border border-copper/35 bg-copper/10 px-3 py-2 text-xs text-ink-primary"
                >
                  {tracking === "not-tracking"
                    ? "Point your camera toward a well-lit floor or tabletop."
                    : "Move your phone slowly to detect a surface, then tap to place."}
                </p>
              ) : null}

              <div className="flex flex-col gap-3 border-t border-border-subtle/70 pt-3 sm:flex-row sm:items-center sm:justify-between text-[11px] text-ink-muted">
                <span>
                  Scale is estimated from a single photo — pinch to resize in AR.
                </span>
                <a
                  href={
                    asset.is_sample
                      ? asset.glb_url
                      : `${asset.glb_url}?download=true`
                  }
                  download={`${asset.model_id ?? "vision3d-model"}.glb`}
                  className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-[10px] border border-border-subtle bg-raised px-4 py-2 text-xs font-medium text-ink-primary transition-colors hover:border-copper/50"
                >
                  <Download className="h-3.5 w-3.5 text-copper" />
                  Download GLB
                </a>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

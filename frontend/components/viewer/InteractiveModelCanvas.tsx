"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { RefreshCw } from "lucide-react";
import { Button, ErrorState, Spinner } from "@/components/ui";
import type { ModelViewerElement } from "@/types/model-viewer";
import {
  getCameraPresetConfig,
  type CameraPreset,
  type InteractionMode,
  type RenderMode,
  type RuntimeMeshMetadata,
} from "./viewerTypes";

const ThreeWireframeCanvas = dynamic(
  () => import("./ThreeWireframeCanvas").then((mod) => mod.ThreeWireframeCanvas),
  { ssr: false }
);

export interface InteractiveModelCanvasProps {
  modelKey: string;
  src: string;
  iosSrc?: string | null;
  alt: string;
  renderMode: RenderMode;
  interactionMode: InteractionMode;
  cameraPreset: CameraPreset;
  presetVersion: number;
  fov: number;
  autoRotate: boolean;
  showFloorRing?: boolean;
  onMetadataLoaded?: (stats: RuntimeMeshMetadata) => void;
  onRenderModeFallback?: () => void;
}

export function InteractiveModelCanvas({
  modelKey,
  src,
  iosSrc,
  alt,
  renderMode,
  interactionMode,
  cameraPreset,
  presetVersion,
  fov,
  autoRotate,
  showFloorRing = true,
  onMetadataLoaded,
  onRenderModeFallback,
}: InteractiveModelCanvasProps) {
  const viewerRef = useRef<ModelViewerElement>(null);
  const panStateRef = useRef<{
    active: boolean;
    lastX: number;
    lastY: number;
    targetX: number;
    targetY: number;
    targetZ: number;
    theta: number;
    radius: number;
  } | null>(null);

  const [mvReady, setMvReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const [resource, setResource] = useState<{ source: string; retry: number; url: string } | null>(null);
  const sharedSrc = resource?.source === src && resource.retry === retryCount ? resource.url : null;

  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    fetch(src, { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setResource({ source: src, retry: retryCount, url });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError("Could not download the model. Check the connection or retry.");
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [src, retryCount]);

  // Dynamically load Google Model Viewer client-side only
  useEffect(() => {
    let active = true;
    import("@google/model-viewer")
      .then(() => {
        if (active) setMvReady(true);
      })
      .catch(() => {
        if (active) setLoadError("Failed to initialize Google Model Viewer.");
      });
    return () => {
      active = false;
    };
  }, []);

  // Reset loading state cleanly whenever the model or render mode changes
  useEffect(() => {
    setLoaded(false);
    setLoadError(null);
  }, [modelKey, src, renderMode, retryCount]);

  // Attach load/error handlers and clean up <model-viewer> src on unmount/switch
  useEffect(() => {
    if (renderMode !== "textured" || !mvReady || !sharedSrc) return;
    const el = viewerRef.current;
    if (!el) return;

    const handleLoad = () => {
      setLoaded(true);
      setLoadError(null);
      const dims = el.getDimensions?.();
      if (dims && onMetadataLoaded) {
        onMetadataLoaded({ dimensions: [dims.x, dims.y, dims.z] });
      }
    };

    const handleError = () => {
      setLoaded(false);
      setLoadError("Could not load the 3D GLB geometry. Check the connection or retry.");
    };

    el.addEventListener("load", handleLoad);
    el.addEventListener("error", handleError);
    return () => {
      el.removeEventListener("load", handleLoad);
      el.removeEventListener("error", handleError);
    };
  }, [mvReady, renderMode, modelKey, src, retryCount, sharedSrc, onMetadataLoaded]);

  // Apply camera presets (Perspective / Front / Rear / Side) and reset smoothly
  useEffect(() => {
    if (renderMode !== "textured" || !mvReady || !sharedSrc) return;
    const el = viewerRef.current;
    if (!el) return;
    const presetCfg = getCameraPresetConfig(cameraPreset);
    el.cameraOrbit = presetCfg.orbit;
    el.cameraTarget = "auto auto auto";
    el.fieldOfView = `${fov}deg`;
    el.resetTurntableRotation?.(0);
  }, [cameraPreset, presetVersion, fov, renderMode, mvReady, sharedSrc]);

  // Apply live FOV zoom updates
  useEffect(() => {
    if (renderMode !== "textured" || !mvReady || !sharedSrc) return;
    const el = viewerRef.current;
    if (!el) return;
    el.fieldOfView = `${fov}deg`;
  }, [fov, renderMode, mvReady, sharedSrc]);

  // Primary-drag Pan support for <model-viewer> when Pan mode is active
  const handlePanPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (renderMode !== "textured" || interactionMode !== "pan") return;
      const el = viewerRef.current;
      if (!el) return;
      const orbit = el.getCameraOrbit?.() ?? { theta: 0, phi: 1.3, radius: 2.2 };
      const target = el.getCameraTarget?.() ?? { x: 0, y: 0, z: 0 };
      panStateRef.current = {
        active: true,
        lastX: e.clientX,
        lastY: e.clientY,
        targetX: target.x,
        targetY: target.y,
        targetZ: target.z,
        theta: orbit.theta,
        radius: orbit.radius || 2.0,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [renderMode, interactionMode]
  );

  const handlePanPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const state = panStateRef.current;
      const el = viewerRef.current;
      if (!state?.active || !el) return;

      const dx = e.clientX - state.lastX;
      const dy = e.clientY - state.lastY;
      state.lastX = e.clientX;
      state.lastY = e.clientY;

      const panScale = Math.max(state.radius * 0.0022, 0.0015);
      const cosT = Math.cos(state.theta);
      const sinT = Math.sin(state.theta);

      state.targetX -= dx * panScale * cosT;
      state.targetZ += dx * panScale * sinT;
      state.targetY += dy * panScale;

      el.cameraTarget = `${state.targetX.toFixed(4)}m ${state.targetY.toFixed(4)}m ${state.targetZ.toFixed(4)}m`;
    },
    []
  );

  const handlePanPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (panStateRef.current?.active) {
        panStateRef.current.active = false;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      }
    },
    []
  );

  const handleWireframeLoad = useCallback(
    (stats: RuntimeMeshMetadata) => {
      setLoaded(true);
      setLoadError(null);
      onMetadataLoaded?.(stats);
    },
    [onMetadataLoaded]
  );

  const handleWireframeError = useCallback((msg: string) => {
    setLoaded(false);
    setLoadError(msg);
  }, []);

  const presetCfg = getCameraPresetConfig(cameraPreset);

  return (
    <div className="relative h-full w-full">
      {/* Restrained 360° studio floor ring matching design-reference.png */}
      {showFloorRing ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 600 140"
          className="pointer-events-none absolute bottom-3 left-1/2 w-[min(92%,510px)] -translate-x-1/2 opacity-65"
        >
          <defs>
            <linearGradient id="ringFade" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#A6A3A0" stopOpacity="0.14" />
              <stop offset="30%" stopColor="#F5F3F0" stopOpacity="0.52" />
              <stop offset="50%" stopColor="#F79448" stopOpacity="0.48" />
              <stop offset="70%" stopColor="#F5F3F0" stopOpacity="0.52" />
              <stop offset="100%" stopColor="#A6A3A0" stopOpacity="0.14" />
            </linearGradient>
          </defs>
          <path
            d="M 246 116 A 252 54 0 1 1 354 116"
            fill="none"
            stroke="url(#ringFade)"
            strokeWidth="1.2"
          />
          <circle cx="176" cy="108" r="2.2" fill="#F5F3F0" fillOpacity="0.6" />
          <circle cx="424" cy="108" r="2.2" fill="#F5F3F0" fillOpacity="0.6" />
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
      ) : null}

      {renderMode === "textured" ? (
        mvReady && sharedSrc ? (
          <div className="relative h-full w-full">
            <model-viewer
              key={`${modelKey}:${src}:${retryCount}`}
              ref={viewerRef}
              src={sharedSrc}
              ios-src={iosSrc ?? undefined}
              alt={alt}
              camera-controls
              auto-rotate={autoRotate || undefined}
              auto-rotate-delay={0}
              rotation-per-second="18deg"
              camera-orbit={presetCfg.orbit}
              min-camera-orbit="auto auto auto"
              max-camera-orbit="auto auto auto"
              field-of-view={`${fov}deg`}
              interpolation-decay={120}
              environment-image="neutral"
              tone-mapping="commerce"
              shadow-intensity="1.25"
              shadow-softness="0.82"
              exposure="1.08"
              interaction-prompt="none"
              touch-action="pan-y"
              style={{
                width: "100%",
                height: "100%",
                backgroundColor: "transparent",
              }}
            />

            {/* Transparent pan-drag surface active ONLY when user selects Pan mode */}
            {interactionMode === "pan" && loaded && !loadError ? (
              <div
                aria-label="Pan camera drag surface"
                onPointerDown={handlePanPointerDown}
                onPointerMove={handlePanPointerMove}
                onPointerUp={handlePanPointerUp}
                onPointerCancel={handlePanPointerUp}
                className="absolute inset-0 z-10 cursor-move touch-none"
              />
            ) : null}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-ink-secondary">
            <Spinner size="sm" label="Initializing 3D viewport" />
            <span>Initializing 3D viewport…</span>
          </div>
        )
      ) : sharedSrc ? (
        <ThreeWireframeCanvas
          key={`wire:${modelKey}:${src}:${retryCount}`}
          src={sharedSrc}
          alt={alt}
          autoRotate={autoRotate}
          interactionMode={interactionMode}
          cameraPreset={cameraPreset}
          presetVersion={presetVersion}
          fov={fov}
          onLoad={handleWireframeLoad}
          onError={handleWireframeError}
        />
      ) : null}

      {/* Loading Indicator Overlay */}
      {!loaded && !loadError && (renderMode === "wireframe" || mvReady) ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="v3d-glass inline-flex items-center gap-2 rounded-[10px] border border-border-subtle px-3.5 py-2 text-xs text-ink-secondary">
            <Spinner size="sm" label="Loading 3D geometry" />
            <span>
              {renderMode === "wireframe"
                ? "Building wireframe mesh…"
                : "Loading GLB geometry…"}
            </span>
          </div>
        </div>
      ) : null}

      {/* Model Load Error State */}
      {loadError ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
          <ErrorState
            code="INVALID_MODEL"
            title="3D model failed to load"
            message={loadError}
            actions={
              <>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setRetryCount((c) => c + 1)}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry Load
                </Button>
                {renderMode === "wireframe" && onRenderModeFallback ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onRenderModeFallback}
                  >
                    Switch to Textured
                  </Button>
                ) : null}
              </>
            }
          />
        </div>
      ) : null}
    </div>
  );
}

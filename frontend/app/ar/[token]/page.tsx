"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  Download,
  Info,
  Smartphone,
} from "lucide-react";
import {
  formatUserError,
  getSharedAsset,
  type ApiErrorPayload,
  type SharedAssetResponse,
} from "@/lib/api";
import { SAMPLE_MODEL } from "@/lib/sample";
import type { ModelViewerElement } from "@/types/model-viewer";

interface ArPageProps {
  params: Promise<{ token: string }>;
}

export default function MobileArPage({ params }: ArPageProps) {
  const { token } = use(params);
  const viewerRef = useRef<ModelViewerElement>(null);

  const [asset, setAsset] = useState<SharedAssetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorPayload | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [canActivateAr, setCanActivateAr] = useState<boolean | null>(null);

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
    if (token === "sample") {
      setAsset({
        model_id: SAMPLE_MODEL.id,
        name: SAMPLE_MODEL.name,
        glb_url: SAMPLE_MODEL.glb_url,
        usdz_url: SAMPLE_MODEL.usdz_url ?? null,
        expires_at: null,
        is_sample: true,
      });
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    getSharedAsset(token, controller.signal)
      .then((data) => {
        setAsset(data);
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") {
          setError(formatUserError(err));
        }
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, [token]);

  // Detect real AR capability on this device after model-viewer loads
  useEffect(() => {
    const el = viewerRef.current;
    if (!el || !viewerReady || !asset) return;

    const updateCapability = () => {
      setCanActivateAr(Boolean(el.canActivateAR));
    };

    el.addEventListener("load", updateCapability);
    // Also check after custom element upgrades
    const timer = setTimeout(updateCapability, 600);
    return () => {
      el.removeEventListener("load", updateCapability);
      clearTimeout(timer);
    };
  }, [viewerReady, asset]);

  const handleLaunchAr = async () => {
    const el = viewerRef.current;
    if (!el?.activateAR) return;
    try {
      await el.activateAR();
    } catch {
      setCanActivateAr(false);
    }
  };

  return (
    <div className="studio-ambient-bg flex min-h-dvh flex-col bg-obsidian text-ink-primary">
      {/* Compact Mobile Header */}
      <header className="flex items-center justify-between border-b border-border-subtle bg-[#121214]/95 px-4 py-3">
        <Link
          href="/create"
          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl px-2 text-xs font-medium text-ink-secondary transition-colors hover:text-ink-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Vision3D Studio</span>
        </Link>

        {asset?.is_sample && (
          <span className="rounded-full border border-copper/35 bg-copper/12 px-2.5 py-1 text-[11px] font-medium text-copper">
            Sample 3D Model
          </span>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-5">
        {loading && (
          <div className="flex flex-1 flex-col items-center justify-center rounded-[20px] border border-border-subtle bg-panel p-8 text-center">
            <Box className="h-8 w-8 text-copper" strokeWidth={1.5} />
            <p className="mt-3 text-sm text-ink-secondary">
              Loading shared 3D model…
            </p>
          </div>
        )}

        {!loading && error && (
          <div
            role="alert"
            className="flex flex-1 flex-col items-center justify-center rounded-[20px] border border-border-subtle bg-panel p-8 text-center"
          >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-copper/35 bg-copper/12 text-copper">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <span className="rounded bg-raised px-2 py-0.5 font-mono text-[11px] text-ink-secondary">
              {error.code}
            </span>
            <h1 className="mt-3 text-lg font-semibold text-ink-primary">
              {error.code === "EXPIRED"
                ? "This AR share link has expired"
                : "Shared 3D model unavailable"}
            </h1>
            <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-ink-secondary">
              {error.message}
            </p>
            <Link
              href="/create"
              className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-copper px-5 py-2.5 text-xs font-semibold text-ink-on-copper transition-colors hover:bg-copper-hover"
            >
              Return to Vision3D
            </Link>
          </div>
        )}

        {!loading && !error && asset && (
          <>
            <div>
              <h1 className="text-xl font-semibold text-ink-primary">
                {asset.name}
              </h1>
              <p className="mt-1 text-xs text-ink-secondary">
                Drag to rotate 360° or tap View in Your Space on a compatible iOS
                or Android phone.
              </p>
            </div>

            <div className="relative flex-1 overflow-hidden rounded-[20px] border border-border-subtle bg-[#141416] min-h-[380px]">
              {viewerReady ? (
                <model-viewer
                  ref={viewerRef}
                  src={asset.glb_url}
                  ios-src={asset.usdz_url ?? undefined}
                  alt={`3D model for AR placement: ${asset.name}`}
                  ar
                  ar-modes="webxr scene-viewer quick-look"
                  ar-scale="auto"
                  camera-controls
                  shadow-intensity="1"
                  exposure="1.05"
                  touch-action="pan-y"
                  style={{ width: "100%", height: "100%", minHeight: "380px" }}
                />
              ) : (
                <div className="flex h-[380px] items-center justify-center text-xs text-ink-secondary">
                  Loading interactive 3D viewer…
                </div>
              )}
            </div>

            {/* Honest AR Capability Detection & Interactive 3D Fallback */}
            <div className="flex flex-col gap-3 rounded-[20px] border border-border-subtle bg-panel p-4">
              {canActivateAr === true ? (
                <button
                  type="button"
                  onClick={() => void handleLaunchAr()}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-copper px-5 py-3 text-sm font-semibold text-ink-on-copper transition-colors hover:bg-copper-hover active:bg-copper-pressed"
                >
                  <Smartphone className="h-4 w-4" />
                  <span>View in Your Space (AR)</span>
                </button>
              ) : (
                <div className="flex items-start gap-2.5 rounded-xl border border-border-subtle bg-obsidian/60 p-3.5 text-xs text-ink-secondary">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-copper" />
                  <div>
                    <p className="font-medium text-ink-primary">
                      {canActivateAr === false
                        ? "Native AR is not supported on this browser/device"
                        : "Checking device AR support…"}
                    </p>
                    <p className="mt-1 leading-relaxed">
                      You can still inspect the full interactive 360° 3D model
                      above. For room placement, open this HTTPS page in Safari on
                      iPhone (Quick Look) or Chrome on an ARCore Android phone.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-[11px] text-ink-muted">
                <span>
                  Scale is estimated from a single photo — pinch to resize in AR.
                </span>
                <a
                  href={asset.glb_url}
                  download={`${asset.model_id ?? "vision3d-model"}.glb`}
                  className="inline-flex min-h-[42px] shrink-0 items-center justify-center gap-2 rounded-xl border border-border-subtle bg-raised px-4 py-2 text-xs font-medium text-ink-primary transition-colors hover:border-copper/50"
                >
                  <Download className="h-3.5 w-3.5 text-copper" />
                  Download GLB
                </a>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, Server, Shield, Sliders } from "lucide-react";
import { AppShell } from "@/components/sidebar/AppShell";
import { CopperSwitch } from "@/components/ui/CopperSwitch";
import {
  checkHealth,
  getApiBaseUrl,
  getPublicAppUrl,
  isHttpsUrl,
  isLocalhostUrl,
  type HealthResponse,
} from "@/lib/api";
import {
  loadViewerPreferences,
  prefersReducedMotion,
  saveViewerPreferences,
} from "@/lib/preferences";
import { DEFAULT_MAX_UPLOAD_BYTES, formatBytes } from "@/lib/validation";

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const [defaultAutoRotate, setDefaultAutoRotate] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const probeHealth = async () => {
    setChecking(true);
    try {
      const res = await checkHealth();
      setHealth(res);
      setBackendOnline(true);
    } catch {
      setHealth(null);
      setBackendOnline(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    const prefs = loadViewerPreferences();
    setDefaultAutoRotate(prefs.defaultAutoRotate);
    setReducedMotion(prefersReducedMotion());
    void probeHealth();
  }, []);

  const handleAutoRotateToggle = (enabled: boolean) => {
    setDefaultAutoRotate(enabled);
    saveViewerPreferences({ defaultAutoRotate: enabled });
  };

  const apiBaseUrl = getApiBaseUrl();
  const publicAppUrl = getPublicAppUrl();
  const arUrlReady =
    publicAppUrl !== null && !isLocalhostUrl(publicAppUrl) && isHttpsUrl(publicAppUrl);

  return (
    <AppShell backendOnline={backendOnline}>
      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-ink-primary">
            <span className="text-copper">Settings</span> &amp; Diagnostics
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Backend connection status, verified provider capabilities, viewer
            preferences, and data handling disclosures.
          </p>
        </header>

        {/* Backend & Provider Capabilities */}
        <section className="rounded-[20px] border border-border-subtle bg-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Server className="h-5 w-5 text-copper" strokeWidth={1.75} />
              <h2 className="text-base font-semibold text-ink-primary">
                Backend &amp; Provider Status
              </h2>
            </div>
            <button
              type="button"
              onClick={() => void probeHealth()}
              disabled={checking}
              className="inline-flex min-h-[38px] items-center gap-2 rounded-xl border border-border-subtle bg-raised px-3.5 py-1.5 text-xs font-medium text-ink-primary transition-colors hover:border-border-strong disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
              Re-check /health
            </button>
          </div>

          <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border-subtle bg-obsidian/55 p-3.5">
              <dt className="text-xs text-ink-muted">API Endpoint</dt>
              <dd className="mt-1 break-all font-mono text-xs text-ink-primary">
                {apiBaseUrl}
              </dd>
            </div>
            <div className="rounded-xl border border-border-subtle bg-obsidian/55 p-3.5">
              <dt className="text-xs text-ink-muted">Health Check</dt>
              <dd className="mt-1 text-xs font-medium text-ink-primary">
                {backendOnline === true
                  ? `Connected (${health?.status ?? "ok"})`
                  : backendOnline === false
                  ? "Unreachable — start the FastAPI server"
                  : "Checking…"}
              </dd>
            </div>
            <div className="rounded-xl border border-border-subtle bg-obsidian/55 p-3.5">
              <dt className="text-xs text-ink-muted">Public Mobile AR Origin</dt>
              <dd className="mt-1 break-all font-mono text-xs text-ink-primary">
                {publicAppUrl ?? "Not set"}{" "}
                <span className={arUrlReady ? "text-emerald-400" : "text-copper"}>
                  ({arUrlReady ? "HTTPS ready" : "HTTPS tunnel required for phone QR"})
                </span>
              </dd>
            </div>
            <div className="rounded-xl border border-border-subtle bg-obsidian/55 p-3.5">
              <dt className="text-xs text-ink-muted">Upload Limit</dt>
              <dd className="mt-1 text-xs text-ink-primary">
                {formatBytes(health?.max_upload_bytes ?? DEFAULT_MAX_UPLOAD_BYTES)} ·
                JPEG, PNG, WebP
              </dd>
            </div>
          </dl>

          <div className="mt-4 rounded-xl border border-border-subtle bg-obsidian/45 p-4">
            <p className="text-xs font-medium text-ink-primary">
              Verified Server-Side Providers
            </p>
            {health?.providers && health.providers.some((p) => p.verified) ? (
              <ul className="mt-2.5 space-y-2">
                {health.providers
                  .filter((p) => p.verified)
                  .map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between text-xs text-ink-secondary"
                    >
                      <span className="inline-flex items-center gap-2 text-ink-primary">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        {p.label}
                      </span>
                      <span>
                        {p.supports_background_removal
                          ? "Supports background removal"
                          : "Standard image input"}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-xs leading-relaxed text-ink-secondary">
                No verified image-to-3D provider is currently reported by the backend.
                Provider-specific controls remain hidden until verified server-side.
              </p>
            )}
          </div>
        </section>

        {/* Viewer Preferences */}
        <section className="rounded-[20px] border border-border-subtle bg-panel p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <Sliders className="h-5 w-5 text-copper" strokeWidth={1.75} />
            <h2 className="text-base font-semibold text-ink-primary">
              Viewer &amp; Accessibility Preferences
            </h2>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border-subtle bg-obsidian/55 p-4">
              <div>
                <p className="text-sm font-medium text-ink-primary">
                  Auto-rotate 3D models by default
                </p>
                <p className="mt-0.5 text-xs text-ink-secondary">
                  Automatically starts turntable rotation when a model loads.
                  {reducedMotion
                    ? " Your system prefers reduced motion, so auto-rotate defaults to off."
                    : ""}
                </p>
              </div>
              <CopperSwitch
                id="settings-auto-rotate"
                label="Default auto-rotate"
                labelClassName="sr-only"
                checked={defaultAutoRotate}
                onCheckedChange={handleAutoRotateToggle}
              />
            </div>
          </div>
        </section>

        {/* Privacy, Retention & Limitations Disclosure */}
        <section className="rounded-[20px] border border-border-subtle bg-panel p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <Shield className="h-5 w-5 text-copper" strokeWidth={1.75} />
            <h2 className="text-base font-semibold text-ink-primary">
              Data Handling &amp; Reconstruction Notes
            </h2>
          </div>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-xs leading-relaxed text-ink-secondary">
            <li>
              <strong className="text-ink-primary">Server-side inference:</strong>{" "}
              Uploaded images are sent through the Vision3D backend to the
              configured third-party or self-hosted 3D generation service. No API
              tokens are stored in the browser.
            </li>
            <li>
              <strong className="text-ink-primary">Retention policy:</strong>{" "}
              Anonymous session assets are stored temporarily (proposed 7-day
              retention) and public mobile AR share links expire automatically
              (proposed 1-hour TTL). Deleting a model revokes its share links.
            </li>
            <li>
              <strong className="text-ink-primary">Geometry accuracy:</strong>{" "}
              Single-image 3D generation infers unseen back surfaces and approximate
              scale. Do not rely on generated meshes for measured physical dimensions.
            </li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}

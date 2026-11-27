"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, Server, Shield, Sliders } from "lucide-react";
import { AppShell } from "@/components/sidebar/AppShell";
import { Badge, Button, CopperSwitch } from "@/components/ui";
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
  const [publicAppUrl, setPublicAppUrl] = useState<string | null>(null);

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
    setPublicAppUrl(getPublicAppUrl());
    void probeHealth();
  }, []);

  const handleAutoRotateToggle = (enabled: boolean) => {
    setDefaultAutoRotate(enabled);
    saveViewerPreferences({ defaultAutoRotate: enabled });
  };

  const apiBaseUrl = getApiBaseUrl();
  const arUrlReady =
    publicAppUrl !== null && !isLocalhostUrl(publicAppUrl) && isHttpsUrl(publicAppUrl);

  return (
    <AppShell backendOnline={backendOnline}>
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-7 lg:py-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-[28px]">
            <span className="text-copper">Settings</span> &amp; Diagnostics
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-ink-secondary">
            Backend connection status, verified provider capabilities, viewer
            preferences, and data handling disclosures.
          </p>
        </header>

        {/* Backend & Provider Capabilities */}
        <section className="rounded-[16px] border border-border-subtle bg-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Server className="h-4 w-4 text-copper" strokeWidth={1.75} />
              <h2 className="text-sm font-semibold text-ink-primary">
                Backend &amp; Provider Status
              </h2>
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={checking}
              onClick={() => void probeHealth()}
            >
              {!checking ? <RefreshCw className="h-3.5 w-3.5 text-ink-secondary" /> : null}
              Re-check /health
            </Button>
          </div>

          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-[10px] border border-border-subtle bg-obsidian/55 p-3.5">
              <dt className="text-[11px] text-ink-muted">API Base Path</dt>
              <dd className="mt-1 break-all font-mono text-xs text-ink-primary">
                {apiBaseUrl}
              </dd>
            </div>
            <div className="rounded-[10px] border border-border-subtle bg-obsidian/55 p-3.5">
              <dt className="text-[11px] text-ink-muted">Health Check</dt>
              <dd className="mt-1 flex items-center gap-2 text-xs font-medium text-ink-primary">
                <Badge
                  tone={
                    backendOnline === true
                      ? "success"
                      : backendOnline === false
                      ? "copper"
                      : "neutral"
                  }
                  dot
                >
                  {backendOnline === true
                    ? `Connected (${health?.status ?? "ok"})`
                    : backendOnline === false
                    ? "Unreachable"
                    : "Checking"}
                </Badge>
              </dd>
            </div>
            <div className="rounded-[10px] border border-border-subtle bg-obsidian/55 p-3.5">
              <dt className="text-[11px] text-ink-muted">Public Mobile AR Origin</dt>
              <dd className="mt-1 space-y-1 text-xs">
                <div className="break-all font-mono text-ink-primary">
                  {publicAppUrl ?? "Resolving…"}
                </div>
                {publicAppUrl ? (
                  <div className={arUrlReady ? "text-emerald-400" : "text-copper"}>
                    {arUrlReady
                      ? "HTTPS ready for phone QR"
                      : "HTTPS tunnel required for phone QR"}
                  </div>
                ) : null}
              </dd>
            </div>
            <div className="rounded-[10px] border border-border-subtle bg-obsidian/55 p-3.5">
              <dt className="text-[11px] text-ink-muted">Upload Limit</dt>
              <dd className="mt-1 text-xs text-ink-primary">
                {formatBytes(health?.max_upload_bytes ?? DEFAULT_MAX_UPLOAD_BYTES)} ·
                JPEG, PNG, WebP
              </dd>
            </div>
          </dl>

          <div className="mt-4 rounded-[10px] border border-border-subtle bg-obsidian/45 p-4">
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
                      className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-secondary"
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
        <section className="rounded-[16px] border border-border-subtle bg-panel p-5">
          <div className="flex items-center gap-2.5">
            <Sliders className="h-4 w-4 text-copper" strokeWidth={1.75} />
            <h2 className="text-sm font-semibold text-ink-primary">
              Viewer &amp; Accessibility Preferences
            </h2>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4 rounded-[10px] border border-border-subtle bg-obsidian/55 p-4">
            <div>
              <p className="text-xs sm:text-sm font-medium text-ink-primary">
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
        </section>

        {/* Privacy, Retention & Limitations Disclosure */}
        <section className="rounded-[16px] border border-border-subtle bg-panel p-5">
          <div className="flex items-center gap-2.5">
            <Shield className="h-4 w-4 text-copper" strokeWidth={1.75} />
            <h2 className="text-sm font-semibold text-ink-primary">
              Data Handling &amp; Reconstruction Notes
            </h2>
          </div>
          <ul className="mt-3.5 list-disc space-y-2 pl-5 text-xs leading-relaxed text-ink-secondary">
            <li>
              <strong className="text-ink-primary">Server-side inference:</strong>{" "}
              Uploaded images have EXIF metadata stripped before being forwarded to
              the configured 3D inference service. Provider tokens remain backend-only.
            </li>
            <li>
              <strong className="text-ink-primary">Retention policy:</strong>{" "}
              Anonymous session assets are stored temporarily (
              {health?.retention_days ?? 7}-day default retention) and public mobile
              AR share links expire automatically (
              {Math.round((health?.share_ttl_seconds ?? 3600) / 60)}-minute default
              TTL). Deleting a model revokes its share links.
            </li>
            <li>
              <strong className="text-ink-primary">Geometry accuracy:</strong>{" "}
              Single-image 3D generation infers unseen surfaces and approximate
              scale. Do not rely on generated meshes for measured physical dimensions.
            </li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}

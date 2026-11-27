"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Box,
  Layers,
  Orbit,
  Smartphone,
  Upload,
} from "lucide-react";
import { Badge, Spinner } from "@/components/ui";
import { SAMPLE_MODEL } from "@/lib/sample";

function Vision3DMark() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M14 2.75L24 8.5V19.5L14 25.25L4 19.5V8.5L14 2.75Z"
        stroke="#F79448"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="M14 2.75V14M14 14L24 8.5M14 14L4 8.5M14 14V25.25"
        stroke="#F79448"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeOpacity="0.82"
      />
    </svg>
  );
}

const WORKFLOW_STEPS = [
  {
    step: "01",
    icon: Upload,
    title: "Upload or capture a photo",
    body: "Supports JPEG, PNG, and WebP up to 10 MB with client-side dimension checks and server-side EXIF stripping.",
  },
  {
    step: "02",
    icon: Box,
    title: "Generate a validated GLB mesh",
    body: "Asynchronous server-side inference produces a downloadable glTF binary with baked surface texture.",
  },
  {
    step: "03",
    icon: Smartphone,
    title: "Inspect 360° & place in mobile AR",
    body: "Orbit freely in the studio viewport, export GLB, or scan an expiring HTTPS QR code for iOS Quick Look and Android Scene Viewer.",
  },
];

export default function LandingPage() {
  const [viewerReady, setViewerReady] = useState(false);

  useEffect(() => {
    let active = true;
    import("@google/model-viewer")
      .then(() => {
        if (active) setViewerReady(true);
      })
      .catch(() => {
        // Fallback handled gracefully by container message
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="studio-ambient-bg flex min-h-dvh flex-col bg-obsidian text-ink-primary">
      {/* Compact Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-border-subtle/80 bg-[#121214]/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Vision3DMark />
            <span className="text-[17px] font-semibold tracking-tight text-ink-primary">
              Vision3D
            </span>
            <span className="rounded-[6px] border border-border-subtle bg-raised px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-secondary">
              Studio
            </span>
          </Link>

          <nav aria-label="Landing navigation" className="hidden sm:flex items-center gap-6 text-xs font-medium text-ink-secondary">
            <Link href="/create" className="transition-colors hover:text-ink-primary">
              Create 3D
            </Link>
            <Link href="/models" className="transition-colors hover:text-ink-primary">
              My Models
            </Link>
            <Link href="/settings" className="transition-colors hover:text-ink-primary">
              Settings
            </Link>
          </nav>

          <Link
            href="/create"
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[10px] bg-copper px-3.5 py-2 text-xs font-semibold text-ink-on-copper transition-colors hover:bg-copper-hover active:bg-copper-pressed"
          >
            <span>Open Studio</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      {/* Hero Split */}
      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col justify-center gap-10 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-5">
            <Badge tone="copper" dot>
              2D Image to Interactive 3D &amp; Mobile AR
            </Badge>

            <h1 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl lg:text-[34px] lg:leading-[1.18]">
              Single-photo <span className="text-copper">3D studio</span> built for
              fast inspection and AR.
            </h1>

            <p className="max-w-lg text-sm leading-relaxed text-ink-secondary">
              Upload a photo of an object to generate a real binary glTF (.glb)
              model via server-side inference, orbit through 360° in the browser,
              download the mesh, and open it in native mobile AR via an expiring QR
              link.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href="/create"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-[10px] bg-copper px-5 py-2.5 text-sm font-semibold text-ink-on-copper transition-colors hover:bg-copper-hover active:bg-copper-pressed"
              >
                <span>Start Creating</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/create?sample=1"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-[10px] border border-border-subtle bg-raised px-4 py-2.5 text-sm font-medium text-ink-primary transition-colors hover:border-border-strong hover:bg-[#2a2a2e]"
              >
                <Orbit className="h-4 w-4 text-copper" />
                <span>Inspect Sample 3D</span>
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 text-xs text-ink-muted">
              <span>No account required</span>
              <span>·</span>
              <span>GLB export</span>
              <span>·</span>
              <span>iOS Quick Look &amp; Android Scene Viewer</span>
            </div>
          </div>

          {/* Live Interactive Sample Studio Viewport */}
          <div className="relative overflow-hidden rounded-[16px] border border-border-subtle bg-[#131315] min-h-[360px] sm:min-h-[430px] flex flex-col justify-between p-4">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(56% 42% at 50% 66%, rgba(247, 148, 72, 0.09) 0%, transparent 72%)",
              }}
            />

            <div className="relative z-10 flex flex-wrap items-center justify-between gap-2">
              <Badge tone="copper" dot>
                Sample 3D Model (Demo Preview)
              </Badge>
              <Link
                href="/models/sample"
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-border-subtle bg-raised/90 px-2.5 py-1 text-[11px] font-medium text-ink-secondary transition-colors hover:border-copper/45 hover:text-ink-primary"
              >
                <Layers className="h-3 w-3 text-copper" />
                Model Details
              </Link>
            </div>

            <div className="relative z-0 my-1 h-[280px] sm:h-[340px] w-full">
              {viewerReady ? (
                <model-viewer
                  src={SAMPLE_MODEL.glb_url}
                  alt="Interactive sample 3D lounge armchair preview"
                  camera-controls
                  auto-rotate
                  auto-rotate-delay={0}
                  rotation-per-second="16deg"
                  camera-orbit="35deg 72deg 105%"
                  field-of-view="34deg"
                  environment-image="neutral"
                  tone-mapping="commerce"
                  shadow-intensity="1.25"
                  shadow-softness="0.82"
                  exposure="1.08"
                  interaction-prompt="none"
                  touch-action="pan-y"
                  style={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
                />
              ) : (
                <div className="flex h-full items-center justify-center gap-2 text-xs text-ink-secondary">
                  <Spinner size="sm" label="Loading sample 3D viewer" />
                  <span>Loading interactive 3D preview…</span>
                </div>
              )}
            </div>

            <div className="relative z-10 flex items-center justify-between gap-2 text-[11px] text-ink-muted">
              <span>Drag to orbit 360° · Scroll to zoom</span>
              <Link
                href="/ar/sample"
                className="font-medium text-ink-secondary hover:text-copper"
              >
                Preview Mobile AR →
              </Link>
            </div>
          </div>
        </section>

        {/* Minimal 3-Step Workflow Strip */}
        <section
          aria-label="Workflow overview"
          className="grid grid-cols-1 gap-4 border-t border-border-subtle/80 pt-8 md:grid-cols-3"
        >
          {WORKFLOW_STEPS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className="rounded-[14px] border border-border-subtle bg-panel/85 p-5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-border-subtle bg-raised text-copper">
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </div>
                  <span className="font-mono text-[11px] text-ink-muted">
                    {item.step}
                  </span>
                </div>
                <h2 className="mt-3.5 text-sm font-semibold text-ink-primary">
                  {item.title}
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-secondary">
                  {item.body}
                </p>
              </div>
            );
          })}
        </section>
      </main>

      {/* Honest Minimal Footer */}
      <footer className="border-t border-border-subtle/70 bg-[#121214]/80">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-2 px-4 py-4 text-[11px] text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>
            Vision3D · Single-image reconstruction infers unseen geometry and
            approximate scale.
          </span>
          <div className="flex items-center gap-4">
            <Link href="/create" className="hover:text-ink-primary">
              Create 3D
            </Link>
            <Link href="/models" className="hover:text-ink-primary">
              My Models
            </Link>
            <Link href="/settings" className="hover:text-ink-primary">
              Settings
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, FileBox, Info } from "lucide-react";
import {
  downloadModel,
  formatAppearanceLabel,
  formatUserError,
  getModelDownloadUrl,
  type ModelAsset,
} from "@/lib/api";
import { formatBytes } from "@/lib/validation";
import { AlertBanner, Badge, Button, Dialog } from "@/components/ui";

export interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  model: ModelAsset | null;
}

export function ExportDialog({ open, onClose, model }: ExportDialogProps) {
  const [downloaded, setDownloaded] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setDownloaded(false);
    setCopiedUrl(false);
    setDownloading(false);
    setDownloadError(null);
    return () => requestRef.current?.abort();
  }, [open, model?.id]);

  if (!model) {
    return (
      <Dialog open={open} onClose={onClose} title="Export 3D Model">
        <p className="text-xs text-ink-secondary">No 3D model is currently selected.</p>
      </Dialog>
    );
  }

  const downloadUrl = getModelDownloadUrl(model);
  const safeFilename =
    model.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "vision3d-model";
  const appearanceLabel = formatAppearanceLabel(model.appearance);

  const handleDownloadGlb = async () => {
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setDownloading(true);
    setDownloaded(false);
    setDownloadError(null);
    try {
      const blob = await downloadModel(model, controller.signal);
      if (controller.signal.aborted) return;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${safeFilename}.glb`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setDownloaded(true);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch (err) {
      if (!controller.signal.aborted) setDownloadError(formatUserError(err).message);
    } finally {
      if (!controller.signal.aborted) setDownloading(false);
    }
  };

  const handleCopyUrl = async () => {
    try {
      const fullUrl =
        downloadUrl.startsWith("http") || typeof window === "undefined"
          ? downloadUrl
          : `${window.location.origin}${downloadUrl}`;
      await navigator.clipboard.writeText(fullUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // Ignore clipboard errors
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Export 3D Model"
      eyebrow={
        <>
          <FileBox className="h-3.5 w-3.5" />
          <span>Asset Export</span>
        </>
      }
      description="Download the validated 3D mesh for Blender, Three.js, Unity, Unreal Engine, or web viewers."
      footer={
        <>
          <Button variant="secondary" size="md" onClick={handleCopyUrl}>
            {copiedUrl ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>Copied URL</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-ink-secondary" />
                <span>Copy Asset URL</span>
              </>
            )}
          </Button>
          <Button variant="primary" size="md" loading={downloading} onClick={() => void handleDownloadGlb()}>
            {downloaded ? (
              <>
                <Check className="h-4 w-4" />
                <span>Download Started</span>
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                <span>{downloading ? "Preparing Download…" : "Download GLB"}</span>
              </>
            )}
          </Button>
        </>
      }
    >
      {downloadError && (
        <AlertBanner tone="error" title="Download failed" className="mb-3">
          {downloadError}
        </AlertBanner>
      )}
      {/* Asset Summary */}
      <div className="rounded-[12px] border border-border-subtle bg-obsidian/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-ink-primary truncate">
            {model.name}
          </span>
          <Badge tone={model.is_sample ? "copper" : "success"} dot>
            {model.is_sample ? "Sample GLB" : "Generated GLB"}
          </Badge>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-2.5 text-xs">
          <div className="rounded-[8px] border border-border-subtle/80 bg-panel px-3 py-2">
            <dt className="text-[10px] uppercase tracking-wider text-ink-muted">
              Format
            </dt>
            <dd className="mt-0.5 font-mono text-ink-primary">.glb (glTF 2.0)</dd>
          </div>
          <div className="rounded-[8px] border border-border-subtle/80 bg-panel px-3 py-2">
            <dt className="text-[10px] uppercase tracking-wider text-ink-muted">
              File Size
            </dt>
            <dd className="mt-0.5 text-ink-primary">
              {model.byte_size ? formatBytes(model.byte_size) : "Unknown"}
            </dd>
          </div>
          {appearanceLabel ? (
            <div className="rounded-[8px] border border-border-subtle/80 bg-panel px-3 py-2">
              <dt className="text-[10px] uppercase tracking-wider text-ink-muted">
                Surface
              </dt>
              <dd className="mt-0.5 text-ink-primary">{appearanceLabel}</dd>
            </div>
          ) : null}
          {typeof model.triangles === "number" ? (
            <div className="rounded-[8px] border border-border-subtle/80 bg-panel px-3 py-2">
              <dt className="text-[10px] uppercase tracking-wider text-ink-muted">
                Triangles
              </dt>
              <dd className="mt-0.5 text-ink-primary">
                {model.triangles.toLocaleString()}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      {/* Optional USDZ (only shown as downloadable if actually provided by backend) */}
      {model.usdz_url ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-[10px] border border-border-subtle bg-obsidian/50 px-3.5 py-2.5">
          <div>
            <p className="text-xs font-medium text-ink-primary">Apple USDZ</p>
            <p className="text-[11px] text-ink-secondary">
              Native iOS Quick Look package
            </p>
          </div>
          <a
            href={model.usdz_url}
            download={`${safeFilename}.usdz`}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[8px] border border-border-subtle bg-raised px-3 py-1.5 text-xs font-medium text-ink-primary hover:border-copper/50"
          >
            <Download className="h-3.5 w-3.5 text-copper" />
            Download USDZ
          </a>
        </div>
      ) : (
        <AlertBanner tone="info" className="mt-3">
          <span className="inline-flex items-center gap-1 text-ink-secondary">
            <Info className="hidden" />
            Export format is binary glTF (.glb). Separate USDZ, OBJ, and STL
            conversions are not enabled on this server.
          </span>
        </AlertBanner>
      )}
    </Dialog>
  );
}

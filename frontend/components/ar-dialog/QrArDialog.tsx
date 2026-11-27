"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Clock, Copy, ExternalLink, QrCode, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import {
  createShareLink,
  formatUserError,
  getPublicAppUrl,
  type ModelAsset,
} from "@/lib/api";
import { publicArUrl } from "@/lib/ar";
import { AlertBanner, Badge, Button, Dialog, Spinner } from "@/components/ui";

interface QrArDialogProps {
  open: boolean;
  onClose: () => void;
  model: ModelAsset | null;
}

function formatRemainingTime(expiresAt: string): string {
  const diffMs = Date.parse(expiresAt) - Date.now();
  if (diffMs <= 0) return "Expired";
  const mins = Math.ceil(diffMs / 60000);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `${hrs}h ${rem}m left` : `${hrs}h left`;
  }
  return `${mins} min left`;
}

export function QrArDialog({ open, onClose, model }: QrArDialogProps) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [expired, setExpired] = useState(false);
  const [remainingText, setRemainingText] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !model) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setQrImage(null);
    setShareUrl(null);
    setExpiresAt(null);
    setRemainingText(null);
    setCopied(false);
    setExpired(false);

    async function resolveShare(selected: ModelAsset) {
      try {
        let target: URL | null;
        let expiry: string | null = null;
        if (selected.is_sample) {
          target = publicArUrl(`${getPublicAppUrl() ?? ""}/ar/sample`);
        } else {
          const share = await createShareLink(selected.id, controller.signal);
          target = publicArUrl(share.mobile_url);
          expiry = share.expires_at ?? null;
          if (
            !target ||
            target.pathname !== `/ar/${encodeURIComponent(share.token)}` ||
            target.search ||
            target.hash ||
            !expiry ||
            !(Date.parse(expiry) > Date.now())
          ) {
            throw new Error(
              "The server did not return a valid expiring HTTPS link."
            );
          }
        }

        if (!target || controller.signal.aborted) return;
        const image = await QRCode.toDataURL(target.href, {
          margin: 4,
          width: 220,
          errorCorrectionLevel: "M",
          color: { dark: "#101011", light: "#F5F3F0" },
        });
        if (controller.signal.aborted) return;
        setShareUrl(target.href);
        setExpiresAt(expiry);
        setQrImage(image);
        if (expiry) setRemainingText(formatRemainingTime(expiry));
      } catch (err) {
        if (!controller.signal.aborted) setError(formatUserError(err).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void resolveShare(model);
    return () => controller.abort();
  }, [open, model, attempt]);

  useEffect(() => {
    if (!open || !expiresAt) return;
    function checkExpiry() {
      if (!expiresAt) return;
      if (Date.parse(expiresAt) <= Date.now()) {
        setExpired(true);
        setRemainingText("Expired");
      } else {
        setRemainingText(formatRemainingTime(expiresAt));
      }
    }
    const timer = window.setInterval(checkExpiry, 1000);
    checkExpiry();
    return () => window.clearInterval(timer);
  }, [open, expiresAt]);

  const handleCopy = async () => {
    if (!shareUrl || expired) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const previewUrl =
    model?.is_sample && !shareUrl ? "/ar/sample" : expired ? null : shareUrl;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="View in Your Space"
      eyebrow={
        <>
          <QrCode className="h-3.5 w-3.5" />
          <span>Phone AR Handoff</span>
        </>
      }
      description="Point your phone camera at the code to open this 3D model and launch native AR placement."
      footer={
        <>
          {shareUrl && !expired ? (
            <Button variant="secondary" size="md" onClick={handleCopy}>
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span>Copied Link</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 text-ink-secondary" />
                  <span>Copy AR Link</span>
                </>
              )}
            </Button>
          ) : null}

          {!loading && (error || expired) ? (
            <Button
              variant="secondary"
              size="md"
              onClick={() => setAttempt((n) => n + 1)}
            >
              {expired ? "Create New Link" : "Retry"}
            </Button>
          ) : null}

          {previewUrl ? (
            <Link
              href={previewUrl}
              onClick={onClose}
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[10px] bg-copper px-4 py-2 text-xs font-semibold text-ink-on-copper transition-colors hover:bg-copper-hover active:bg-copper-pressed"
            >
              <ExternalLink className="h-4 w-4" />
              <span>Open Mobile AR Page</span>
            </Link>
          ) : null}
        </>
      }
    >
      {loading && (
        <div className="flex h-52 flex-col items-center justify-center gap-2.5 rounded-[12px] border border-border-subtle bg-obsidian/65 text-xs text-ink-secondary">
          <Spinner size="md" label="Generating expiring share link" />
          <span>Creating expiring mobile AR link…</span>
        </div>
      )}

      {!loading && error && (
        <AlertBanner tone="error" title="Could not create AR share link">
          {error}
        </AlertBanner>
      )}

      {!loading && !error && !expired && qrImage && (
        <div className="rounded-[14px] border border-border-subtle bg-obsidian/70 p-4">
          <div className="flex flex-col items-center">
            <div className="rounded-[12px] border border-border-subtle bg-[#F5F3F0] p-2 shadow-sm">
              {/* QR data is generated locally from the validated HTTPS URL. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrImage}
                width={208}
                height={208}
                alt="QR code for mobile AR page"
                className="block rounded-[8px]"
              />
            </div>

            {remainingText ? (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <Badge tone="neutral">
                  <Clock className="h-3 w-3 text-copper" />
                  <span>{remainingText}</span>
                </Badge>
                <Badge tone="neutral">Read-only share</Badge>
              </div>
            ) : null}
          </div>

          <ol className="mt-4 grid grid-cols-1 gap-2 border-t border-border-subtle/70 pt-3.5 text-[11px] text-ink-secondary sm:grid-cols-2">
            <li className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-copper/40 bg-copper/12 font-mono text-[10px] font-semibold text-copper">
                1
              </span>
              <span>Open your phone camera and scan the QR code.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-copper/40 bg-copper/12 font-mono text-[10px] font-semibold text-copper">
                2
              </span>
              <span>Tap View in Your Space on iOS or Android.</span>
            </li>
          </ol>

          {expiresAt ? (
            <p className="mt-2.5 text-center text-[10px] text-ink-muted">
              Anyone with this link can view it until{" "}
              {new Date(expiresAt).toLocaleString()}.
            </p>
          ) : null}
        </div>
      )}

      {!loading && !error && !shareUrl && (
        <AlertBanner
          tone="warning"
          title="HTTPS public URL required for phone QR scanning"
        >
          QR codes are not generated for{" "}
          <code className="text-ink-primary">localhost</code> or plain HTTP URLs
          because phones cannot reach loopback addresses. Configure{" "}
          <code className="text-ink-primary">NEXT_PUBLIC_PUBLIC_APP_URL</code>{" "}
          with an HTTPS tunnel or deployed domain.
        </AlertBanner>
      )}

      {expired ? (
        <AlertBanner tone="warning" title="This share link expired">
          Create a new link to open this model on your phone.
        </AlertBanner>
      ) : null}

      {/* Device compatibility & native AR honesty note */}
      <div className="mt-3.5 flex items-start gap-2 rounded-[10px] border border-border-subtle bg-obsidian/50 px-3 py-2.5 text-[11px] leading-relaxed text-ink-muted">
        <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-secondary" />
        <span>
          <strong className="text-ink-secondary">
            iPhone (Safari Quick Look) &amp; Android (Chrome ARCore / WebXR):
          </strong>{" "}
          Floor tracking, placement, rotation, and pinch-to-scale are managed by
          the device&apos;s native AR viewer. Scale is estimated from one photo.
        </span>
      </div>
    </Dialog>
  );
}

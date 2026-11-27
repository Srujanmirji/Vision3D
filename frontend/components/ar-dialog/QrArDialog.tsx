"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Smartphone,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import {
  createShareLink,
  formatUserError,
  getPublicAppUrl,
  isHttpsUrl,
  isLocalhostUrl,
  type ModelAsset,
} from "@/lib/api";

interface QrArDialogProps {
  open: boolean;
  onClose: () => void;
  model: ModelAsset | null;
}

export function QrArDialog({ open, onClose, model }: QrArDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Sync open prop with native <dialog> top-layer modal API
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Fallback light-dismiss for Safari where <dialog closedby="any"> is unsupported
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if ("closedBy" in HTMLDialogElement.prototype) return;

    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };

    let pressedOutside = false;
    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener("pointerdown", onPointerDown);
    dialog.addEventListener("pointerup", onPointerUp);
    return () => {
      dialog.removeEventListener("pointerdown", onPointerDown);
      dialog.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  // Resolve mobile AR link & render QR SVG when dialog opens
  useEffect(() => {
    if (!open || !model) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setQrSvg(null);
    setShareUrl(null);
    setExpiresAt(null);

    const resolveShare = async () => {
      try {
        let targetUrl: string;
        if (model.is_sample) {
          const base = getPublicAppUrl() ?? "http://localhost:3000";
          targetUrl = `${base}/ar/sample`;
        } else {
          const res = await createShareLink(model.id, controller.signal);
          targetUrl = res.mobile_url;
          setExpiresAt(res.expires_at ?? null);
        }

        setShareUrl(targetUrl);

        // Per AR.md: Do not encode localhost in QR
        if (!isLocalhostUrl(targetUrl) && isHttpsUrl(targetUrl)) {
          const svg = await QRCode.toString(targetUrl, {
            type: "svg",
            margin: 1,
            width: 208,
            color: {
              dark: "#101011",
              light: "#F5F3F0",
            },
          });
          setQrSvg(svg);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError(formatUserError(err).message);
        }
      } finally {
        setLoading(false);
      }
    };

    void resolveShare();
    return () => controller.abort();
  }, [open, model]);

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const localOrHttp =
    shareUrl !== null && (isLocalhostUrl(shareUrl) || !isHttpsUrl(shareUrl));
  const localPreviewPath = model?.is_sample
    ? "/ar/sample"
    : shareUrl?.includes("/ar/")
    ? `/ar/${shareUrl.split("/ar/")[1]}`
    : null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={() => {
        if (dialogRef.current) {
          dialogRef.current.returnValue = "";
        }
        onClose();
      }}
      className="v3d-dialog"
      {...({ closedby: "any" } as Record<string, string>)}
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-copper">
              <Smartphone className="h-3.5 w-3.5" />
              <span>Mobile AR</span>
            </div>
            <h1 id={titleId} className="mt-1 text-lg font-semibold text-ink-primary">
              View in Augmented Reality
            </h1>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close AR dialog"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border-subtle bg-raised text-ink-secondary transition-colors hover:text-ink-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-ink-secondary">
          Scan on iPhone (Safari Quick Look) or Android (Chrome Scene Viewer / WebXR)
          to place this 3D model in your space.
        </p>

        <div className="mt-5">
          {loading && (
            <div className="flex h-52 flex-col items-center justify-center rounded-2xl border border-border-subtle bg-obsidian/60 text-xs text-ink-secondary">
              Generating expiring share link…
            </div>
          )}

          {!loading && error && (
            <div
              role="alert"
              className="rounded-2xl border border-copper/35 bg-copper/10 p-4 text-xs text-ink-primary"
            >
              <p className="font-semibold">Could not create AR share link</p>
              <p className="mt-1 text-ink-secondary">{error}</p>
            </div>
          )}

          {!loading && !error && qrSvg && (
            <div className="flex flex-col items-center rounded-2xl border border-border-subtle bg-obsidian/60 p-5">
              <div
                className="overflow-hidden rounded-xl bg-ink-primary p-3"
                aria-label="QR code for mobile AR page"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              {expiresAt && (
                <p className="mt-3 text-[11px] text-ink-muted">
                  Link expires at {new Date(expiresAt).toLocaleTimeString()}
                </p>
              )}
            </div>
          )}

          {!loading && !error && localOrHttp && (
            <div className="rounded-2xl border border-copper/35 bg-obsidian/70 p-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-copper" />
                <div className="text-xs leading-relaxed text-ink-secondary">
                  <p className="font-semibold text-ink-primary">
                    HTTPS public URL required for phone QR scanning
                  </p>
                  <p className="mt-1">
                    QR codes are not generated for <code className="text-ink-primary">localhost</code>{" "}
                    or plain HTTP URLs because phones cannot reach local loopback
                    addresses. Configure{" "}
                    <code className="text-ink-primary">NEXT_PUBLIC_PUBLIC_APP_URL</code>{" "}
                    with an HTTPS tunnel or deployed domain.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          {shareUrl && !localOrHttp && (
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-xl border border-border-subtle bg-raised px-4 py-2 text-xs font-medium text-ink-primary transition-colors hover:border-border-strong"
            >
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
            </button>
          )}

          {localPreviewPath && (
            <Link
              href={localPreviewPath}
              onClick={() => dialogRef.current?.close()}
              className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-xl bg-copper px-4 py-2 text-xs font-semibold text-ink-on-copper transition-colors hover:bg-copper-hover active:bg-copper-pressed"
            >
              <ExternalLink className="h-4 w-4" />
              <span>Open Mobile AR Page</span>
            </Link>
          )}
        </div>

        <p className="mt-4 text-[11px] text-ink-muted">
          Native AR controls are managed by iOS Quick Look and Android Scene Viewer.
          Model dimensions are estimated; pinch to scale on device.
        </p>
      </div>
    </dialog>
  );
}

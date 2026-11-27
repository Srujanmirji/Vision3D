"use client";

import { useEffect, useState } from "react";
import { Clock, RefreshCw, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { createCapture, formatUserError, getCaptureJob } from "@/lib/api";
import { publicArUrl } from "@/lib/ar";
import { AlertBanner, Badge, Button, Dialog, Spinner } from "@/components/ui";

const POLL_MS = 2000;

interface PhoneCaptureDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called once the phone has sent its photo and the job exists in this session. */
  onJob: (jobId: string) => void;
}

interface Pairing {
  token: string;
  url: string;
  expiresAt: number;
  qrImage: string;
}

function minutesLeft(expiresAt: number): string {
  const ms = expiresAt - Date.now();
  return ms <= 0 ? "Expired" : `${Math.ceil(ms / 60000)} min left`;
}

export function PhoneCaptureDialog({ open, onClose, onJob }: PhoneCaptureDialogProps) {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [remaining, setRemaining] = useState("");
  const [attempt, setAttempt] = useState(0);

  // Create a fresh link each time the dialog opens (or the user asks for a new code).
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setPairing(null);
    setError(null);
    setExpired(false);

    (async () => {
      try {
        const session = await createCapture(controller.signal);
        const target = publicArUrl(session.capture_url);
        const expiresAt = Date.parse(session.expires_at);
        if (
          !target ||
          target.pathname !== `/capture/${encodeURIComponent(session.token)}` ||
          target.search || target.hash || !(expiresAt > Date.now())
        ) {
          throw new Error("The server did not return a valid expiring HTTPS link.");
        }
        const qrImage = await QRCode.toDataURL(target.href, {
          margin: 4,
          width: 220,
          errorCorrectionLevel: "M",
          color: { dark: "#101011", light: "#F5F3F0" },
        });
        if (!controller.signal.aborted) {
          setPairing({ token: session.token, url: target.href, expiresAt, qrImage });
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const { code, message } = formatUserError(err);
        setError(
          code === "CAPTURE_UNAVAILABLE"
            ? "Phone capture works on the public HTTPS site, so your phone can reach it. It is not available on this local address."
            : message
        );
      }
    })();
    return () => controller.abort();
  }, [open, attempt]);

  // Wait for the phone's photo; hand the job over as soon as it exists.
  useEffect(() => {
    if (!open || !pairing || expired) return;
    const controller = new AbortController();
    let timer: number | undefined;

    async function poll() {
      if (!pairing || controller.signal.aborted) return;
      if (Date.now() >= pairing.expiresAt) {
        setExpired(true);
        return;
      }
      setRemaining(minutesLeft(pairing.expiresAt));
      try {
        const jobId = await getCaptureJob(pairing.token, controller.signal);
        if (controller.signal.aborted) return;
        if (jobId) {
          onJob(jobId);
          return;
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const { code } = formatUserError(err);
        // Transient network trouble: keep waiting. Anything else ends this code.
        if (code !== "NETWORK_ERROR" && code !== "TIMEOUT") {
          setError(formatUserError(err).message);
          return;
        }
      }
      timer = window.setTimeout(poll, POLL_MS);
    }

    void poll();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, pairing, expired, onJob]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Take the photo with your phone"
      eyebrow={
        <>
          <Smartphone className="h-3.5 w-3.5" />
          <span>Phone Camera</span>
        </>
      }
      description="Scan the code with your phone camera, take the photo there, and it will appear here."
    >
      {error ? (
        <AlertBanner tone="error" title="Phone capture unavailable">
          {error}
        </AlertBanner>
      ) : !pairing ? (
        <div className="flex justify-center py-10">
          <Spinner label="Creating a phone link" />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-[12px] border border-border-subtle bg-obsidian/60 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pairing.qrImage}
            alt="QR code that opens the phone camera page"
            width={220}
            height={220}
            className={`rounded-[10px] ${expired ? "opacity-25" : ""}`}
          />
          <Badge tone={expired ? "neutral" : "copper"}>
            <Clock className="h-3 w-3" />
            {expired ? "Expired" : remaining || minutesLeft(pairing.expiresAt)}
          </Badge>
          {expired ? (
            <Button variant="secondary" size="md" onClick={() => setAttempt((n) => n + 1)}>
              <RefreshCw className="h-3.5 w-3.5" />
              New Code
            </Button>
          ) : (
            <p role="status" className="inline-flex items-center gap-2 text-xs text-ink-secondary">
              <Spinner size="sm" label="Waiting for your phone" />
              Waiting for your phone…
            </p>
          )}
          <p className="text-center text-[11px] text-ink-secondary">
            Phone and computer can be on different networks. The code works once and only for this session.
          </p>
        </div>
      )}
    </Dialog>
  );
}

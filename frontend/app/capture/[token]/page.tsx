"use client";

import { use, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ImagePlus, Monitor, Send } from "lucide-react";
import { formatUserError, getCaptureInfo, sendCapture } from "@/lib/api";
import { DEFAULT_MAX_UPLOAD_BYTES, validateImageFile, type ValidatedImageInfo } from "@/lib/validation";
import { PhotoTips } from "@/components/upload/PhotoTips";
import { originalPhotoLimit } from "@/lib/uploadImage";
import { AlertBanner, Button, Checkbox, Spinner } from "@/components/ui";

type Stage = "checking" | "ready" | "sending" | "sent" | "closed";

interface CapturePageProps {
  params: Promise<{ token: string }>;
}

export default function PhoneCapturePage({ params }: CapturePageProps) {
  const { token } = use(params);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("checking");
  const [closedReason, setClosedReason] = useState("");
  const [photo, setPhoto] = useState<ValidatedImageInfo | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getCaptureInfo(token, controller.signal)
      .then((info) => {
        if (info.received) {
          setClosedReason("A photo was already sent with this code. Scan a new code on your computer to send another.");
          setStage("closed");
        } else {
          setStage("ready");
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        const { code, message } = formatUserError(err);
        setClosedReason(
          code === "NOT_FOUND"
            ? "This code is not valid. Scan the code shown on your computer again."
            : message
        );
        setStage("closed");
      });
    return () => controller.abort();
  }, [token]);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.previewUrl);
  }, [photo]);

  async function choose(file?: File) {
    if (!file) return;
    setError(null);
    const result = await validateImageFile(file, originalPhotoLimit(DEFAULT_MAX_UPLOAD_BYTES));
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setPhoto(result.data);
  }

  async function send() {
    if (!photo || !consent) return;
    setStage("sending");
    setError(null);
    try {
      await sendCapture(token, photo.file, { allow_external_processing: true });
      setStage("sent");
    } catch (err) {
      const { code, message } = formatUserError(err);
      if (code === "CAPTURE_USED" || code === "EXPIRED") {
        setClosedReason(message);
        setStage("closed");
      } else {
        setError(message);
        setStage("ready");
      }
    }
  }

  return (
    <div className="studio-ambient-bg flex min-h-dvh flex-col bg-obsidian text-ink-primary">
      <header className="border-b border-border-subtle px-4 py-3">
        <p className="text-sm font-semibold">Vision3D · Phone camera</p>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <input
          ref={cameraRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="sr-only"
          aria-label="Take a photo with the camera"
          tabIndex={-1}
          onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Choose a photo from the gallery"
          tabIndex={-1}
          onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }}
        />

        {stage === "checking" && (
          <div className="flex justify-center py-16">
            <Spinner label="Checking the code" />
          </div>
        )}

        {stage === "closed" && (
          <AlertBanner tone="error" title="This code can't be used">
            {closedReason}
          </AlertBanner>
        )}

        {stage === "sent" && (
          <section className="flex flex-col items-center gap-3 rounded-[16px] border border-border-subtle bg-panel px-5 py-8 text-center">
            <CheckCircle2 aria-hidden className="h-10 w-10 text-emerald-400" />
            <h1 className="text-lg font-semibold">Photo sent</h1>
            <p className="inline-flex items-center gap-2 text-sm text-ink-secondary">
              <Monitor aria-hidden className="h-4 w-4" />
              Your 3D model is being generated on your computer. You can close this page.
            </p>
          </section>
        )}

        {(stage === "ready" || stage === "sending") && (
          <>
            <div>
              <h1 className="text-lg font-semibold">Take a photo for your 3D model</h1>
              <p className="mt-1 text-sm text-ink-secondary">
                It will appear on your computer once you send it.
              </p>
            </div>

            {photo ? (
              <figure className="overflow-hidden rounded-[14px] border border-border-subtle bg-panel">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.previewUrl} alt="Photo to send" className="max-h-[50dvh] w-full object-contain" />
                <figcaption className="px-3 py-2 text-xs text-ink-secondary">
                  {photo.width} × {photo.height}
                  {photo.warning ? ` · ${photo.warning}` : ""}
                </figcaption>
              </figure>
            ) : (
              <PhotoTips />
            )}

            {error && <AlertBanner tone="error">{error}</AlertBanner>}

            <div className="grid grid-cols-2 gap-2">
              <Button variant={photo ? "secondary" : "primary"} size="lg" disabled={stage === "sending"} onClick={() => cameraRef.current?.click()}>
                <Camera className="h-4 w-4" />
                {photo ? "Retake" : "Take Photo"}
              </Button>
              <Button variant="secondary" size="lg" disabled={stage === "sending"} onClick={() => galleryRef.current?.click()}>
                <ImagePlus className="h-4 w-4" />
                Gallery
              </Button>
            </div>

            {photo && (
              <>
                <Checkbox
                  label="Send this photo (location and camera data removed) to the hosted 3D AI provider. Hidden sides are inferred, not measured."
                  checked={consent}
                  onCheckedChange={setConsent}
                  disabled={stage === "sending"}
                />
                <Button variant="primary" size="lg" disabled={!consent} loading={stage === "sending"} onClick={() => void send()}>
                  <Send className="h-4 w-4" />
                  {stage === "sending" ? "Sending…" : "Send to Computer"}
                </Button>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, ImagePlus, RefreshCw, ShieldCheck } from "lucide-react";
import { AlertBanner, Badge, Button, Dialog, Spinner } from "@/components/ui";

export function cameraErrorMessage(error: unknown): string {
  switch ((error as DOMException | undefined)?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera access was denied. Allow it in your browser settings or choose a photo from your gallery.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No usable camera was found. Choose a photo from your gallery.";
    case "NotReadableError":
    case "AbortError":
      return "The camera could not start. Close other apps using it or choose a photo from your gallery.";
    default:
      return "The camera preview is unavailable. Use your device camera or choose a photo from your gallery.";
  }
}

interface CapturedFrame {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
}

interface CameraCaptureProps {
  onClose: () => void;
  onCapture: (file: File) => void;
  onGallery: () => void;
  onNativeCamera: () => void;
}

export function CameraCaptureDialog({
  onClose,
  onCapture,
  onGallery,
  onNativeCamera,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const active = useRef(false);
  const previewUrlRef = useRef<string | null>(null);

  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [sessionId, setSessionId] = useState(0);
  const [captured, setCaptured] = useState<CapturedFrame | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearCapturedPreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setCaptured(null);
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (captured) {
      stop();
      return;
    }

    active.current = true;
    let disposed = false;
    const video = videoRef.current;
    setReady(false);
    setError(null);
    setDenied(false);

    function cameraStopped() {
      stop();
      setReady(false);
      setError("The camera stopped. Reopen it or choose a photo from your gallery.");
    }

    function leavePage() {
      disposed = true;
      active.current = false;
      cameraStopped();
    }

    async function start() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !video) {
        setError(
          "Live camera preview requires HTTPS and a compatible browser. Use your device camera or gallery."
        );
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        stream
          .getVideoTracks()
          .forEach((track) =>
            track.addEventListener("ended", cameraStopped, { once: true })
          );
        video.srcObject = stream;
        await video.play();
        if (!disposed && streamRef.current === stream) setReady(true);
      } catch (cause) {
        if (disposed) return;
        stop();
        const errName = (cause as DOMException | undefined)?.name;
        setDenied(errName === "NotAllowedError" || errName === "SecurityError");
        setError(cameraErrorMessage(cause));
      }
    }

    window.addEventListener("pagehide", leavePage);
    void start();
    return () => {
      disposed = true;
      active.current = false;
      window.removeEventListener("pagehide", leavePage);
      stop();
      if (video) video.srcObject = null;
    };
  }, [captured, sessionId, stop]);

  function openPicker(picker: () => void) {
    stop();
    clearCapturedPreview();
    videoRef.current?.closest("dialog")?.close();
    picker();
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight || saving) return;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Could not capture a photo. Try your device camera or gallery.");
      return;
    }
    setSaving(true);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!active.current) return;
        setSaving(false);
        if (!blob) {
          setError("Could not save the photo. Try your device camera or gallery.");
          return;
        }
        stop();
        const file = new File([blob], "camera-photo.jpg", { type: blob.type });
        const previewUrl = URL.createObjectURL(file);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = previewUrl;
        setCaptured({
          file,
          previewUrl,
          width: canvas.width,
          height: canvas.height,
        });
      },
      "image/jpeg",
      0.9
    );
  }

  function handleConfirmPhoto() {
    if (!captured) return;
    const file = captured.file;
    clearCapturedPreview();
    onCapture(file);
  }

  function handleRetake() {
    clearCapturedPreview();
    setSessionId((n) => n + 1);
  }

  return (
    <Dialog
      open
      onClose={() => {
        stop();
        clearCapturedPreview();
        onClose();
      }}
      title={captured ? "Review captured photo" : "Capture object photo"}
      eyebrow={
        <>
          <Camera className="h-3.5 w-3.5" />
          <span>{captured ? "Photo Preview" : "Rear Camera"}</span>
        </>
      }
      description={
        captured
          ? "Check that the entire object is sharp and well-lit before continuing."
          : "Frame one opaque object in even light. Photos stay on your device until you tap Generate 3D."
      }
      footer={
        captured ? (
          <>
            <Button variant="secondary" size="md" onClick={handleRetake}>
              <RefreshCw className="h-4 w-4 text-ink-secondary" />
              Retake
            </Button>
            <Button variant="primary" size="md" onClick={handleConfirmPhoto}>
              <Check className="h-4 w-4" />
              Use Photo
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" size="md" onClick={() => openPicker(onGallery)}>
              <ImagePlus className="h-4 w-4 text-ink-secondary" />
              Choose from Gallery
            </Button>
            {error ? (
              <>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => openPicker(onNativeCamera)}
                >
                  <Camera className="h-4 w-4 text-ink-secondary" />
                  Use Device Camera
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => setSessionId((n) => n + 1)}
                >
                  <RefreshCw className="h-4 w-4" />
                  Retry
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                size="md"
                disabled={!ready}
                loading={saving}
                onClick={capture}
              >
                <Camera className="h-4 w-4" />
                Capture Photo
              </Button>
            )}
          </>
        )
      }
    >
      {captured ? (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-[12px] border border-border-subtle bg-obsidian">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={captured.previewUrl}
              alt="Captured object photo preview"
              className="max-h-[44dvh] w-full object-contain"
            />
            <div className="absolute left-3 top-3">
              <Badge tone="copper">
                {captured.width} × {captured.height}px · JPEG
              </Badge>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-ink-muted">
            EXIF metadata is stripped automatically on upload before inference.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Live Viewfinder Frame */}
          <div
            hidden={Boolean(error)}
            className="relative overflow-hidden rounded-[12px] border border-border-subtle bg-obsidian min-h-[220px]"
          >
            <video
              ref={videoRef}
              aria-label="Live camera preview"
              muted
              autoPlay
              playsInline
              className="max-h-[44dvh] w-full object-contain"
            />

            {/* Subtle studio framing brackets when live feed is ready */}
            {ready ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-4"
              >
                <span className="absolute left-0 top-0 h-5 w-5 rounded-tl-[6px] border-l-2 border-t-2 border-copper/55" />
                <span className="absolute right-0 top-0 h-5 w-5 rounded-tr-[6px] border-r-2 border-t-2 border-copper/55" />
                <span className="absolute bottom-0 left-0 h-5 w-5 rounded-bl-[6px] border-b-2 border-l-2 border-copper/55" />
                <span className="absolute bottom-0 right-0 h-5 w-5 rounded-br-[6px] border-b-2 border-r-2 border-copper/55" />
              </div>
            ) : (
              <div
                role="status"
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-[12px] border border-copper/35 bg-copper/12">
                  <Spinner size="md" label="Starting camera" />
                </div>
                <div>
                  <p className="text-xs font-medium text-ink-primary">
                    Waiting for camera permission…
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-secondary">
                    Tap Allow in your browser prompt to open the rear camera.
                  </p>
                </div>
              </div>
            )}
          </div>

          {error ? (
            <div className="space-y-3">
              <AlertBanner tone="warning" title="Camera unavailable">
                {error}
              </AlertBanner>
              {denied ? (
                <div className="rounded-[10px] border border-border-subtle bg-obsidian/60 p-3.5 text-[11px] leading-relaxed text-ink-secondary">
                  <p className="font-medium text-ink-primary">
                    How to re-enable camera access
                  </p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4">
                    <li>
                      <strong className="text-ink-primary">iOS Safari:</strong> Tap{" "}
                      <span className="font-mono">AA</span> or the site settings icon in
                      the address bar → Website Settings → Camera → Allow.
                    </li>
                    <li>
                      <strong className="text-ink-primary">Android Chrome:</strong> Tap
                      the lock/tune icon beside the URL → Permissions → Camera → Allow.
                    </li>
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-[10px] border border-border-subtle bg-obsidian/55 px-3 py-2 text-[11px] text-ink-secondary">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-copper" />
              <span>
                Best results: center one object on a plain surface with even light.
                Camera stops immediately after capture.
              </span>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

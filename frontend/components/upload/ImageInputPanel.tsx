"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, Smartphone, Sparkles, Upload, X } from "lucide-react";
import { CameraCaptureDialog } from "./CameraCaptureDialog";
import { PhotoTips } from "./PhotoTips";
import { originalPhotoLimit } from "@/lib/uploadImage";
import { PhoneCaptureDialog } from "./PhoneCaptureDialog";
import { ShapeModeSelect } from "./ShapeModeSelect";
import type { GenerationMode, ProviderCapability } from "@/lib/api";
import {
  DEFAULT_MAX_UPLOAD_BYTES,
  formatBytes,
  validateImageFile,
  type ValidatedImageInfo,
} from "@/lib/validation";
import {
  AlertBanner,
  Button,
  Checkbox,
  CopperSwitch,
  Select,
} from "@/components/ui";

interface ImageInputPanelProps {
  uploadedImage: ValidatedImageInfo | null;
  onImageValidated: (image: ValidatedImageInfo) => void;
  onClearImage: () => void;
  verifiedProviders: ProviderCapability[];
  selectedProvider: string;
  onProviderChange: (providerId: string) => void;
  removeBackground: boolean;
  onRemoveBackgroundChange: (enabled: boolean) => void;
  allowExternalProcessing: boolean;
  /** False when the server generates on its own machine only; the consent checkbox is then hidden. */
  consentRequired?: boolean;
  /** Shape modes this server offers ("auto" plus any of "round" / "box"). */
  modes?: GenerationMode[];
  mode?: GenerationMode;
  onModeChange?: (mode: GenerationMode) => void;
  onAllowExternalProcessingChange: (allowed: boolean) => void;
  maxUploadBytes?: number;
  isGenerating: boolean;
  generationBlocked?: boolean;
  onGenerate: () => void;
  /** A photo sent from a phone has started this job in the current session. */
  onPhoneJob: (jobId: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export function ImageInputPanel({
  uploadedImage,
  onImageValidated,
  onClearImage,
  verifiedProviders,
  selectedProvider,
  onProviderChange,
  removeBackground,
  onRemoveBackgroundChange,
  allowExternalProcessing,
  consentRequired = true,
  modes = ["auto"],
  mode = "auto",
  onModeChange,
  onAllowExternalProcessingChange,
  maxUploadBytes = DEFAULT_MAX_UPLOAD_BYTES,
  isGenerating,
  generationBlocked = false,
  onGenerate,
  onPhoneJob,
  fileInputRef,
}: ImageInputPanelProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const activeProvider = verifiedProviders.find((p) => p.id === selectedProvider);
  const showProviderSelector = verifiedProviders.length > 1;
  const showBgRemovalToggle = Boolean(activeProvider?.supports_background_removal);

  const handleFile = async (file?: File) => {
    if (isGenerating || !file) return;
    setValidationError(null);
    const result = await validateImageFile(file, originalPhotoLimit(maxUploadBytes));
    if (!result.ok) {
      setValidationError(result.error.message);
      return;
    }
    onImageValidated(result.data);
  };

  return (
    <aside
      aria-label="Input image and generation settings"
      className="flex flex-col rounded-[16px] border border-border-subtle bg-panel p-5"
    >
      {/* Hidden File Picker & Mobile Environment Camera Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label="Choose image file"
        tabIndex={-1}
        disabled={isGenerating}
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        aria-label="Capture photo with camera"
        tabIndex={-1}
        disabled={isGenerating}
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {/* Input Image Section */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink-primary">Input Image</h2>
          <span className="text-[11px] text-ink-secondary">
            JPEG, PNG, WebP · ≤ {formatBytes(originalPhotoLimit(maxUploadBytes))}
          </span>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            void handleFile(e.dataTransfer.files[0]);
          }}
          className={`mt-3 rounded-[12px] border border-dashed p-3.5 transition-colors ${
            dragActive
              ? "border-copper bg-copper/8"
              : "border-border-subtle bg-obsidian/50"
          }`}
        >
          {uploadedImage ? (
            <div className="flex items-center gap-3.5">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[10px] border border-border-subtle bg-raised">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={uploadedImage.previewUrl}
                  alt="Selected input preview"
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={onClearImage}
                  disabled={isGenerating}
                  aria-label="Remove uploaded image"
                  className="absolute right-0 top-0 flex size-11 items-start justify-end rounded-[8px] p-1 text-ink-primary disabled:opacity-40"
                >
                  <span className="grid size-6 place-items-center rounded-full bg-obsidian/85"><X className="h-3.5 w-3.5" /></span>
                </button>
              </div>

              <div className="min-w-0 flex-1 space-y-1.5">
                <p
                  className="truncate text-xs font-medium text-ink-primary"
                  title={uploadedImage.file.name}
                >
                  {uploadedImage.file.name}
                </p>
                <p className="text-[11px] text-ink-secondary">
                  {uploadedImage.width} × {uploadedImage.height} ·{" "}
                  {formatBytes(uploadedImage.sizeBytes)}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isGenerating}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus className="h-3.5 w-3.5 text-ink-secondary" />
                    Change Image
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isGenerating}
                    onClick={() => setCameraOpen(true)}
                  >
                    <Camera className="h-3.5 w-3.5 text-ink-secondary" />
                    Retake Photo
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-4 text-center">
              <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-[10px] border border-border-subtle bg-raised text-ink-secondary">
                <Upload className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <p className="text-xs font-medium text-ink-primary">
                Drop an object photo here
              </p>
              <p className="mt-1 text-[11px] text-ink-secondary">
                Single opaque foreground object works best
              </p>
              <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isGenerating}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="h-3.5 w-3.5 text-copper" />
                  Browse Files
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isGenerating}
                  onClick={() => setCameraOpen(true)}
                >
                  <Camera className="h-3.5 w-3.5 text-ink-secondary" />
                  Take Photo
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="hidden md:inline-flex"
                  disabled={isGenerating}
                  onClick={() => setPhoneOpen(true)}
                >
                  <Smartphone className="h-3.5 w-3.5 text-ink-secondary" />
                  Use Phone
                </Button>
              </div>
            </div>
          )}
        </div>

        {validationError ? (
          <AlertBanner tone="error" className="mt-3">
            {validationError}
          </AlertBanner>
        ) : null}

        {uploadedImage?.warning ? (
          <AlertBanner tone="info" className="mt-3">
            {uploadedImage.warning}
          </AlertBanner>
        ) : null}

        <PhotoTips />
      </div>

      <hr className="my-5 border-border-subtle/80" />

      {/* Model Settings — strictly capability-gated */}
      <div className="space-y-3.5">
        <h2 className="text-sm font-semibold text-ink-primary">Model Settings</h2>

        {showProviderSelector && (
          <Select
            id="provider-select"
            label="Verified Provider"
            value={selectedProvider}
            disabled={isGenerating}
            onChange={(e) => onProviderChange(e.target.value)}
            options={verifiedProviders.map((p) => ({
              value: p.id,
              label: p.label,
            }))}
          />
        )}

        {verifiedProviders.length === 1 && activeProvider && (
          <div className="rounded-[10px] border border-border-subtle bg-obsidian/55 px-3.5 py-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-ink-secondary">
              Verified Provider
            </p>
            <p className="mt-1 text-xs font-medium text-ink-primary">
              {activeProvider.label}
            </p>
          </div>
        )}

        {onModeChange && (
          <ShapeModeSelect
            id="shape-mode"
            modes={modes}
            value={mode}
            onChange={onModeChange}
            disabled={isGenerating}
          />
        )}

        {showBgRemovalToggle && mode === "auto" && (
          <div className="flex items-center justify-between rounded-[10px] border border-border-subtle bg-obsidian/55 px-3.5 py-2.5">
            <CopperSwitch
              id="bg-removal-switch"
              label="Background Removal"
              labelClassName="text-xs font-medium text-ink-primary"
              checked={removeBackground}
              disabled={isGenerating}
              onCheckedChange={onRemoveBackgroundChange}
            />
          </div>
        )}

        {verifiedProviders.length === 0 && (
          <div className="rounded-[10px] border border-border-subtle bg-obsidian/55 px-3.5 py-2.5 text-xs leading-relaxed text-ink-secondary">
            <p className="font-medium text-ink-primary">Server-side provider pending</p>
            <p className="mt-1 text-[11px]">
              Provider options appear automatically once the backend verifies an
              active image-to-3D endpoint.
            </p>
          </div>
        )}

        {consentRequired ? (
          /* Photos may reach a hosted provider (a configured fallback): ask first. */
          <div className="rounded-[10px] border border-border-subtle bg-obsidian/55 px-3.5 py-3">
            <Checkbox
              id="external-processing-consent"
              checked={allowExternalProcessing}
              disabled={isGenerating}
              onCheckedChange={onAllowExternalProcessingChange}
              label={
                <span>
                  Allow server-side upload (EXIF stripped) to the hosted 3D inference
                  provider. Hidden surfaces are inferred, not measured.
                </span>
              }
            />
          </div>
        ) : (
          <p className="rounded-[10px] border border-border-subtle bg-obsidian/55 px-3.5 py-3 text-[11px] leading-relaxed text-ink-secondary">
            Your photo is processed on this server only (location data removed). Hidden
            surfaces are inferred, not measured.
          </p>
        )}
      </div>

      {/* Primary CTA */}
      <div className="mt-5 pt-2 lg:mt-auto">
        <Button
          variant="primary"
          size="lg"
          loading={isGenerating}
          disabled={!uploadedImage || (consentRequired && !allowExternalProcessing) || isGenerating || generationBlocked}
          onClick={onGenerate}
          className="w-full"
        >
          {!isGenerating ? <Sparkles className="h-4 w-4" strokeWidth={2} /> : null}
          <span>{isGenerating ? "Generating 3D…" : "Generate 3D"}</span>
        </Button>
      </div>
      {cameraOpen && !isGenerating && (
        <CameraCaptureDialog
          onClose={() => setCameraOpen(false)}
          onCapture={(file) => { setCameraOpen(false); void handleFile(file); }}
          onGallery={() => { fileInputRef.current?.click(); setCameraOpen(false); }}
          onNativeCamera={() => { cameraInputRef.current?.click(); setCameraOpen(false); }}
        />
      )}
      <PhoneCaptureDialog
        open={phoneOpen}
        onClose={() => setPhoneOpen(false)}
        onJob={(jobId) => {
          setPhoneOpen(false);
          onPhoneJob(jobId);
        }}
      />
    </aside>
  );
}

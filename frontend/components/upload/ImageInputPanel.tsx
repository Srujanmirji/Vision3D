"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  ImagePlus,
  Info,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import type { ProviderCapability } from "@/lib/api";
import {
  DEFAULT_MAX_UPLOAD_BYTES,
  formatBytes,
  validateImageFile,
  type ValidatedImageInfo,
} from "@/lib/validation";
import { CopperSwitch } from "@/components/ui/CopperSwitch";

interface ImageInputPanelProps {
  uploadedImage: ValidatedImageInfo | null;
  onImageValidated: (image: ValidatedImageInfo) => void;
  onClearImage: () => void;
  verifiedProviders: ProviderCapability[];
  selectedProvider: string;
  onProviderChange: (providerId: string) => void;
  removeBackground: boolean;
  onRemoveBackgroundChange: (enabled: boolean) => void;
  maxUploadBytes?: number;
  isGenerating: boolean;
  onGenerate: () => void;
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
  maxUploadBytes = DEFAULT_MAX_UPLOAD_BYTES,
  isGenerating,
  onGenerate,
  fileInputRef,
}: ImageInputPanelProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const activeProvider = verifiedProviders.find((p) => p.id === selectedProvider);
  const showProviderSelector = verifiedProviders.length > 1;
  const showBgRemovalToggle = Boolean(activeProvider?.supports_background_removal);

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setValidationError(null);
    const result = await validateImageFile(file, maxUploadBytes);
    if (!result.ok) {
      setValidationError(result.error.message);
      return;
    }
    onImageValidated(result.data);
  };

  return (
    <aside
      aria-label="Input image and generation settings"
      className="flex flex-col rounded-[20px] border border-border-subtle bg-panel p-5"
    >
      {/* Hidden File Picker & Mobile Environment Camera Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label="Choose image file"
        onChange={(e) => {
          void handleFiles(e.target.files);
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
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Input Image Section */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink-primary">Input Image</h2>
          <span className="text-[11px] text-ink-muted">
            JPEG, PNG, WebP · ≤ {formatBytes(maxUploadBytes)}
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
            void handleFiles(e.dataTransfer.files);
          }}
          className={`mt-3.5 rounded-2xl border border-dashed p-4 transition-colors ${
            dragActive
              ? "border-copper bg-copper/8"
              : "border-border-subtle bg-obsidian/45"
          }`}
        >
          {uploadedImage ? (
            <div className="flex items-center gap-4">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-border-subtle bg-raised">
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
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-obsidian/85 text-ink-primary transition-colors hover:bg-obsidian disabled:opacity-40"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="min-w-0 flex-1 space-y-2">
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
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isGenerating}
                  className="inline-flex min-h-[38px] items-center gap-2 rounded-xl border border-border-subtle bg-raised px-3 py-1.5 text-xs font-medium text-ink-primary transition-colors hover:border-border-strong hover:bg-[#2a2a2e] disabled:opacity-45"
                >
                  <ImagePlus className="h-3.5 w-3.5 text-ink-secondary" />
                  Change Image
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-4 text-center">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-border-subtle bg-raised text-ink-secondary">
                <Upload className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <p className="text-sm font-medium text-ink-primary">
                Drop an object photo here
              </p>
              <p className="mt-1 text-xs text-ink-secondary">
                Single opaque foreground object works best
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-border-subtle bg-raised px-3.5 py-2 text-xs font-medium text-ink-primary transition-colors hover:border-copper/50 hover:bg-[#2a2a2e]"
                >
                  <ImagePlus className="h-3.5 w-3.5 text-copper" />
                  Browse Files
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-border-subtle bg-raised px-3.5 py-2 text-xs font-medium text-ink-primary transition-colors hover:border-copper/50 hover:bg-[#2a2a2e]"
                >
                  <Camera className="h-3.5 w-3.5 text-ink-secondary" />
                  Take Photo
                </button>
              </div>
            </div>
          )}
        </div>

        {validationError && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-xl border border-copper/35 bg-copper/10 px-3 py-2.5 text-xs text-ink-primary"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-copper" />
            <span>{validationError}</span>
          </div>
        )}

        {uploadedImage?.warning && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-border-subtle bg-raised/70 px-3 py-2.5 text-xs text-ink-secondary">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-copper" />
            <span>{uploadedImage.warning}</span>
          </div>
        )}
      </div>

      {/* Divider */}
      <hr className="my-5 border-border-subtle/70" />

      {/* Model Settings — strictly capability-gated per DESIGN.md and AGENTS.md */}
      <div className="space-y-4">
        <h2 className="text-[15px] font-semibold text-ink-primary">Model Settings</h2>

        {showProviderSelector && (
          <div className="space-y-1.5">
            <label
              htmlFor="provider-select"
              className="block text-xs font-medium text-ink-secondary"
            >
              Verified Provider
            </label>
            <select
              id="provider-select"
              value={selectedProvider}
              onChange={(e) => onProviderChange(e.target.value)}
              disabled={isGenerating}
              className="w-full min-h-[42px] rounded-xl border border-border-subtle bg-raised px-3 py-2 text-sm text-ink-primary transition-colors hover:border-border-strong disabled:opacity-50"
            >
              {verifiedProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {verifiedProviders.length === 1 && activeProvider && (
          <div className="rounded-xl border border-border-subtle bg-raised/70 px-3.5 py-3">
            <p className="text-[11px] uppercase tracking-wider text-ink-muted">
              Verified Provider
            </p>
            <p className="mt-1 text-sm font-medium text-ink-primary">
              {activeProvider.label}
            </p>
          </div>
        )}

        {showBgRemovalToggle && (
          <div className="flex items-center justify-between rounded-xl border border-border-subtle bg-raised/60 px-3.5 py-3">
            <CopperSwitch
              id="bg-removal-switch"
              label="Background Removal"
              labelClassName="text-sm font-medium text-ink-primary"
              checked={removeBackground}
              disabled={isGenerating}
              onCheckedChange={onRemoveBackgroundChange}
            />
          </div>
        )}

        {verifiedProviders.length === 0 && (
          <div className="rounded-xl border border-border-subtle bg-obsidian/55 px-3.5 py-3 text-xs leading-relaxed text-ink-secondary">
            <p className="font-medium text-ink-primary">Server-side provider pending</p>
            <p className="mt-1">
              Provider options appear automatically once the backend verifies an
              active image-to-3D endpoint.
            </p>
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-ink-muted">
          Single-image 3D reconstruction infers hidden surfaces and does not
          measure exact physical dimensions. Uploaded photos are processed via the
          configured server-side inference service.
        </p>
      </div>

      {/* Primary Action — Sticky on mobile, pinned to panel bottom on desktop */}
      <div className="mt-6 pt-2 lg:mt-auto">
        <button
          type="button"
          onClick={onGenerate}
          disabled={!uploadedImage || isGenerating}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-copper px-5 py-3 text-sm font-semibold text-ink-on-copper transition-colors hover:bg-copper-hover active:bg-copper-pressed disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Sparkles className="h-4 w-4" strokeWidth={2} />
          <span>{isGenerating ? "Generating 3D…" : "Generate 3D"}</span>
        </button>
      </div>
    </aside>
  );
}

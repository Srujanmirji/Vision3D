"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/sidebar/AppShell";
import {
  ModelViewport,
  type WorkspaceStage,
} from "@/components/viewer/ModelViewport";
import { ImageInputPanel } from "@/components/upload/ImageInputPanel";
import { QrArDialog } from "@/components/ar-dialog/QrArDialog";
import {
  checkHealth,
  createJob,
  formatUserError,
  getModel,
  pollJobUntilDone,
  type ApiErrorPayload,
  type HealthResponse,
  type JobStatusResponse,
  type ModelAsset,
} from "@/lib/api";
import { SAMPLE_MODEL } from "@/lib/sample";
import { loadViewerPreferences } from "@/lib/preferences";
import type { ValidatedImageInfo } from "@/lib/validation";

export function CreateWorkspace() {
  const searchParams = useSearchParams();
  const requestedModelId = searchParams.get("model");
  const requestedSample = searchParams.get("sample");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollAbortRef = useRef<AbortController | null>(null);

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  const [stage, setStage] = useState<WorkspaceStage>("empty");
  const [uploadedImage, setUploadedImage] = useState<ValidatedImageInfo | null>(
    null
  );
  const [activeModel, setActiveModel] = useState<ModelAsset | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatusResponse | null>(null);
  const [error, setError] = useState<ApiErrorPayload | null>(null);

  const [selectedProvider, setSelectedProvider] = useState("");
  const [removeBackground, setRemoveBackground] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [arDialogOpen, setArDialogOpen] = useState(false);

  const verifiedProviders = (health?.providers ?? []).filter((p) => p.verified);

  // Load viewer preferences respecting prefers-reduced-motion
  useEffect(() => {
    const prefs = loadViewerPreferences();
    setAutoRotate(prefs.defaultAutoRotate);
  }, []);

  // Probe backend /health once on mount
  useEffect(() => {
    const controller = new AbortController();
    checkHealth(controller.signal)
      .then((res) => {
        setHealth(res);
        setBackendOnline(true);
        const firstVerified = (res.providers ?? []).find((p) => p.verified);
        if (firstVerified) {
          setSelectedProvider(firstVerified.id);
        }
      })
      .catch(() => {
        setBackendOnline(false);
      });
    return () => controller.abort();
  }, []);

  // Open requested model or sample from query string (?model=... or ?sample=1)
  useEffect(() => {
    if (requestedSample === "1") {
      setActiveModel(SAMPLE_MODEL);
      setStage("result");
      setError(null);
      return;
    }

    if (!requestedModelId) return;

    const controller = new AbortController();
    getModel(requestedModelId, controller.signal)
      .then((asset) => {
        setActiveModel(asset);
        setStage("result");
        setError(null);
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") {
          setError(formatUserError(err));
          setStage("error");
        }
      });

    return () => controller.abort();
  }, [requestedModelId, requestedSample]);

  // Cleanup object URLs and active pollers on unmount
  useEffect(() => {
    return () => {
      pollAbortRef.current?.abort();
    };
  }, []);

  const handleImageValidated = useCallback(
    (info: ValidatedImageInfo) => {
      if (uploadedImage) {
        URL.revokeObjectURL(uploadedImage.previewUrl);
      }
      setUploadedImage(info);
      setError(null);
      if (stage !== "result") {
        setStage("uploaded");
      }
    },
    [uploadedImage, stage]
  );

  const handleClearImage = useCallback(() => {
    if (uploadedImage) {
      URL.revokeObjectURL(uploadedImage.previewUrl);
    }
    setUploadedImage(null);
    if (!activeModel) {
      setStage("empty");
    }
  }, [uploadedImage, activeModel]);

  const handleLoadSample = useCallback(() => {
    pollAbortRef.current?.abort();
    setActiveModel(SAMPLE_MODEL);
    setError(null);
    setJobStatus(null);
    setStage("result");
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!uploadedImage) return;

    pollAbortRef.current?.abort();
    const controller = new AbortController();
    pollAbortRef.current = controller;

    setError(null);
    setActiveModel(null);
    setStage("processing");
    setJobStatus({ status: "queued", stage: "Submitting image to backend…" });

    try {
      const providerObj = verifiedProviders.find((p) => p.id === selectedProvider);
      const created = await createJob(
        uploadedImage.file,
        {
          provider: providerObj ? providerObj.id : undefined,
          remove_background: providerObj?.supports_background_removal
            ? removeBackground
            : undefined,
        },
        controller.signal
      );

      setJobStatus({
        job_id: created.job_id,
        status: created.status,
        stage: "Job accepted, waiting for inference worker…",
      });

      const finalStatus = await pollJobUntilDone(
        created.job_id,
        (update) => setJobStatus(update),
        controller.signal
      );

      if (finalStatus.status === "failed") {
        setError({
          code:
            finalStatus.error?.code ??
            finalStatus.error_code ??
            "PROVIDER_UNAVAILABLE",
          message:
            finalStatus.error?.message ??
            finalStatus.error_message ??
            "The 3D provider failed to generate a model.",
        });
        setStage("error");
        return;
      }

      if (!finalStatus.model_id) {
        setError({
          code: "INVALID_MODEL",
          message: "Job completed without returning a valid model identifier.",
        });
        setStage("error");
        return;
      }

      const modelAsset = await getModel(finalStatus.model_id, controller.signal);
      setActiveModel(modelAsset);
      setStage("result");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(formatUserError(err));
      setStage("error");
    }
  }, [uploadedImage, verifiedProviders, selectedProvider, removeBackground]);

  return (
    <AppShell backendOnline={backendOnline}>
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        {/* Top Title Header (matches design-reference.png) */}
        <header className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-ink-primary sm:text-[34px] sm:leading-tight">
              2D to <span className="text-copper">3D</span>
            </h1>
            <p className="mt-1 text-sm text-ink-secondary">
              Convert any image into a 3D model with interactive 360° view and mobile AR.
            </p>
          </div>
        </header>

        {/* Main 2-Column Workspace (Dominant Viewport + Right Input/Settings Panel) */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_336px] xl:grid-cols-[minmax(0,1fr)_356px]">
          <ModelViewport
            stage={stage}
            model={activeModel}
            uploadedImage={uploadedImage}
            jobStatus={jobStatus}
            error={error}
            autoRotate={autoRotate}
            onAutoRotateChange={setAutoRotate}
            onOpenArDialog={() => setArDialogOpen(true)}
            onLoadSample={handleLoadSample}
            onRetry={() => void handleGenerate()}
            onTriggerUpload={() => fileInputRef.current?.click()}
          />

          <ImageInputPanel
            uploadedImage={uploadedImage}
            onImageValidated={handleImageValidated}
            onClearImage={handleClearImage}
            verifiedProviders={verifiedProviders}
            selectedProvider={selectedProvider}
            onProviderChange={setSelectedProvider}
            removeBackground={removeBackground}
            onRemoveBackgroundChange={setRemoveBackground}
            maxUploadBytes={health?.max_upload_bytes}
            isGenerating={stage === "processing"}
            onGenerate={() => void handleGenerate()}
            fileInputRef={fileInputRef}
          />
        </div>
      </div>

      {/* Native Modal QR Dialog */}
      <QrArDialog
        open={arDialogOpen}
        onClose={() => setArDialogOpen(false)}
        model={activeModel}
      />
    </AppShell>
  );
}

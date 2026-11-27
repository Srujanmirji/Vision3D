"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/sidebar/AppShell";
import {
  ModelViewport,
  type WorkspaceStage,
} from "@/components/viewer/ModelViewport";
import { ImageInputPanel } from "@/components/upload/ImageInputPanel";
import { QrArDialog } from "@/components/ar-dialog/QrArDialog";
import { ExportDialog } from "@/components/export-dialog/ExportDialog";
import {
  cancelJob,
  Vision3DApiError,
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedJobId = searchParams.get("job");
  const requestedModelId = searchParams.get("model");
  const requestedSample = searchParams.get("sample");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const pollingBudget = useRef<number | undefined>(undefined);
  const previewRef = useRef<string | null>(null);

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  const [stage, setStage] = useState<WorkspaceStage>("empty");
  const [uploadedImage, setUploadedImage] = useState<ValidatedImageInfo | null>(
    null
  );
  const [activeModel, setActiveModel] = useState<ModelAsset | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatusResponse | null>(null);
  const [error, setError] = useState<ApiErrorPayload | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [retryJobId, setRetryJobId] = useState<string | null>(null);

  const [selectedProvider, setSelectedProvider] = useState("");
  const [removeBackground, setRemoveBackground] = useState(true);
  const [allowExternalProcessing, setAllowExternalProcessing] = useState(false);
  const [roundMode, setRoundMode] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [arDialogOpen, setArDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const verifiedProviders = (health?.providers ?? []).filter((p) => p.verified);
  // Unknown (health not loaded yet) counts as required, so consent is never skipped by accident.
  // Round-object mode always runs on the server's own machine.
  const consentRequired = health?.external_processing !== false && !roundMode;
  const hasConsent = !consentRequired || allowExternalProcessing;

  useEffect(() => {
    const prefs = loadViewerPreferences();
    setAutoRotate(prefs.defaultAutoRotate);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    checkHealth(controller.signal)
      .then((res) => {
        setHealth(res);
        pollingBudget.current = res.poll_timeout_seconds ? res.poll_timeout_seconds * 1000 : undefined;
        setBackendOnline(true);
        const firstVerified = (res.providers ?? []).find((p) => p.verified);
        if (firstVerified) {
          setSelectedProvider(firstVerified.id);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setBackendOnline(false);
      });
    return () => controller.abort();
  }, []);

  const startRequest = useCallback(() => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    return controller.signal;
  }, []);

  const showJob = useCallback(async (jobId: string, signal: AbortSignal) => {
    setRetryJobId(jobId);
    setStage("processing");
    setError(null);
    try {
      const job = await pollJobUntilDone(jobId, setJobStatus, signal, pollingBudget.current);
      if (job.status === "failed") {
        setRetryJobId(null);
        setError(job.error ?? { code: "PROVIDER_UNAVAILABLE", message: "Generation failed." });
        setStage("error");
        return;
      }
      if (!job.model_id) {
        setRetryJobId(null);
        throw new Vision3DApiError("NOT_FOUND", "This job’s model is no longer in the library.", 404);
      }
      const asset = await getModel(job.model_id, signal);
      if (signal.aborted) return;
      setActiveModel(asset);
      setRetryJobId(null);
      setSuccessNotice("3D model generated and validated.");
      setStage("result");
    } catch (err) {
      if (signal.aborted) return;
      if (err instanceof Vision3DApiError && err.status === 404) setRetryJobId(null);
      setError(formatUserError(err));
      setStage("error");
    }
  }, []);

  const openModel = useCallback(async (id: string, signal: AbortSignal) => {
    setError(null);
    try {
      const model = await getModel(id, signal);
      if (signal.aborted) return;
      setActiveModel(model);
      setStage("result");
    } catch (err) {
      if (signal.aborted) return;
      setError(formatUserError(err));
      setStage("error");
    }
  }, []);

  useEffect(() => {
    const signal = startRequest();
    setRetryJobId(null);
    setCancelling(false);
    setJobStatus(null);
    setError(null);
    setSuccessNotice(null);
    if (requestedJobId) {
      setActiveModel(null);
      void showJob(requestedJobId, signal);
    } else if (requestedSample === "1") {
      setActiveModel(SAMPLE_MODEL);
      setStage("result");
    } else if (requestedModelId) {
      setActiveModel(null);
      setStage("empty");
      void openModel(requestedModelId, signal);
    } else {
      setActiveModel(null);
      setStage(previewRef.current ? "uploaded" : "empty");
    }
    return () => requestRef.current?.abort();
  }, [requestedJobId, requestedModelId, requestedSample, showJob, openModel, startRequest]);

  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  function handleImageValidated(info: ValidatedImageInfo) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = info.previewUrl;
    setUploadedImage(info);
    if (!retryJobId) {
      setError(null);
      setSuccessNotice(null);
      if (!activeModel) setStage("uploaded");
    }
  }

  function handleClearImage() {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setUploadedImage(null);
    if (!activeModel && !retryJobId) setStage("empty");
  }

  function handleLoadSample() {
    if (requestedSample === "1" && !requestedJobId) {
      setActiveModel(SAMPLE_MODEL);
      setError(null);
      setStage("result");
    } else {
      router.replace("/create?sample=1");
    }
  }

  async function handleCancelJob() {
    const id = jobStatus?.job_id;
    if (!id || cancelling) return;
    setCancelling(true);
    const signal = startRequest();
    try {
      const result = await cancelJob(id, signal);
      if (signal.aborted) return;
      setJobStatus(result);
      if (result.error?.code === "CANCELLED") {
        setRetryJobId(null);
        setError(result.error);
        setStage("error");
      } else {
        await showJob(id, signal);
      }
    } catch (err) {
      if (signal.aborted) return;
      if (err instanceof Vision3DApiError && err.status === 409) {
        await showJob(id, signal);
      } else {
        setRetryJobId(id);
        setError(formatUserError(err));
        setStage("error");
      }
    } finally {
      if (!signal.aborted) setCancelling(false);
    }
  }

  async function handleGenerate() {
    if (!uploadedImage || !hasConsent || stage === "processing" || retryJobId) return;
    const signal = startRequest();
    setError(null);
    setActiveModel(null);
    setSuccessNotice(null);
    setJobStatus(null);
    setStage("processing");
    try {
      const provider = verifiedProviders.find((p) => p.id === selectedProvider);
      const job = await createJob(uploadedImage.file, {
        allow_external_processing: allowExternalProcessing,
        provider: provider?.id,
        remove_background: provider?.supports_background_removal ? removeBackground : undefined,
        mode: roundMode ? "round" : "auto",
      }, signal);
      if (signal.aborted) return;
      router.replace(`/create?job=${encodeURIComponent(job.job_id)}`);
    } catch (err) {
      if (signal.aborted) return;
      setError(formatUserError(err));
      setStage("error");
    }
  }

  const handlePhoneJob = useCallback((jobId: string) => {
    setActiveModel(null);
    setSuccessNotice(null);
    router.replace(`/create?job=${encodeURIComponent(jobId)}`);
  }, [router]);

  const mayRetryUpload = Boolean(uploadedImage && hasConsent);
  const retryLabel = retryJobId ? "Check Job Status" : mayRetryUpload ? "Retry Generation"
    : requestedModelId ? "Retry Loading Model" : "Choose Image";

  function handleRetry() {
    if (retryJobId) void showJob(retryJobId, startRequest());
    else if (mayRetryUpload) void handleGenerate();
    else if (requestedModelId) void openModel(requestedModelId, startRequest());
    else fileInputRef.current?.click();
  }

  return (
    <AppShell backendOnline={backendOnline}>
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-7 lg:py-6">
        {/* Top Title Header — crisp scale, no oversized headings */}
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-[28px] sm:leading-tight">
            2D to <span className="text-copper">3D</span>
          </h1>
          <p className="text-xs sm:text-sm text-ink-secondary">
            Convert any image into a 3D model with interactive 360° view and mobile AR.
          </p>
        </header>

        {/* Responsive Workspace Grid: Mobile stacked, Tablet 2-col, Desktop dominant viewport + right panel */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_328px] xl:grid-cols-[minmax(0,1fr)_348px]">
          <ModelViewport
            stage={stage}
            model={activeModel}
            uploadedImage={uploadedImage}
            jobStatus={jobStatus}
            error={error}
            autoRotate={autoRotate}
            cancelling={cancelling}
            successNotice={successNotice}
            onAutoRotateChange={setAutoRotate}
            onOpenArDialog={() => setArDialogOpen(true)}
            onOpenExportDialog={() => setExportDialogOpen(true)}
            onLoadSample={handleLoadSample}
            onRetry={handleRetry}
            retryLabel={retryLabel}
            onCancelJob={() => void handleCancelJob()}
            onTriggerUpload={() => fileInputRef.current?.click()}
          />

          <ImageInputPanel
            uploadedImage={uploadedImage}
            onImageValidated={handleImageValidated}
            onPhoneJob={handlePhoneJob}
            onClearImage={handleClearImage}
            verifiedProviders={verifiedProviders}
            selectedProvider={selectedProvider}
            onProviderChange={setSelectedProvider}
            removeBackground={removeBackground}
            onRemoveBackgroundChange={setRemoveBackground}
            allowExternalProcessing={allowExternalProcessing}
            consentRequired={consentRequired}
            roundModeAvailable={health?.round_mode === true}
            roundMode={roundMode}
            onRoundModeChange={setRoundMode}
            onAllowExternalProcessingChange={setAllowExternalProcessing}
            maxUploadBytes={health?.max_upload_bytes}
            isGenerating={stage === "processing"}
            generationBlocked={Boolean(retryJobId)}
            onGenerate={() => void handleGenerate()}
            fileInputRef={fileInputRef}
          />
        </div>
      </div>

      <QrArDialog
        open={arDialogOpen}
        onClose={() => setArDialogOpen(false)}
        model={activeModel}
      />
      <ExportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        model={activeModel}
      />
    </AppShell>
  );
}

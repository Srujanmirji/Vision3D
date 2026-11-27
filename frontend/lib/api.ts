import { shrinkForUpload } from "./uploadImage";

export type JobStatus = "queued" | "processing" | "succeeded" | "failed";

export type ModelAppearance = "baked_texture" | "native_texture" | "shape_only";

export type ApiErrorCode =
  | "INVALID_IMAGE"
  | "PROVIDER_UNAVAILABLE"
  | "QUOTA_EXCEEDED"
  | "TIMEOUT"
  | "INVALID_MODEL"
  | "CANCELLED"
  | "INTERRUPTED"
  | "INVALID_REQUEST"
  | "CONSENT_REQUIRED"
  | "ORIGIN_FORBIDDEN"
  | "RATE_LIMITED"
  | "QUEUE_FULL"
  | "QUEUE_TIMEOUT"
  | "JOB_FINISHED"
  | "NOT_FOUND"
  | "EXPIRED"
  | "CAPTURE_USED"
  | "CAPTURE_UNAVAILABLE"
  | "NETWORK_ERROR"
  | "UNKNOWN_ERROR";

export interface ApiErrorPayload {
  code: ApiErrorCode;
  message: string;
}

export class Vision3DApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string, status = 0) {
    super(message);
    this.name = "Vision3DApiError";
    this.code = code;
    this.status = status;
  }
}

export interface ProviderCapability {
  id: string;
  label: string;
  verified: boolean;
  operator_configured?: boolean;
  supports_background_removal?: boolean;
}

export interface HealthResponse {
  status: string;
  providers?: ProviderCapability[];
  fallback_provider?: ProviderCapability | null;
  max_upload_bytes?: number;
  retention_days?: number;
  share_ttl_seconds?: number;
  poll_timeout_seconds?: number;
  /** False when generation runs only on the server's own machine; consent is then not needed. */
  external_processing?: boolean;
  /** Round-object mode is available (needs local processing on the server). */
  round_mode?: boolean;
  /** Box mode is available (needs local processing on the server). */
  box_mode?: boolean;
}

export interface JobCreatedResponse {
  job_id: string;
  status: JobStatus;
}

export interface JobStatusResponse {
  job_id: string;
  status: JobStatus;
  stage?: string | null;
  progress?: number | null;
  error?: ApiErrorPayload | null;
  model_id?: string | null;
  provider?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface JobHistoryResponse {
  jobs: JobStatusResponse[];
}

export interface ModelAsset {
  id: string;
  name: string;
  glb_url: string;
  usdz_url?: string | null;
  thumbnail_url?: string | null;
  provider?: string;
  vertices?: number;
  triangles?: number;
  bounds_extent?: [number, number, number];
  appearance?: ModelAppearance;
  byte_size?: number | null;
  created_at: string;
  is_sample?: boolean;
}

export interface ModelListResponse {
  models: ModelAsset[];
}

export interface CaptureSession {
  token: string;
  capture_url: string;
  expires_at: string;
}

export interface CaptureInfo {
  expires_at: string;
  received: boolean;
}

export interface ShareResponse {
  token: string;
  mobile_url: string;
  expires_at?: string | null;
}

export interface SharedAssetResponse {
  model_id?: string;
  name: string;
  glb_url: string;
  usdz_url?: string | null;
  expires_at?: string | null;
  appearance?: ModelAppearance;
  is_sample?: boolean;
}

/** auto: AI reconstruction. round: bottle/can/jar built from the silhouette with the photo wrapped on. */
export type GenerationMode = "auto" | "round" | "box";

export interface CreateJobOptions {
  allow_external_processing: boolean;
  provider?: string;
  remove_background?: boolean;
  mode?: GenerationMode;
}

export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  return "/api";
}

export function getPublicAppUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return null;
}

export function isLocalhostUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "0.0.0.0" ||
      parsed.hostname === "::1" ||
      parsed.hostname.endsWith(".local")
    );
  } catch {
    return true;
  }
}

export function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export function getModelDownloadUrl(model: ModelAsset): string {
  if (model.is_sample) return model.glb_url;
  const sep = model.glb_url.includes("?") ? "&" : "?";
  return `${model.glb_url}${sep}download=true`;
}

export function formatAppearanceLabel(appearance?: ModelAppearance): string | null {
  if (appearance === "baked_texture") return "Baked Texture";
  if (appearance === "native_texture") return "Textured";
  if (appearance === "shape_only") return "Shape Only";
  return null;
}

async function parseErrorResponse(res: Response): Promise<Vision3DApiError> {
  try {
    const data = (await res.json()) as {
      code?: string;
      message?: string;
      detail?: string | { code?: string; message?: string };
      error?: { code?: string; message?: string };
    };
    const nested =
      data.error ??
      (typeof data.detail === "object" && data.detail !== null ? data.detail : undefined);
    const code = (nested?.code ?? data.code ?? statusToCode(res.status)) as ApiErrorCode;
    const message =
      nested?.message ??
      data.message ??
      (typeof data.detail === "string" ? data.detail : null) ??
      `Request failed with status ${res.status}.`;
    return new Vision3DApiError(code, message, res.status);
  } catch {
    return new Vision3DApiError(
      statusToCode(res.status),
      `Server responded with status ${res.status}.`,
      res.status
    );
  }
}

function statusToCode(status: number): ApiErrorCode {
  if (status === 400 || status === 413 || status === 422) return "INVALID_IMAGE";
  if (status === 404) return "NOT_FOUND";
  if (status === 410) return "EXPIRED";
  if (status === 429) return "QUOTA_EXCEEDED";
  if (status === 503) return "PROVIDER_UNAVAILABLE";
  if (status === 504) return "TIMEOUT";
  return "UNKNOWN_ERROR";
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Request cancelled.", "AbortError");
}

function checkAbort(signal?: AbortSignal | null) {
  if (signal?.aborted) throw abortReason(signal);
}

function timedSignal(caller: AbortSignal | undefined | null, ms: number) {
  const controller = new AbortController();
  const forward = () => controller.abort(caller ? abortReason(caller) : undefined);
  const timer = setTimeout(() => controller.abort(new DOMException("Request timed out.", "TimeoutError")), ms);
  if (caller?.aborted) forward();
  else caller?.addEventListener("abort", forward, { once: true });
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      caller?.removeEventListener("abort", forward);
    },
  };
}

const REQUEST_TIMEOUT_MS = 30_000;
/** Uploads include the photo body, which can take much longer on a phone connection. */
const UPLOAD_TIMEOUT_MS = 120_000;

async function request<T>(
  path: string, init: RequestInit, consume: (response: Response) => Promise<T>,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const caller = init.signal;
  const { signal, dispose } = timedSignal(caller, timeoutMs);
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      credentials: "include", ...init, cache: "no-store", signal,
    });
    if (!response.ok) throw await parseErrorResponse(response);
    return await consume(response);
  } catch (error) {
    checkAbort(caller);
    if (signal.aborted) {
      throw new Vision3DApiError(
        "TIMEOUT",
        timeoutMs > REQUEST_TIMEOUT_MS
          ? "The upload took too long. Check your connection and try again."
          : "The server did not respond in time.",
      );
    }
    if (error instanceof Vision3DApiError) throw error;
    throw new Vision3DApiError("NETWORK_ERROR", "Cannot reach the Vision3D backend or read its response.");
  } finally {
    dispose();
  }
}

async function requestJson<T>(path: string, init: RequestInit = {}, timeoutMs?: number): Promise<T> {
  return request(path, init, async (response) => (
    response.status === 204 ? undefined as T : (await response.json()) as T
  ), timeoutMs);
}

function privateModelPath(id: string): string {
  return `/v1/models/${encodeURIComponent(id)}/glb`;
}

function proxyPrivateAsset(model: ModelAsset): ModelAsset {
  return { ...model, glb_url: `${getApiBaseUrl()}${privateModelPath(model.id)}` };
}

export async function downloadModel(model: ModelAsset, signal?: AbortSignal): Promise<Blob> {
  const blob = model.is_sample
    ? await fetch(model.glb_url, { signal }).then(async (response) => {
        if (!response.ok) throw await parseErrorResponse(response);
        return response.blob();
      })
    : await request(`${privateModelPath(model.id)}?download=true`, { signal }, (response) => response.blob());
  const header = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (header.join(",") !== "103,108,84,70") {
    throw new Vision3DApiError("INVALID_MODEL", "The server did not return a GLB file.");
  }
  return blob;
}

export async function checkHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return requestJson<HealthResponse>("/health", { method: "GET", signal });
}

export async function createJob(
  file: File,
  options: CreateJobOptions,
  signal?: AbortSignal
): Promise<JobCreatedResponse> {
  const formData = new FormData();
  formData.append("image", await shrinkForUpload(file));
  formData.append(
    "allow_external_processing",
    String(options.allow_external_processing)
  );
  if (options.provider) {
    formData.append("provider", options.provider);
  }
  if (typeof options.remove_background === "boolean") {
    formData.append("remove_background", String(options.remove_background));
  }
  if (options.mode && options.mode !== "auto") {
    formData.append("mode", options.mode);
  }

  return requestJson<JobCreatedResponse>("/v1/jobs", {
    method: "POST",
    body: formData,
    signal,
  }, UPLOAD_TIMEOUT_MS);
}

export async function getJobStatus(
  jobId: string,
  signal?: AbortSignal
): Promise<JobStatusResponse> {
  return requestJson<JobStatusResponse>(`/v1/jobs/${encodeURIComponent(jobId)}`, {
    method: "GET",
    signal,
  });
}

export async function cancelJob(
  jobId: string,
  signal?: AbortSignal
): Promise<JobStatusResponse> {
  return requestJson<JobStatusResponse>(`/v1/jobs/${encodeURIComponent(jobId)}`, {
    method: "DELETE",
    signal,
  });
}

export async function getModel(modelId: string, signal?: AbortSignal): Promise<ModelAsset> {
  const model = await requestJson<ModelAsset>(`/v1/models/${encodeURIComponent(modelId)}`, {
    method: "GET",
    signal,
  });
  return proxyPrivateAsset(model);
}

export async function listModels(signal?: AbortSignal): Promise<ModelAsset[]> {
  const models: ModelAsset[] = [];
  const limit = 100;
  while (true) {
    const page = await requestJson<ModelListResponse>(
      `/v1/models?limit=${limit}&offset=${models.length}`, { signal },
    );
    models.push(...page.models.map(proxyPrivateAsset));
    if (page.models.length < limit) return models;
  }
}

export async function listJobs(offset = 0, limit = 20, signal?: AbortSignal): Promise<JobStatusResponse[]> {
  const result = await requestJson<JobHistoryResponse>(
    `/v1/jobs?limit=${limit}&offset=${offset}`, { signal },
  );
  return result.jobs;
}

export function jobStatusLabel(job: JobStatusResponse): string {
  if (job.stage === "cancelled" || job.error?.code === "CANCELLED") return "Cancelled";
  return {
    queued: "Queued", processing: "Processing", succeeded: "Completed", failed: "Failed",
  }[job.status];
}

export function jobStageLabel(stage?: string | null): string | undefined {
  switch (stage) {
    case "queued": return "Waiting for the generation worker";
    case "contacting_provider": return "Connecting to the AI provider";
    case "provider_preprocessing": return "Preparing the image with the provider";
    case "provider_generation": return "Submitting the reconstruction request";
    case "provider_queued": return "Waiting in the provider queue";
    case "provider_running": return "The provider is processing the request";
    case "retrying": return "Retrying the provider connection";
    case "downloading": return "Retrieving the generated mesh";
    case "validating": return "Validating the GLB and preparing the asset";
    default: return stage ?? undefined;
  }
}

export async function createShareLink(
  modelId: string,
  signal?: AbortSignal
): Promise<ShareResponse> {
  return requestJson<ShareResponse>(
    `/v1/models/${encodeURIComponent(modelId)}/share`,
    {
      method: "POST",
      signal,
    }
  );
}

/** Desktop: start a phone-capture link owned by this session. */
export async function createCapture(signal?: AbortSignal): Promise<CaptureSession> {
  return requestJson<CaptureSession>("/v1/captures", { method: "POST", signal });
}

/** Desktop: the job ID once the phone has sent its photo, otherwise null. */
export async function getCaptureJob(token: string, signal?: AbortSignal): Promise<string | null> {
  const result = await requestJson<{ job_id: string | null }>(
    `/v1/captures/${encodeURIComponent(token)}/job`, { method: "GET", signal },
  );
  return result.job_id;
}

/** Phone: check the capture link. Sends no session cookie. */
export async function getCaptureInfo(token: string, signal?: AbortSignal): Promise<CaptureInfo> {
  return requestJson<CaptureInfo>(`/v1/captures/${encodeURIComponent(token)}`, {
    method: "GET", credentials: "omit", signal,
  });
}

/** Phone: send the one photo for this link. Sends no session cookie. */
export async function sendCapture(
  token: string,
  file: File,
  options: { allow_external_processing: boolean; mode?: GenerationMode },
  signal?: AbortSignal,
): Promise<CaptureInfo> {
  const formData = new FormData();
  formData.append("image", await shrinkForUpload(file));
  formData.append("allow_external_processing", String(options.allow_external_processing));
  if (options.mode && options.mode !== "auto") formData.append("mode", options.mode);
  return requestJson<CaptureInfo>(`/v1/captures/${encodeURIComponent(token)}`, {
    method: "POST", body: formData, credentials: "omit", signal,
  }, UPLOAD_TIMEOUT_MS);
}

export async function getSharedAsset(
  token: string,
  signal?: AbortSignal
): Promise<SharedAssetResponse> {
  return requestJson<SharedAssetResponse>(
    `/v1/share/${encodeURIComponent(token)}`,
    {
      method: "GET",
      credentials: "omit",
      signal,
    }
  );
}

export async function deleteModel(
  modelId: string,
  signal?: AbortSignal
): Promise<void> {
  await requestJson<void>(`/v1/models/${encodeURIComponent(modelId)}`, {
    method: "DELETE",
    signal,
  });
}

function waitForPoll(ms: number, signal: AbortSignal): Promise<void> {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    function abort() {
      clearTimeout(timer);
      reject(abortReason(signal));
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function pollJobUntilDone(
  jobId: string,
  onUpdate: (status: JobStatusResponse) => void,
  caller?: AbortSignal,
  timeoutMs = 1530000,
): Promise<JobStatusResponse> {
  const { signal, dispose } = timedSignal(caller, timeoutMs);
  let delay = 1500;
  let failures = 0;
  try {
    while (true) {
      try {
        const job = await getJobStatus(jobId, signal);
        checkAbort(signal);
        onUpdate(job);
        if (job.status === "succeeded" || job.status === "failed") return job;
        failures = 0;
      } catch (error) {
        if (
          signal.aborted || !(error instanceof Vision3DApiError) ||
          !(error.code === "NETWORK_ERROR" || error.code === "TIMEOUT" || error.status >= 500) ||
          ++failures > 2
        ) throw error;
      }
      await waitForPoll(delay, signal);
      delay = Math.min(Math.round(delay * 1.4), 6000);
    }
  } catch (error) {
    checkAbort(caller);
    if (signal.aborted) {
      throw new Vision3DApiError("TIMEOUT", "Job status could not be confirmed. Check it again without re-uploading.");
    }
    throw error;
  } finally {
    dispose();
  }
}

export function formatUserError(err: unknown): ApiErrorPayload {
  if (err instanceof Vision3DApiError) {
    return { code: err.code, message: err.message };
  }
  if (err instanceof Error) {
    return { code: "UNKNOWN_ERROR", message: err.message };
  }
  return { code: "UNKNOWN_ERROR", message: "An unexpected error occurred." };
}

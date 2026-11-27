export type JobStatus = "queued" | "processing" | "succeeded" | "failed";

export type ApiErrorCode =
  | "INVALID_IMAGE"
  | "PROVIDER_UNAVAILABLE"
  | "QUOTA_EXCEEDED"
  | "TIMEOUT"
  | "INVALID_MODEL"
  | "NOT_FOUND"
  | "EXPIRED"
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
  supports_background_removal?: boolean;
}

export interface HealthResponse {
  status: string;
  providers?: ProviderCapability[];
  max_upload_bytes?: number;
  retention_days?: number;
  share_ttl_seconds?: number;
}

export interface JobCreatedResponse {
  job_id: string;
  status: JobStatus;
}

export interface JobStatusResponse {
  job_id?: string;
  id?: string;
  status: JobStatus;
  stage?: string | null;
  progress?: number | null;
  error?: ApiErrorPayload | null;
  error_code?: ApiErrorCode | null;
  error_message?: string | null;
  model_id?: string | null;
}

export interface ModelAsset {
  id: string;
  name: string;
  glb_url: string;
  usdz_url?: string | null;
  thumbnail_url?: string | null;
  byte_size?: number | null;
  created_at: string;
  is_sample?: boolean;
}

export interface ModelListResponse {
  models: ModelAsset[];
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
  is_sample?: boolean;
}

export interface CreateJobOptions {
  provider?: string;
  remove_background?: boolean;
}

export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  return "http://localhost:8000";
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

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: "include",
      ...init,
    });
  } catch {
    throw new Vision3DApiError(
      "NETWORK_ERROR",
      "Cannot reach the Vision3D backend service. Verify the backend server is running and NEXT_PUBLIC_API_BASE_URL is configured.",
      0
    );
  }

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function checkHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return requestJson<HealthResponse>("/health", { method: "GET", signal });
}

export async function createJob(
  file: File,
  options?: CreateJobOptions,
  signal?: AbortSignal
): Promise<JobCreatedResponse> {
  const formData = new FormData();
  formData.append("image", file);
  if (options?.provider) {
    formData.append("provider", options.provider);
  }
  if (typeof options?.remove_background === "boolean") {
    formData.append("remove_background", String(options.remove_background));
  }

  return requestJson<JobCreatedResponse>("/v1/jobs", {
    method: "POST",
    body: formData,
    signal,
  });
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

export async function getModel(
  modelId: string,
  signal?: AbortSignal
): Promise<ModelAsset> {
  return requestJson<ModelAsset>(`/v1/models/${encodeURIComponent(modelId)}`, {
    method: "GET",
    signal,
  });
}

export async function listModels(signal?: AbortSignal): Promise<ModelAsset[]> {
  const res = await requestJson<ModelListResponse | ModelAsset[]>("/v1/models", {
    method: "GET",
    signal,
  });
  return Array.isArray(res) ? res : res.models ?? [];
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

export async function getSharedAsset(
  token: string,
  signal?: AbortSignal
): Promise<SharedAssetResponse> {
  return requestJson<SharedAssetResponse>(
    `/v1/share/${encodeURIComponent(token)}`,
    {
      method: "GET",
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

export async function pollJobUntilDone(
  jobId: string,
  onUpdate: (status: JobStatusResponse) => void,
  signal?: AbortSignal
): Promise<JobStatusResponse> {
  let delayMs = 1500;
  const maxDelayMs = 6000;

  while (true) {
    if (signal?.aborted) {
      throw new DOMException("Polling aborted", "AbortError");
    }

    const status = await getJobStatus(jobId, signal);
    onUpdate(status);

    if (status.status === "succeeded" || status.status === "failed") {
      return status;
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, delayMs);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new DOMException("Polling aborted", "AbortError"));
        },
        { once: true }
      );
    });

    delayMs = Math.min(Math.round(delayMs * 1.4), maxDelayMs);
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

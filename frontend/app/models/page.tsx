"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Box,
  Download,
  ExternalLink,
  Plus,
  RefreshCw,
  Smartphone,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/sidebar/AppShell";
import { QrArDialog } from "@/components/ar-dialog/QrArDialog";
import { ExportDialog } from "@/components/export-dialog/ExportDialog";
import {
  AlertBanner,
  Badge,
  Button,
  Dialog,
  Skeleton,
} from "@/components/ui";
import {
  checkHealth,
  deleteModel,
  formatAppearanceLabel,
  formatUserError,
  listModels,
  listJobs,
  jobStatusLabel,
  type JobStatusResponse,
  type ApiErrorPayload,
  type ModelAsset,
} from "@/lib/api";
import { SAMPLE_MODEL } from "@/lib/sample";
import { formatBytes } from "@/lib/validation";

const HISTORY_PAGE_SIZE = 20;

export default function ModelsPage() {
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [models, setModels] = useState<ModelAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorPayload | null>(null);
  const [jobs, setJobs] = useState<JobStatusResponse[]>([]);
  const [historyError, setHistoryError] = useState<ApiErrorPayload | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const historyOffset = useRef(0);
  const requestRef = useRef<AbortController | null>(null);

  const [arModel, setArModel] = useState<ModelAsset | null>(null);
  const [exportModel, setExportModel] = useState<ModelAsset | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ModelAsset | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchModels = useCallback(async (showLoading = true) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    const { signal } = controller;
    requestRef.current = controller;
    setMoreLoading(false);
    if (showLoading) {
      setLoading(true);
      setHistoryLoading(true);
    }
    setError(null);
    setHistoryError(null);

    void checkHealth(signal)
      .then(() => { if (!signal.aborted) setBackendOnline(true); })
      .catch(() => { if (!signal.aborted) setBackendOnline(false); });

    // The first owned request establishes the cookie before fetching owned job history.
    try {
      const items = await listModels(signal);
      if (!signal.aborted) setModels(items);
    } catch (err) {
      if (!signal.aborted) setError(formatUserError(err));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
    if (signal.aborted) return;
    try {
      const items = await listJobs(0, HISTORY_PAGE_SIZE, signal);
      if (signal.aborted) return;
      setJobs(items);
      historyOffset.current = items.length;
      setHasMore(items.length === HISTORY_PAGE_SIZE);
    } catch (err) {
      if (!signal.aborted) setHistoryError(formatUserError(err));
    } finally {
      if (!signal.aborted) setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchModels();
    const sync = () => void fetchModels(false);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("focus", sync);
      requestRef.current?.abort();
    };
  }, [fetchModels]);

  async function loadMoreHistory() {
    const signal = requestRef.current?.signal;
    if (!signal || signal.aborted || moreLoading) return;
    setMoreLoading(true);
    setHistoryError(null);
    try {
      const page = await listJobs(historyOffset.current, HISTORY_PAGE_SIZE, signal);
      if (signal.aborted) return;
      setJobs((items) => [...items, ...page.filter((job) => !items.some((item) => item.job_id === job.job_id))]);
      historyOffset.current += page.length;
      setHasMore(page.length === HISTORY_PAGE_SIZE);
    } catch (err) {
      if (!signal.aborted) setHistoryError(formatUserError(err));
    } finally {
      if (!signal.aborted) setMoreLoading(false);
    }
  }

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteModel(pendingDelete.id);
      await fetchModels(false);
      setPendingDelete(null);
    } catch (err) {
      setError(formatUserError(err));
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShell backendOnline={backendOnline}>
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-7 lg:py-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-[28px]">
              My <span className="text-copper">Models</span>
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-ink-secondary">
              Session-scoped 3D models generated from your uploads. Assets are
              retained temporarily and can be deleted at any time.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="md"
              onClick={() => void fetchModels()}
            >
              <RefreshCw className="h-3.5 w-3.5 text-ink-secondary" />
              Refresh
            </Button>
            <Link
              href="/create"
              className="inline-flex min-h-[42px] items-center gap-2 rounded-[10px] bg-copper px-4 py-2 text-xs sm:text-sm font-semibold text-ink-on-copper transition-colors hover:bg-copper-hover active:bg-copper-pressed"
            >
              <Plus className="h-4 w-4" />
              New 3D Model
            </Link>
          </div>
        </header>

        {/* Session Models Section */}
        <section aria-label="Generated models">
          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="rounded-[16px] border border-border-subtle bg-panel p-5"
                >
                  <Skeleton className="h-28 w-full" />
                  <Skeleton className="mt-4 h-4 w-1/2" />
                  <Skeleton className="mt-2 h-3 w-1/3" />
                </div>
              ))}
            </div>
          ) : error ? (
            <AlertBanner
              tone="error"
              title="Unable to load session models"
              code={error.code}
            >
              {error.message}
            </AlertBanner>
          ) : models.length === 0 ? (
            <div className="flex flex-col items-center rounded-[16px] border border-border-subtle bg-panel px-6 py-12 text-center">
              <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-[12px] border border-border-subtle bg-raised text-copper">
                <Box className="h-6 w-6" strokeWidth={1.5} />
              </div>
              <h2 className="text-sm font-semibold text-ink-primary">
                No generated models in this session
              </h2>
              <p className="mt-1.5 max-w-md text-xs leading-relaxed text-ink-secondary">
                Upload an image in Create 3D to generate a genuine GLB model. Your
                session models will appear here for download, AR sharing, or deletion.
              </p>
              <Link
                href="/create"
                className="mt-5 inline-flex min-h-[42px] items-center gap-2 rounded-[10px] bg-copper px-4 py-2 text-xs font-semibold text-ink-on-copper transition-colors hover:bg-copper-hover"
              >
                <Plus className="h-4 w-4" />
                Create Your First Model
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {models.map((item) => {
                const appearanceLabel = formatAppearanceLabel(item.appearance);
                return (
                  <article
                    key={item.id}
                    className="flex flex-col justify-between rounded-[16px] border border-border-subtle bg-panel p-4 sm:p-5"
                  >
                    <div>
                      <div className="flex h-36 items-center justify-center overflow-hidden rounded-[12px] border border-border-subtle bg-obsidian/65">
                        {item.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.thumbnail_url}
                            alt={item.name}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <Box className="h-9 w-9 text-copper/75" strokeWidth={1.5} />
                        )}
                      </div>
                      <div className="mt-3.5 flex items-center justify-between gap-2">
                        <h2 className="truncate text-sm font-semibold text-ink-primary">
                          {item.name}
                        </h2>
                        {appearanceLabel ? (
                          <Badge tone="neutral">{appearanceLabel}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-ink-secondary">
                        {new Date(item.created_at).toLocaleString()}
                        {item.byte_size ? ` · ${formatBytes(item.byte_size)}` : ""}
                        {typeof item.triangles === "number"
                          ? ` · ${item.triangles.toLocaleString()} tris`
                          : ""}
                      </p>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-border-subtle/70">
                      <Link
                        href={`/models/${encodeURIComponent(item.id)}`}
                        className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-border-subtle bg-raised px-3 py-1.5 text-xs font-medium text-ink-primary transition-colors hover:border-copper/50"
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-copper" />
                        Details
                      </Link>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setArModel(item)}
                        aria-label={`View ${item.name} in AR`}
                      >
                        <Smartphone className="h-3.5 w-3.5 text-ink-secondary" />
                        AR
                      </Button>
                      <Button
                        variant="icon"
                        size="sm"
                        onClick={() => setExportModel(item)}
                        aria-label={`Export ${item.name} GLB`}
                        className="border-border-subtle bg-raised hover:border-copper/50 hover:text-ink-primary"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="icon"
                        size="sm"
                        onClick={() => setPendingDelete(item)}
                        aria-label={`Delete ${item.name}`}
                        className="border-border-subtle bg-raised hover:border-red-500/40 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section aria-labelledby="generation-history-heading" className="pt-1">
          <h2 id="generation-history-heading" className="mb-3 text-sm font-semibold text-ink-primary">
            Generation history
          </h2>
          <div className="rounded-[16px] border border-border-subtle bg-panel">
            {historyLoading ? (
              <p role="status" className="p-4 text-xs text-ink-secondary">Loading generation history…</p>
            ) : !historyError && jobs.length === 0 ? (
              <p className="p-4 text-xs text-ink-secondary">Jobs from this browser session will appear here.</p>
            ) : null}
            {!historyLoading && jobs.length > 0 && (
              <ul className="divide-y divide-border-subtle">
                {jobs.map((job) => {
                  const pending = job.status === "queued" || job.status === "processing";
                  const model = models.find((item) => item.id === job.model_id);
                  return (
                    <li key={job.job_id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                      <div className="min-w-0 flex-1 basis-40">
                        <p className="break-words text-xs font-medium text-ink-primary">
                          {model?.name ?? (pending ? "3D generation" : "Generation job")}
                        </p>
                        {job.created_at && (
                          <time dateTime={job.created_at} className="text-xs text-ink-secondary">
                            {new Date(job.created_at).toLocaleString()}
                          </time>
                        )}
                        {job.error && (
                          <p className="mt-1 break-words text-xs text-ink-secondary">{job.error.message}</p>
                        )}
                      </div>
                      <Badge tone={job.status === "succeeded" ? "success" : pending ? "copper" : "neutral"}>
                        {jobStatusLabel(job)}
                      </Badge>
                      {pending || job.model_id ? (
                        <Link
                          className="inline-flex min-h-11 items-center rounded-[10px] border border-border-subtle bg-raised px-3 text-xs font-medium text-ink-primary hover:border-copper/50"
                          href={pending ? `/create?job=${encodeURIComponent(job.job_id)}` : `/models/${encodeURIComponent(job.model_id ?? "")}`}
                        >
                          {pending ? "View job" : "View model"}
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {!historyLoading && historyError && (
              <div className="p-4">
                <AlertBanner tone="error" title="Unable to load generation history" code={historyError.code}>
                  {historyError.message}
                </AlertBanner>
              </div>
            )}
            {!historyLoading && hasMore && (
              <div className="border-t border-border-subtle p-3">
                <Button variant="secondary" size="md" loading={moreLoading} onClick={() => void loadMoreHistory()}>
                  Load older jobs
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* Explicitly Labeled Sample Reference Section */}
        <section aria-label="Sample preview assets" className="pt-1">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink-primary">
              Sample 3D Asset (Demo Preview Only)
            </h2>
            <Badge tone="copper" dot>
              Local Sample GLB
            </Badge>
          </div>
          <article className="flex flex-col justify-between gap-4 rounded-[16px] border border-border-subtle bg-panel p-4 sm:p-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] border border-copper/30 bg-copper/10 text-copper">
                <Box className="h-6 w-6" strokeWidth={1.6} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink-primary">
                  {SAMPLE_MODEL.name}
                </h3>
                <p className="mt-0.5 text-xs text-ink-secondary">
                  Bundled sample GLB ({formatBytes(SAMPLE_MODEL.byte_size ?? 0)})
                  for verifying 360° viewport controls and AR routing — not generated
                  by AI inference.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap shrink-0 items-center gap-2">
              <Link
                href="/models/sample"
                className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-border-subtle bg-raised px-3 py-2 text-xs font-medium text-ink-primary transition-colors hover:border-copper/50"
              >
                <ExternalLink className="h-3.5 w-3.5 text-copper" />
                Details
              </Link>
              <Link
                href="/create?sample=1"
                className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-border-subtle bg-raised px-3 py-2 text-xs font-medium text-ink-primary transition-colors hover:border-copper/50"
              >
                Studio
              </Link>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setExportModel(SAMPLE_MODEL)}
              >
                <Download className="h-3.5 w-3.5 text-ink-secondary" />
                Export
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setArModel(SAMPLE_MODEL)}
              >
                <Smartphone className="h-3.5 w-3.5 text-ink-secondary" />
                AR
              </Button>
            </div>
          </article>
        </section>
      </div>

      {/* Reusable Native Destructive Confirmation Modal */}
      <Dialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Delete 3D model?"
        lightDismiss={false}
        footer={
          <>
            <Button
              variant="secondary"
              size="md"
              autoFocus
              disabled={deleting}
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              loading={deleting}
              onClick={() => void handleConfirmDelete()}
            >
              {deleting ? "Deleting…" : "Delete Model"}
            </Button>
          </>
        }
      >
        <p className="text-xs sm:text-sm leading-relaxed text-ink-secondary">
          This permanently deletes{" "}
          <span className="font-medium text-ink-primary">
            {pendingDelete?.name}
          </span>{" "}
          from storage and revokes all active mobile AR share links.
        </p>
      </Dialog>

      <QrArDialog
        open={Boolean(arModel)}
        onClose={() => setArModel(null)}
        model={arModel}
      />
      <ExportDialog
        open={Boolean(exportModel)}
        onClose={() => setExportModel(null)}
        model={exportModel}
      />
    </AppShell>
  );
}

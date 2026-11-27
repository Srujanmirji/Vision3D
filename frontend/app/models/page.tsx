"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
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
import {
  checkHealth,
  deleteModel,
  formatUserError,
  listModels,
  type ApiErrorPayload,
  type ModelAsset,
} from "@/lib/api";
import { SAMPLE_MODEL } from "@/lib/sample";
import { formatBytes } from "@/lib/validation";

export default function ModelsPage() {
  const deleteTitleId = useId();
  const deleteDialogRef = useRef<HTMLDialogElement>(null);

  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [models, setModels] = useState<ModelAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorPayload | null>(null);

  const [arModel, setArModel] = useState<ModelAsset | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ModelAsset | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [, items] = await Promise.all([
        checkHealth().then(() => setBackendOnline(true)),
        listModels(),
      ]);
      setModels(items);
    } catch (err) {
      setBackendOnline(false);
      setError(formatUserError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (!dialog) return;
    if (pendingDelete && !dialog.open) {
      dialog.showModal();
    } else if (!pendingDelete && dialog.open) {
      dialog.close();
    }
  }, [pendingDelete]);

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteModel(pendingDelete.id);
      setModels((prev) => prev.filter((m) => m.id !== pendingDelete.id));
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
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-ink-primary">
              My <span className="text-copper">Models</span>
            </h1>
            <p className="mt-1 text-sm text-ink-secondary">
              Session-scoped 3D models generated from your uploads. Assets are
              retained temporarily and can be deleted at any time.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => void fetchModels()}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-border-subtle bg-raised px-3.5 py-2 text-xs font-medium text-ink-primary transition-colors hover:border-border-strong"
            >
              <RefreshCw className="h-3.5 w-3.5 text-ink-secondary" />
              Refresh
            </button>
            <Link
              href="/create"
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-copper px-4 py-2 text-xs font-semibold text-ink-on-copper transition-colors hover:bg-copper-hover active:bg-copper-pressed"
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
                  className="h-52 rounded-[20px] border border-border-subtle bg-panel/70 p-5"
                >
                  <div className="h-24 rounded-xl bg-raised/70" />
                  <div className="mt-4 h-4 w-1/2 rounded bg-raised/70" />
                  <div className="mt-2 h-3 w-1/3 rounded bg-raised/50" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div
              role="alert"
              className="rounded-[20px] border border-border-subtle bg-panel p-6"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-copper/35 bg-copper/12 text-copper">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-ink-primary">
                      Unable to load session models
                    </h2>
                    <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[11px] text-ink-secondary">
                      {error.code}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-ink-secondary">
                    {error.message}
                  </p>
                </div>
              </div>
            </div>
          ) : models.length === 0 ? (
            <div className="flex flex-col items-center rounded-[20px] border border-border-subtle bg-panel px-6 py-12 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border-subtle bg-raised text-copper">
                <Box className="h-7 w-7" strokeWidth={1.5} />
              </div>
              <h2 className="text-base font-semibold text-ink-primary">
                No generated models in this session
              </h2>
              <p className="mt-1.5 max-w-md text-xs leading-relaxed text-ink-secondary">
                Upload an image in Create 3D to generate a genuine GLB model. Your
                session models will appear here for download, AR sharing, or deletion.
              </p>
              <Link
                href="/create"
                className="mt-5 inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-copper px-4 py-2 text-xs font-semibold text-ink-on-copper transition-colors hover:bg-copper-hover"
              >
                <Plus className="h-4 w-4" />
                Create Your First Model
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {models.map((item) => (
                <article
                  key={item.id}
                  className="flex flex-col justify-between rounded-[20px] border border-border-subtle bg-panel p-5"
                >
                  <div>
                    <div className="flex h-36 items-center justify-center overflow-hidden rounded-xl border border-border-subtle bg-obsidian/65">
                      {item.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.thumbnail_url}
                          alt={item.name}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <Box className="h-10 w-10 text-copper/75" strokeWidth={1.5} />
                      )}
                    </div>
                    <h2 className="mt-4 truncate text-sm font-semibold text-ink-primary">
                      {item.name}
                    </h2>
                    <p className="mt-1 text-xs text-ink-secondary">
                      {new Date(item.created_at).toLocaleString()}
                      {item.byte_size ? ` · ${formatBytes(item.byte_size)}` : ""}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-border-subtle/70">
                    <Link
                      href={`/create?model=${encodeURIComponent(item.id)}`}
                      className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-border-subtle bg-raised px-3 py-1.5 text-xs font-medium text-ink-primary transition-colors hover:border-copper/50"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-copper" />
                      Open 3D
                    </Link>
                    <button
                      type="button"
                      onClick={() => setArModel(item)}
                      className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-border-subtle bg-raised px-3 py-1.5 text-xs font-medium text-ink-primary transition-colors hover:border-copper/50"
                      aria-label={`View ${item.name} in AR`}
                    >
                      <Smartphone className="h-3.5 w-3.5 text-ink-secondary" />
                      AR
                    </button>
                    <a
                      href={item.glb_url}
                      download={`${item.id}.glb`}
                      className="inline-flex min-h-[38px] items-center justify-center rounded-xl border border-border-subtle bg-raised px-2.5 py-1.5 text-ink-secondary transition-colors hover:text-ink-primary"
                      aria-label={`Download ${item.name} GLB`}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(item)}
                      className="inline-flex min-h-[38px] items-center justify-center rounded-xl border border-border-subtle bg-raised px-2.5 py-1.5 text-ink-secondary transition-colors hover:border-red-500/40 hover:text-red-400"
                      aria-label={`Delete ${item.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Explicitly Labeled Sample Reference Section */}
        <section aria-label="Sample preview assets" className="pt-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-primary">
              Sample 3D Asset (Demo Preview Only)
            </h2>
            <span className="rounded-full border border-copper/35 bg-copper/12 px-2.5 py-0.5 text-[11px] font-medium text-copper">
              Local Sample GLB
            </span>
          </div>
          <article className="flex flex-col justify-between gap-4 rounded-[20px] border border-border-subtle bg-panel p-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-copper/30 bg-copper/10 text-copper">
                <Box className="h-7 w-7" strokeWidth={1.6} />
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
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/create?sample=1"
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-border-subtle bg-raised px-3.5 py-2 text-xs font-medium text-ink-primary transition-colors hover:border-copper/50"
              >
                <ExternalLink className="h-3.5 w-3.5 text-copper" />
                Inspect in Viewer
              </Link>
              <button
                type="button"
                onClick={() => setArModel(SAMPLE_MODEL)}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-border-subtle bg-raised px-3.5 py-2 text-xs font-medium text-ink-primary transition-colors hover:border-copper/50"
              >
                <Smartphone className="h-3.5 w-3.5 text-ink-secondary" />
                Preview AR Flow
              </button>
            </div>
          </article>
        </section>
      </div>

      {/* Native Destructive Confirmation Modal (modern-web-guidance: dialog) */}
      <dialog
        ref={deleteDialogRef}
        aria-labelledby={deleteTitleId}
        onClose={() => {
          if (deleteDialogRef.current) deleteDialogRef.current.returnValue = "";
          setPendingDelete(null);
        }}
        className="v3d-dialog"
      >
        <div className="p-6">
          <h1 id={deleteTitleId} className="text-lg font-semibold text-ink-primary">
            Delete 3D model?
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
            This permanently deletes{" "}
            <span className="font-medium text-ink-primary">
              {pendingDelete?.name}
            </span>{" "}
            from storage and revokes all active mobile AR share links.
          </p>
          <div className="mt-6 flex items-center justify-end gap-2.5">
            <button
              type="button"
              autoFocus
              disabled={deleting}
              onClick={() => deleteDialogRef.current?.close()}
              className="min-h-[42px] rounded-xl border border-border-subtle bg-raised px-4 py-2 text-xs font-medium text-ink-primary transition-colors hover:border-border-strong"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => void handleConfirmDelete()}
              className="min-h-[42px] rounded-xl bg-red-500/90 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete Model"}
            </button>
          </div>
        </div>
      </dialog>

      <QrArDialog
        open={Boolean(arModel)}
        onClose={() => setArModel(null)}
        model={arModel}
      />
    </AppShell>
  );
}

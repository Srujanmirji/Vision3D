"use client";

import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";

export interface AlertBannerProps {
  tone?: "error" | "warning" | "info";
  title?: string;
  code?: string;
  children: ReactNode;
  className?: string;
}

export function AlertBanner({
  tone = "error",
  title,
  code,
  children,
  className = "",
}: AlertBannerProps) {
  const Icon =
    tone === "error"
      ? AlertCircle
      : tone === "warning"
      ? AlertTriangle
      : Info;

  const toneClass =
    tone === "info"
      ? "border-border-subtle bg-raised/65 text-ink-secondary"
      : "border-copper/35 bg-copper/10 text-ink-primary";

  return (
    <div
      role={tone === "info" ? "status" : "alert"}
      className={`flex items-start gap-2.5 rounded-[10px] border px-3.5 py-2.5 text-xs leading-relaxed ${toneClass} ${className}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-copper" strokeWidth={1.75} />
      <div className="min-w-0 flex-1 space-y-1">
        {(title || code) && (
          <div className="flex flex-wrap items-center gap-2">
            {title ? (
              <span className="font-semibold text-ink-primary">{title}</span>
            ) : null}
            {code ? (
              <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[10px] text-ink-secondary">
                {code}
              </span>
            ) : null}
          </div>
        )}
        <div className="text-ink-secondary">{children}</div>
      </div>
    </div>
  );
}

export interface ErrorStateProps {
  code?: string;
  title: string;
  message: string;
  actions?: ReactNode;
}

export function ErrorState({ code, title, message, actions }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex max-w-md flex-col items-center rounded-[14px] border border-border-subtle bg-panel/95 p-6 text-center"
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-[10px] border border-copper/35 bg-copper/12 text-copper">
        <AlertTriangle className="h-5 w-5" strokeWidth={1.75} />
      </div>
      {code ? (
        <span className="rounded-[6px] border border-border-subtle bg-raised px-2 py-0.5 font-mono text-[11px] text-ink-secondary">
          {code}
        </span>
      ) : null}
      <h2 className="mt-2.5 text-sm font-semibold text-ink-primary">{title}</h2>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-secondary">{message}</p>
      {actions ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

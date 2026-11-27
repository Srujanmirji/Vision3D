"use client";

import type { CSSProperties } from "react";

export interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}

const SPINNER_SIZES: Record<"sm" | "md" | "lg", string> = {
  sm: "16px",
  md: "22px",
  lg: "32px",
};

export function Spinner({
  size = "md",
  label = "Loading",
  className = "",
}: SpinnerProps) {
  const style = { "--size": SPINNER_SIZES[size] } as CSSProperties;
  return (
    <progress
      aria-label={label}
      className={`v3d-spinner shrink-0 ${className}`}
      style={style}
    />
  );
}

export interface ProgressBarProps {
  id?: string;
  label: string;
  value?: number | null;
  max?: number;
  className?: string;
}

export function ProgressBar({
  id,
  label,
  value = null,
  max = 100,
  className = "",
}: ProgressBarProps) {
  const determinate = typeof value === "number" && Number.isFinite(value);
  return (
    <div className={`w-full ${className}`}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <progress
        id={id}
        aria-label={label}
        className="v3d-progress"
        max={max}
        {...(determinate ? { value: Math.max(0, Math.min(max, value)) } : {})}
      />
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-[10px] bg-raised/70 animate-pulse ${className}`}
    />
  );
}

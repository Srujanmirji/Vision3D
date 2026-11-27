import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "copper" | "success" | "danger";

export interface BadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "border-border-subtle bg-raised/90 text-ink-secondary",
  copper: "border-copper/35 bg-copper/12 text-copper",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  danger: "border-red-500/35 bg-red-500/10 text-red-400",
};

const DOT_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-ink-muted",
  copper: "bg-copper",
  success: "bg-emerald-400",
  danger: "bg-red-400",
};

export function Badge({
  tone = "neutral",
  dot = false,
  children,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[8px] border px-2.5 py-1 text-[11px] font-medium ${TONE_CLASSES[tone]} ${className}`}
    >
      {dot ? (
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASSES[tone]}`} />
      ) : null}
      {children}
    </span>
  );
}

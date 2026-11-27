"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "./Loading";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "icon";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  active?: boolean;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-copper text-ink-on-copper font-semibold border border-transparent hover:bg-copper-hover active:bg-copper-pressed",
  secondary:
    "bg-raised text-ink-primary font-medium border border-border-subtle hover:border-border-strong hover:bg-[#2a2a2e]",
  ghost:
    "bg-transparent text-ink-secondary font-medium border border-transparent hover:bg-raised/70 hover:text-ink-primary",
  danger:
    "bg-red-500/90 text-white font-semibold border border-transparent hover:bg-red-500 active:bg-red-600",
  icon:
    "bg-transparent text-ink-secondary border border-transparent hover:bg-panel hover:text-ink-primary",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-[36px] px-3 py-1.5 text-xs rounded-[10px]",
  md: "min-h-[42px] px-4 py-2 text-xs sm:text-sm rounded-[10px]",
  lg: "min-h-[46px] px-5 py-2.5 text-sm rounded-[12px]",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  active = false,
  disabled,
  className = "",
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  const isIcon = variant === "icon";
  const variantClass =
    isIcon && active
      ? "border border-copper/70 bg-copper/22 text-copper hover:bg-copper/28"
      : VARIANT_CLASSES[variant];

  const sizeClass = isIcon
    ? "size-11 shrink-0 rounded-[10px] p-0"
    : SIZE_CLASSES[size];

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${variantClass} ${sizeClass} ${className}`}
      {...rest}
    >
      {loading ? <Spinner size="sm" label="Loading" /> : null}
      {children}
    </button>
  );
}

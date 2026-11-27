"use client";

import { useId, type InputHTMLAttributes, type ReactNode } from "react";

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
}

export function TextInput({
  label,
  hint,
  error,
  id,
  className = "",
  ...rest
}: TextInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = error ? `${inputId}-error` : undefined;
  const hintId = hint ? `${inputId}-hint` : undefined;

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={inputId}
        className="block text-xs font-medium text-ink-secondary"
      >
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        className={`w-full min-h-[42px] rounded-[10px] border bg-obsidian/70 px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted transition-colors hover:border-border-strong disabled:opacity-45 ${
          error ? "border-copper" : "border-border-subtle"
        } ${className}`}
        {...rest}
      />
      {hint && !error ? (
        <p id={hintId} className="text-[11px] text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-[11px] text-copper">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  label: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function Checkbox({
  label,
  checked,
  onCheckedChange,
  id,
  disabled,
  className = "",
  ...rest
}: CheckboxProps) {
  const autoId = useId();
  const checkboxId = id ?? autoId;

  return (
    <label
      htmlFor={checkboxId}
      className={`flex items-start gap-2.5 text-xs leading-relaxed select-none ${
        disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer"
      } ${className}`}
    >
      <input
        id={checkboxId}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="v3d-checkbox mt-0.5"
        {...rest}
      />
      <span className="text-ink-secondary">{label}</span>
    </label>
  );
}

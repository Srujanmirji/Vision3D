"use client";

import { useId, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label: string;
  options: SelectOption[];
  hint?: string;
}

export function Select({
  label,
  options,
  hint,
  id,
  className = "",
  ...rest
}: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={selectId}
        className="block text-xs font-medium text-ink-secondary"
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={selectId}
          className={`w-full min-h-[42px] appearance-none rounded-[10px] border border-border-subtle bg-raised pl-3.5 pr-9 py-2 text-sm text-ink-primary transition-colors hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
          {...rest}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-secondary"
        />
      </div>
      {hint ? <p className="text-[11px] text-ink-muted">{hint}</p> : null}
    </div>
  );
}

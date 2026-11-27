"use client";

import type { InputHTMLAttributes } from "react";

interface CopperSwitchProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  labelClassName?: string;
}

export function CopperSwitch({
  checked,
  onCheckedChange,
  label,
  labelClassName,
  id,
  disabled,
  ...rest
}: CopperSwitchProps) {
  return (
    <label
      htmlFor={id}
      className={`inline-flex items-center gap-3 select-none ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      }`}
    >
      <span className={labelClassName ?? "text-sm text-ink-primary"}>{label}</span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="v3d-switch"
        {...({ switch: "" } as Record<string, string>)}
        {...rest}
      />
    </label>
  );
}

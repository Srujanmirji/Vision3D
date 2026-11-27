"use client";

import { useId, type ReactNode } from "react";

export interface TooltipProps {
  content: string;
  children: (triggerProps: Record<string, string>) => ReactNode;
}

/**
 * Accessible interest-triggered tooltip using native popover="hint" + interestfor.
 * Falls back cleanly to native title attribute in browsers without interestfor.
 */
export function Tooltip({ content, children }: TooltipProps) {
  const tipId = useId();

  return (
    <>
      {children({
        interestfor: tipId,
        "aria-describedby": tipId,
        title: content,
      })}
      <div
        id={tipId}
        role="tooltip"
        className="v3d-tooltip"
        {...({ popover: "hint" } as Record<string, string>)}
      >
        {content}
      </div>
    </>
  );
}

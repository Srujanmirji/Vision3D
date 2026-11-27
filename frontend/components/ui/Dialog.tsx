"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: ReactNode;
  description?: string;
  lightDismiss?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}

export function Dialog({
  open,
  onClose,
  title,
  eyebrow,
  description,
  lightDismiss = true,
  children,
  footer,
}: DialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Fallback light-dismiss for Safari where <dialog closedby="any"> is unsupported
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !lightDismiss) return;
    if ("closedBy" in HTMLDialogElement.prototype) return;

    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };

    let pressedOutside = false;
    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener("pointerdown", onPointerDown);
    dialog.addEventListener("pointerup", onPointerUp);
    return () => {
      dialog.removeEventListener("pointerdown", onPointerDown);
      dialog.removeEventListener("pointerup", onPointerUp);
    };
  }, [lightDismiss]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={() => {
        if (dialogRef.current) {
          dialogRef.current.returnValue = "";
        }
        onClose();
      }}
      className="v3d-dialog"
      {...(lightDismiss
        ? ({ closedby: "any" } as Record<string, string>)
        : {})}
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            {eyebrow ? (
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-copper">
                {eyebrow}
              </div>
            ) : null}
            <h1 id={titleId} className="text-base font-semibold text-ink-primary">
              {title}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={`Close ${title}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-[8px] border border-border-subtle bg-raised text-ink-secondary transition-colors hover:border-border-strong hover:text-ink-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {description ? (
          <p className="mt-2 text-xs leading-relaxed text-ink-secondary">
            {description}
          </p>
        ) : null}

        <div className="mt-4">{children}</div>

        {footer ? (
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2.5">
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}

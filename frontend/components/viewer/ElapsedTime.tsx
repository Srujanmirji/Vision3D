"use client";

import { useEffect, useState } from "react";

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Live "Elapsed m:ss" since a job started. A timer role keeps screen readers from announcing each tick. */
export function ElapsedTime({ since }: { since?: string | null }) {
  const [start] = useState(() => {
    const parsed = since ? Date.parse(since) : NaN;
    // Guard against a far-off server clock: fall back to when this view started.
    return Number.isFinite(parsed) && Math.abs(Date.now() - parsed) < 3_600_000 ? parsed : Date.now();
  });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <p role="timer" aria-live="off" className="mt-2 text-[11px] tabular-nums text-ink-muted">
      Elapsed {formatElapsed(now - start)}
    </p>
  );
}

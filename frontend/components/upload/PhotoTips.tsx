import { Check, X } from "lucide-react";

const DO = [
  "One object, fully in frame — nothing cut off",
  "Plain background that contrasts with the object",
  "Even, soft light — no harsh shadows or glare",
  "Shoot from a 3/4 angle, slightly above, to show the top and two sides",
] as const;

const AVOID = "Glass, mirrors, very shiny or see-through objects, and busy scenes";

/** What makes a photo reconstruct well. The back of the object is always inferred. */
export function PhotoTips() {
  return (
    <section aria-labelledby="photo-tips-heading" className="mt-3 rounded-[10px] border border-border-subtle bg-obsidian/40 px-3.5 py-3">
      <h3 id="photo-tips-heading" className="text-xs font-semibold text-ink-primary">
        For the best 3D result
      </h3>
      <ul className="mt-2 space-y-1.5 text-[11px] leading-snug text-ink-secondary">
        {DO.map((tip) => (
          <li key={tip} className="flex gap-2">
            <Check aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-copper" />
            <span>{tip}</span>
          </li>
        ))}
        <li className="flex gap-2">
          <X aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-ink-muted" />
          <span>
            <span className="sr-only">Avoid: </span>
            {AVOID}
          </span>
        </li>
      </ul>
    </section>
  );
}

import type { GenerationMode, HealthResponse, QualityOption } from "@/lib/api";
import { Select } from "@/components/ui";

const MODES: Record<
  GenerationMode,
  {
    label: string;
    shortTitle: string;
    badge: string;
    hint: string;
    bestFor: string;
  }
> = {
  auto: {
    label: "AI — Full 3D reconstruction (any object)",
    shortTitle: "AI",
    badge: "Neural 3D",
    hint: "AI reconstructs full 360° geometry from one photo. Hidden rear and underside surfaces are inferred, not measured.",
    bestFor: "Complex shapes (shoes, chairs, toys, electronics)",
  },
  round: {
    label: "Round — Silhouette lathe + photo wrap (bottle, can, jar)",
    shortTitle: "Round",
    badge: "Local · Axisymmetric",
    hint: "Spins the upright silhouette into a smooth round mesh and wraps your front photo cleanly so curved labels stay sharp.",
    bestFor: "Upright bottles, cans, mugs, and jars shot straight-on",
  },
  box: {
    label: "Box — Planar photo wrap (packaging, book, phone)",
    shortTitle: "Box",
    badge: "Local · Planar",
    hint: "Places your photo onto a flat front face with edge-matched sides so printed text stays sharp. Depth is estimated.",
    bestFor: "Boxes, books, cartons, and flat rectangular items",
  },
};

/** Modes this server offers. Round and box run locally, so they never need upload consent. */
export function availableModes(
  health: HealthResponse | null | undefined
): GenerationMode[] {
  return (["auto", "round", "box"] as const).filter(
    (mode) =>
      mode === "auto" ||
      (mode === "round" ? health?.round_mode : health?.box_mode) === true
  );
}

/** Quality options advertised by the active verified provider or server health, if supported. */
export function availableQualityOptions(
  health: HealthResponse | null | undefined,
  providerId?: string
): QualityOption[] {
  const provider = health?.providers?.find((p) => p.id === providerId);
  const options = provider?.quality_options ?? health?.quality_options ?? [];
  return options.filter((opt) => Boolean(opt.id && opt.label));
}

interface ShapeModeSelectProps {
  id: string;
  modes: GenerationMode[];
  value: GenerationMode;
  onChange: (mode: GenerationMode) => void;
  disabled?: boolean;
}

export function ShapeModeSelect({
  id,
  modes,
  value,
  onChange,
  disabled,
}: ShapeModeSelectProps) {
  if (modes.length < 2) return null;
  const active = MODES[value];

  return (
    <div className="space-y-2">
      <Select
        id={id}
        label="Shape"
        value={value}
        disabled={disabled}
        options={modes.map((mode) => ({
          value: mode,
          label: MODES[mode].label,
        }))}
        onChange={(event) => onChange(event.target.value as GenerationMode)}
      />

      {/* Active reconstruction mode explanation */}
      <div className="rounded-[10px] border border-border-subtle bg-obsidian/55 px-3 py-2.5 text-[11px] leading-relaxed">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-ink-primary">
            {active.shortTitle} reconstruction
          </span>
          <span className="rounded-[6px] border border-border-subtle bg-raised px-1.5 py-0.5 text-[10px] text-ink-secondary">
            {active.badge}
          </span>
        </div>
        <p className="mt-1 text-ink-secondary">{active.hint}</p>
        <p className="mt-1 text-ink-muted">Best for: {active.bestFor}</p>

        <details className="mt-2 border-t border-border-subtle/70 pt-1.5">
          <summary className="cursor-pointer select-none text-[11px] font-medium text-ink-secondary hover:text-ink-primary">
            Compare AI, Round &amp; Box modes
          </summary>
          <dl className="mt-2 space-y-1.5 text-[11px]">
            {modes.map((m) => (
              <div key={m} className="grid grid-cols-[48px_1fr] gap-1.5">
                <dt className="font-semibold text-ink-primary">
                  {MODES[m].shortTitle}
                </dt>
                <dd className="text-ink-secondary">{MODES[m].bestFor}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </div>
  );
}

interface QualitySelectProps {
  id: string;
  options: QualityOption[];
  value: string;
  onChange: (qualityId: string) => void;
  disabled?: boolean;
}

export function QualitySelect({
  id,
  options,
  value,
  onChange,
  disabled,
}: QualitySelectProps) {
  if (options.length < 2) return null;
  const active = options.find((item) => item.id === value) ?? options[0];

  return (
    <Select
      id={id}
      label="Quality"
      value={active?.id ?? ""}
      disabled={disabled}
      hint={active?.description}
      options={options.map((opt) => ({ value: opt.id, label: opt.label }))}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

import type { GenerationMode, HealthResponse } from "@/lib/api";
import { Select } from "@/components/ui";

const MODES: Record<GenerationMode, { label: string; hint: string }> = {
  auto: { label: "AI (any object)", hint: "AI reconstructs the full shape. Hidden sides are guessed." },
  round: {
    label: "Round object (bottle, can, jar)",
    hint: "Wraps your photo onto a smooth round shape, so labels stay sharp. Shoot upright, from the front.",
  },
  box: {
    label: "Box (packaging, book, phone)",
    hint: "Puts your photo on the front of a box, so printed text stays sharp. Depth is estimated.",
  },
};

/** Modes this server offers. Round and box run locally, so they never need upload consent. */
export function availableModes(health: HealthResponse | null | undefined): GenerationMode[] {
  return (["auto", "round", "box"] as const).filter(
    (mode) => mode === "auto" || (mode === "round" ? health?.round_mode : health?.box_mode) === true
  );
}

interface ShapeModeSelectProps {
  id: string;
  modes: GenerationMode[];
  value: GenerationMode;
  onChange: (mode: GenerationMode) => void;
  disabled?: boolean;
}

export function ShapeModeSelect({ id, modes, value, onChange, disabled }: ShapeModeSelectProps) {
  if (modes.length < 2) return null;
  return (
    <Select
      id={id}
      label="Shape"
      value={value}
      disabled={disabled}
      hint={MODES[value].hint}
      options={modes.map((mode) => ({ value: mode, label: MODES[mode].label }))}
      onChange={(event) => onChange(event.target.value as GenerationMode)}
    />
  );
}

export type CameraPreset = "perspective" | "front" | "rear" | "side";

export type RenderMode = "textured" | "wireframe";

export type InteractionMode = "orbit" | "pan";

export interface CameraPresetConfig {
  id: CameraPreset;
  label: string;
  orbit: string;
  /** Azimuth in radians (0 = +Z front) and polar angle in radians from +Y */
  theta: number;
  phi: number;
}

export const DEFAULT_FOV_DEG = 34;
export const MIN_FOV_DEG = 14;
export const MAX_FOV_DEG = 60;

export const CAMERA_PRESETS: readonly CameraPresetConfig[] = [
  {
    id: "perspective",
    label: "Perspective",
    orbit: "35deg 72deg 105%",
    theta: (35 * Math.PI) / 180,
    phi: (72 * Math.PI) / 180,
  },
  {
    id: "front",
    label: "Front",
    orbit: "0deg 82deg 105%",
    theta: 0,
    phi: (82 * Math.PI) / 180,
  },
  {
    id: "rear",
    label: "Rear",
    orbit: "180deg 82deg 105%",
    theta: Math.PI,
    phi: (82 * Math.PI) / 180,
  },
  {
    id: "side",
    label: "Side",
    orbit: "90deg 82deg 105%",
    theta: Math.PI / 2,
    phi: (82 * Math.PI) / 180,
  },
] as const;

export function getCameraPresetConfig(preset: CameraPreset): CameraPresetConfig {
  return (
    CAMERA_PRESETS.find((item) => item.id === preset) ?? CAMERA_PRESETS[0]!
  );
}

export interface RuntimeMeshMetadata {
  vertices?: number;
  triangles?: number;
  dimensions?: [number, number, number];
  materialCount?: number;
  hasTextures?: boolean;
}

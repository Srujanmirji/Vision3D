export type CameraPreset =
  | "perspective"
  | "front"
  | "rear"
  | "side"
  | "top"
  | "bottom";

export type RenderMode = "textured" | "geometry" | "wireframe";

export type InteractionMode = "orbit" | "pan";

export type LightingPreset = "studio" | "soft" | "contrast";

export interface CameraPresetConfig {
  id: CameraPreset;
  label: string;
  orbit: string;
  /** Azimuth in radians (0 = +Z front) and polar angle in radians from +Y */
  theta: number;
  phi: number;
}

export interface LightingPresetConfig {
  id: LightingPreset;
  label: string;
  description: string;
  /** Multiplier applied to <model-viewer> exposure and Three.js studio lights */
  mvExposureBase: number;
  mvShadowIntensity: number;
  mvShadowSoftness: number;
  threeKeyIntensity: number;
  threeHemiIntensity: number;
  threeFillIntensity: number;
}

export interface ViewerEnvironmentState {
  showGrid: boolean;
  lightingPreset: LightingPreset;
  exposure: number;
  shadows: boolean;
}

export const DEFAULT_FOV_DEG = 34;
export const MIN_FOV_DEG = 14;
export const MAX_FOV_DEG = 60;

export const DEFAULT_VIEWER_ENVIRONMENT: ViewerEnvironmentState = {
  showGrid: false,
  lightingPreset: "studio",
  exposure: 1.0,
  shadows: true,
};

export const LIGHTING_PRESETS: readonly LightingPresetConfig[] = [
  {
    id: "studio",
    label: "Studio",
    description: "Balanced neutral fill with warm key light",
    mvExposureBase: 1.06,
    mvShadowIntensity: 1.15,
    mvShadowSoftness: 0.82,
    threeKeyIntensity: 1.35,
    threeHemiIntensity: 1.08,
    threeFillIntensity: 0.48,
  },
  {
    id: "soft",
    label: "Soft",
    description: "Diffused even illumination that reduces harsh glare",
    mvExposureBase: 0.96,
    mvShadowIntensity: 0.65,
    mvShadowSoftness: 0.96,
    threeKeyIntensity: 0.92,
    threeHemiIntensity: 1.32,
    threeFillIntensity: 0.62,
  },
  {
    id: "contrast",
    label: "Contrast",
    description: "Stronger directional key light to inspect surface relief",
    mvExposureBase: 1.14,
    mvShadowIntensity: 1.45,
    mvShadowSoftness: 0.62,
    threeKeyIntensity: 1.85,
    threeHemiIntensity: 0.72,
    threeFillIntensity: 0.34,
  },
] as const;

export function getLightingPresetConfig(
  preset: LightingPreset
): LightingPresetConfig {
  return (
    LIGHTING_PRESETS.find((item) => item.id === preset) ?? LIGHTING_PRESETS[0]!
  );
}

export const CAMERA_PRESETS: readonly CameraPresetConfig[] = [
  {
    id: "perspective",
    label: "Perspective",
    orbit: "35deg 72deg 94%",
    theta: (35 * Math.PI) / 180,
    phi: (72 * Math.PI) / 180,
  },
  {
    id: "front",
    label: "Front",
    orbit: "0deg 82deg 94%",
    theta: 0,
    phi: (82 * Math.PI) / 180,
  },
  {
    id: "rear",
    label: "Rear",
    orbit: "180deg 82deg 94%",
    theta: Math.PI,
    phi: (82 * Math.PI) / 180,
  },
  {
    id: "side",
    label: "Side",
    orbit: "90deg 82deg 94%",
    theta: Math.PI / 2,
    phi: (82 * Math.PI) / 180,
  },
  {
    id: "top",
    label: "Top",
    orbit: "0deg 2deg 98%",
    theta: 0,
    phi: (2 * Math.PI) / 180,
  },
  {
    id: "bottom",
    label: "Bottom",
    orbit: "0deg 178deg 98%",
    theta: 0,
    phi: (178 * Math.PI) / 180,
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

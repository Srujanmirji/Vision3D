import type { ModelAsset } from "./api";

/**
 * Explicitly labeled local sample GLB for inspecting the interactive 3D viewer
 * and AR preview flow without fabricating AI inference results.
 */
export const SAMPLE_MODEL: ModelAsset = {
  id: "sample-lounge-chair",
  name: "Lounge Armchair (Sample Asset)",
  glb_url: "/samples/sample-chair.glb",
  usdz_url: null,
  thumbnail_url: null,
  byte_size: 95360,
  created_at: "2026-11-27T00:00:00Z",
  is_sample: true,
};

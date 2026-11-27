export interface ViewerPreferences {
  defaultAutoRotate: boolean;
}

const STORAGE_KEY = "vision3d.viewer.preferences.v1";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function loadViewerPreferences(): ViewerPreferences {
  if (typeof window === "undefined") {
    return { defaultAutoRotate: false };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { defaultAutoRotate: !prefersReducedMotion() };
    }
    const parsed = JSON.parse(raw) as Partial<ViewerPreferences>;
    return {
      defaultAutoRotate:
        typeof parsed.defaultAutoRotate === "boolean"
          ? parsed.defaultAutoRotate
          : !prefersReducedMotion(),
    };
  } catch {
    return { defaultAutoRotate: !prefersReducedMotion() };
  }
}

export function saveViewerPreferences(prefs: ViewerPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota / private-mode restrictions
  }
}

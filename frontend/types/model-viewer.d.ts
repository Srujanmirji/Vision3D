import type { DetailedHTMLProps, HTMLAttributes } from "react";

export interface ModelViewerElement extends HTMLElement {
  src?: string;
  iosSrc?: string;
  alt?: string;
  ar?: boolean;
  arModes?: string;
  autoRotate?: boolean;
  cameraControls?: boolean;
  cameraOrbit: string;
  cameraTarget: string;
  fieldOfView: string;
  shadowIntensity?: string;
  shadowSoftness?: string;
  exposure?: string;
  environmentImage?: string;
  toneMapping?: string;
  canActivateAR?: boolean;
  loaded?: boolean;
  activateAR?: () => Promise<void>;
  getCameraOrbit?: () => { theta: number; phi: number; radius: number };
  getCameraTarget?: () => { x: number; y: number; z: number };
  getDimensions?: () => { x: number; y: number; z: number };
  resetTurntableRotation?: (theta?: number) => void;
  jumpCameraToGoal?: () => void;
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": DetailedHTMLProps<
        HTMLAttributes<ModelViewerElement> & {
          src?: string;
          "ios-src"?: string;
          alt?: string;
          ar?: boolean;
          "ar-modes"?: string;
          "ar-scale"?: string;
          "ar-placement"?: "floor" | "wall";
          "ar-usdz-max-texture-size"?: string;
          "camera-controls"?: boolean;
          "auto-rotate"?: boolean;
          "auto-rotate-delay"?: string | number;
          "rotation-per-second"?: string;
          "camera-orbit"?: string;
          "camera-target"?: string;
          "min-camera-orbit"?: string;
          "max-camera-orbit"?: string;
          "field-of-view"?: string;
          "interpolation-decay"?: string | number;
          "shadow-intensity"?: string;
          "shadow-softness"?: string;
          exposure?: string;
          "environment-image"?: string;
          "tone-mapping"?: string;
          "touch-action"?: string;
          "interaction-prompt"?: string;
          loading?: string;
          reveal?: string;
        },
        ModelViewerElement
      >;
    }
  }
}

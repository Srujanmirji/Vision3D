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
  exposure?: string;
  canActivateAR?: boolean;
  activateAR?: () => Promise<void>;
  getCameraOrbit?: () => { theta: number; phi: number; radius: number };
  getCameraTarget?: () => { x: number; y: number; z: number };
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
          "camera-controls"?: boolean;
          "auto-rotate"?: boolean;
          "auto-rotate-delay"?: string | number;
          "rotation-per-second"?: string;
          "camera-orbit"?: string;
          "camera-target"?: string;
          "min-camera-orbit"?: string;
          "max-camera-orbit"?: string;
          "field-of-view"?: string;
          "shadow-intensity"?: string;
          "shadow-softness"?: string;
          exposure?: string;
          "environment-image"?: string;
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

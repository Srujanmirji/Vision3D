import type { ApiErrorPayload } from "./api";

export interface FriendlyError {
  title: string;
  message: string;
}

/** What the user should understand and do next, per error code. The code itself stays visible for support. */
const COPY: Partial<Record<string, FriendlyError>> = {
  QUEUE_FULL: {
    title: "Vision3D is busy",
    message: "Several models are already being made. Try again in a minute.",
  },
  QUEUE_TIMEOUT: {
    title: "Waited too long in the queue",
    message: "The server stayed busy for too long. Try again in a minute.",
  },
  RATE_LIMITED: {
    title: "Too many uploads",
    message: "Wait a minute before uploading again.",
  },
  PROVIDER_UNAVAILABLE: {
    title: "The 3D generator is unavailable",
    message: "It may be offline or restarting. Try again in a minute. If it keeps failing, check that the Vision3D computer is on.",
  },
  QUOTA_EXCEEDED: {
    title: "The AI service is out of capacity",
    message: "The hosted 3D service has no free capacity right now. Try again later.",
  },
  TIMEOUT: {
    title: "This took too long",
    message: "Try again. A photo of one object on a plain background is faster and more reliable.",
  },
  INVALID_MODEL: {
    title: "Couldn't build a clean 3D model",
    message: "Try another photo: one object, fully in frame, on a plain background.",
  },
  INTERRUPTED: {
    title: "Generation was interrupted",
    message: "The server restarted before your model was finished. Please try again.",
  },
  CANCELLED: {
    title: "Generation cancelled",
    message: "Choose Generate 3D again when you're ready.",
  },
  NETWORK_ERROR: {
    title: "Can't reach Vision3D",
    message: "Check your internet connection. If you run Vision3D, make sure its computer and tunnel are on.",
  },
};

/** Photo-specific problems (size, format, consent) keep the server's precise message. */
export function friendlyError(error: ApiErrorPayload): FriendlyError {
  return COPY[error.code] ?? { title: "3D generation did not complete", message: error.message };
}

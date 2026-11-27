export const ACCEPTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB per REQUIREMENTS.md
export const MIN_IMAGE_DIMENSION = 64;
export const MAX_IMAGE_DIMENSION = 8192;

export interface ValidatedImageInfo {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
  warning: string | null;
}

export interface ImageValidationError {
  code: "INVALID_TYPE" | "FILE_TOO_LARGE" | "DECODE_FAILED" | "INVALID_DIMENSIONS";
  message: string;
}

export type ImageValidationResult =
  | { ok: true; data: ValidatedImageInfo }
  | { ok: false; error: ImageValidationError };

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function validateFileMetadata(
  file: File,
  maxBytes: number = DEFAULT_MAX_UPLOAD_BYTES
): ImageValidationError | null {
  if (
    !ACCEPTED_IMAGE_MIME_TYPES.includes(
      file.type as (typeof ACCEPTED_IMAGE_MIME_TYPES)[number]
    )
  ) {
    return {
      code: "INVALID_TYPE",
      message: "Unsupported image format. Please upload a JPEG, PNG, or WebP image.",
    };
  }

  if (file.size === 0) {
    return {
      code: "DECODE_FAILED",
      message: "The selected file is empty. Please choose a valid image.",
    };
  }

  if (file.size > maxBytes) {
    return {
      code: "FILE_TOO_LARGE",
      message: `Image exceeds the ${formatBytes(maxBytes)} limit (${formatBytes(file.size)}).`,
    };
  }

  return null;
}

function decodeImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      reject(new Error("Image could not be decoded."));
    };
    img.src = url;
  });
}

export async function validateImageFile(
  file: File,
  maxBytes: number = DEFAULT_MAX_UPLOAD_BYTES
): Promise<ImageValidationResult> {
  const metaError = validateFileMetadata(file, maxBytes);
  if (metaError) {
    return { ok: false, error: metaError };
  }

  const previewUrl = URL.createObjectURL(file);

  try {
    const { width, height } = await decodeImageDimensions(previewUrl);

    if (
      width < MIN_IMAGE_DIMENSION ||
      height < MIN_IMAGE_DIMENSION ||
      width > MAX_IMAGE_DIMENSION ||
      height > MAX_IMAGE_DIMENSION
    ) {
      URL.revokeObjectURL(previewUrl);
      return {
        ok: false,
        error: {
          code: "INVALID_DIMENSIONS",
          message: `Image dimensions (${width}×${height}) must be between ${MIN_IMAGE_DIMENSION}px and ${MAX_IMAGE_DIMENSION}px.`,
        },
      };
    }

    const ratio = Math.max(width / height, height / width);
    let warning: string | null = null;
    if (ratio > 2.5) {
      warning =
        "Wide or tall aspect ratio detected. A centered single foreground object produces cleaner 3D geometry.";
    } else if (width < 256 || height < 256) {
      warning =
        "Low-resolution image detected. Higher-resolution photos preserve finer texture detail.";
    }

    return {
      ok: true,
      data: {
        file,
        previewUrl,
        width,
        height,
        sizeBytes: file.size,
        mimeType: file.type,
        warning,
      },
    };
  } catch {
    URL.revokeObjectURL(previewUrl);
    return {
      ok: false,
      error: {
        code: "DECODE_FAILED",
        message: "Could not decode this image. Ensure the file is a valid JPEG, PNG, or WebP.",
      },
    };
  }
}

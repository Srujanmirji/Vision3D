/**
 * Phone photos are often 12+ MP and several MB. The backend reduces every input to
 * 1024 px before inference, so uploading the original only makes slow networks time out.
 * Re-encode to at most UPLOAD_MAX_EDGE px before sending (2x headroom over the backend size).
 */
export const UPLOAD_MAX_EDGE = 2048;

/** Largest original photo accepted in the browser; it is shrunk before upload, where the server limit applies. */
export const ORIGINAL_PHOTO_MAX_BYTES = 30 * 1024 * 1024;

/** The browser-side size check for a photo the user picks, given the server's upload limit. */
export function originalPhotoLimit(serverMaxBytes: number): number {
  return Math.max(serverMaxBytes, ORIGINAL_PHOTO_MAX_BYTES);
}
const JPEG_QUALITY = 0.9;

function scaledSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, UPLOAD_MAX_EDGE / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, JPEG_QUALITY));
}

/**
 * Return a smaller copy of the photo for upload, or the original when it is already small
 * or the browser cannot re-encode it. Canvas re-encoding also drops EXIF location data.
 */
export async function shrinkForUpload(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  let bitmap: ImageBitmap | null = null;
  try {
    // "from-image" applies the camera's EXIF rotation so portrait photos stay upright.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = scaledSize(bitmap.width, bitmap.height);
    const keepAlpha = file.type === "image/png";
    if (width === bitmap.width && height === bitmap.height && file.size <= 1_500_000) return file;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);

    const type = keepAlpha ? "image/png" : "image/jpeg";
    const blob = await encode(canvas, type);
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + (keepAlpha ? ".png" : ".jpg");
    return new File([blob], name, { type, lastModified: file.lastModified });
  } catch {
    return file; // Never block an upload because the optimisation failed.
  } finally {
    bitmap?.close();
  }
}

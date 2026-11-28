import base64
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from local_sf3d.foreground import apply_mask, foreground_box, frame_foreground

from .schemas import Failure, ForegroundPreview

FORMATS = {"JPEG", "PNG", "WEBP"}
MAX_PIXELS = 25_000_000
MAX_EDGE = 8192
OUTPUT_EDGE = 1024
MAX_MASK_BYTES = 1_100_000


def prepare_image(raw: bytes, output: Path) -> None:
    try:
        with Image.open(BytesIO(raw)) as image:
            if (
                image.format not in FORMATS
                or getattr(image, "n_frames", 1) != 1
                or min(image.size) < 16
                or max(image.size) > MAX_EDGE
                or image.width * image.height > MAX_PIXELS
            ):
                raise Failure("INVALID_IMAGE", "Upload a single JPEG, PNG or WebP within image limits.", 422)
            image.verify()
        with Image.open(BytesIO(raw)) as image:
            image.load()
            oriented = ImageOps.exif_transpose(image)
            mode = "RGBA" if "A" in oriented.getbands() or "transparency" in oriented.info else "RGB"
            oriented.thumbnail((OUTPUT_EDGE, OUTPUT_EDGE), Image.Resampling.LANCZOS)
            converted = oriented.convert(mode)
            stripped = Image.frombytes(mode, converted.size, converted.tobytes())
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise Failure("INVALID_IMAGE", "The image could not be decoded.", 422) from exc
    stripped.save(output, format="PNG")


def apply_reviewed_mask(photo: Path, raw: bytes) -> None:
    try:
        with Image.open(photo) as image, Image.open(BytesIO(raw), formats=["PNG"]) as mask:
            if mask.size != image.size or getattr(mask, "n_frames", 1) != 1:
                raise ValueError("Unexpected mask dimensions")
            if "A" in mask.getbands() and mask.getchannel("A").getextrema() != (255, 255):
                raise ValueError("PNG mask must use grayscale values with opaque pixels")
            framed = frame_foreground(apply_mask(image, mask.convert("L")))
        framed.save(photo, format="PNG")
    except (OSError, ValueError, Image.DecompressionBombError) as exc:
        raise Failure("INVALID_MASK", "Use a nonempty PNG mask matching the oriented photo.", 422) from exc


def foreground_preview(photo: Path, mask_path: Path) -> ForegroundPreview:
    def png_data(image: Image.Image) -> str:
        data = BytesIO()
        image.save(data, format="PNG")
        return base64.b64encode(data.getvalue()).decode("ascii")

    with Image.open(photo) as image, Image.open(mask_path) as mask:
        try:
            cutout = apply_mask(image, mask)
            box = foreground_box(mask)
        except ValueError as exc:
            raise Failure("EMPTY_FOREGROUND", "No clear foreground found. Try a simpler background.", 422) from exc
        return ForegroundPreview(
            width=image.width, height=image.height, crop=box,
            mask_png=png_data(mask), cutout_png=png_data(cutout),
        )

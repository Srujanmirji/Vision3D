from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from .schemas import Failure

FORMATS = {"JPEG", "PNG", "WEBP"}
MAX_PIXELS = 25_000_000
MAX_EDGE = 8192
OUTPUT_EDGE = 1024


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

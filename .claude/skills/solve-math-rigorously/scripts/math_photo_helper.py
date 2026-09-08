#!/usr/bin/env python3
"""Enhance math photos for cleaner inspection and transcription."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

try:
    from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps
except ImportError as exc:  # pragma: no cover - exercised in real runtime
    raise SystemExit(
        "Missing dependency: pillow. Run 'bash scripts/bootstrap_env.sh' from the skill root, "
        "then re-run this script with '.venv/bin/python3'."
    ) from exc


def save_image(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)


def sanitize_stem(text: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", text.strip())
    cleaned = cleaned.strip("-._")
    return cleaned or "image"


def annotate(image: Image.Image, title: str) -> Image.Image:
    canvas = Image.new("RGB", (image.width, image.height + 36), "#fffdf6")
    canvas.paste(image.convert("RGB"), (0, 36))
    draw = ImageDraw.Draw(canvas)
    draw.text((12, 10), title, fill="#1f2937")
    return canvas


def build_contact_sheet(variants: list[tuple[str, Image.Image]]) -> Image.Image:
    if not variants:
        raise ValueError("No image variants provided.")
    thumb_width = max(image.width for _, image in variants)
    thumb_height = max(image.height for _, image in variants) + 36
    columns = 2
    rows = (len(variants) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * thumb_width, rows * thumb_height), "#fffdf6")
    for index, (title, image) in enumerate(variants):
        row = index // columns
        col = index % columns
        annotated = annotate(image, title)
        sheet.paste(annotated, (col * thumb_width, row * thumb_height))
    return sheet


def threshold_image(image: Image.Image, cutoff: int) -> Image.Image:
    grayscale = ImageOps.grayscale(image)
    contrasted = ImageOps.autocontrast(grayscale)
    return contrasted.point(lambda value: 255 if value >= cutoff else 0, mode="1").convert("L")


def trim_white_border(image: Image.Image) -> Image.Image:
    if image.mode != "RGB":
        base_image = image.convert("RGB")
    else:
        base_image = image
    background = Image.new("RGB", base_image.size, base_image.getpixel((0, 0)))
    difference = ImageChops.difference(base_image, background)
    bbox = difference.getbbox()
    if bbox is None:
        return image
    return image.crop(bbox)


def tile_image(image: Image.Image, output_dir: Path, stem: str, tile_height: int, overlap: int) -> list[Path]:
    if tile_height <= 0:
        raise ValueError("--tile-height must be positive.")
    if overlap < 0:
        raise ValueError("--tile-overlap must be non-negative.")
    paths: list[Path] = []
    top = 0
    index = 1
    while top < image.height:
        bottom = min(image.height, top + tile_height)
        tile = image.crop((0, top, image.width, bottom))
        path = output_dir / f"{stem}-tile-{index:02d}.png"
        save_image(tile, path)
        paths.append(path)
        if bottom == image.height:
            break
        top = max(bottom - overlap, top + 1)
        index += 1
    return paths


def enhance(args: argparse.Namespace) -> int:
    input_path = Path(args.input)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    stem = sanitize_stem(args.prefix or input_path.stem)

    if input_path.suffix.lower() == ".pdf":
        raise ValueError(
            "math_photo_helper works on raster images. For PDFs, prefer Claude's native PDF reading first "
            "or convert the specific page to an image before using this helper."
        )
    if not 0 <= args.threshold <= 255:
        raise ValueError("--threshold must be between 0 and 255.")

    with Image.open(input_path) as raw_image:
        original = ImageOps.exif_transpose(raw_image).convert("RGB")
    if args.upscale != 1:
        if args.upscale <= 0:
            raise ValueError("--upscale must be positive.")
        original = original.resize(
            (int(original.width * args.upscale), int(original.height * args.upscale)),
            Image.Resampling.LANCZOS,
        )
    if args.trim_white:
        original = trim_white_border(original)

    grayscale = ImageOps.autocontrast(ImageOps.grayscale(original))
    sharpened = grayscale.filter(ImageFilter.UnsharpMask(radius=2, percent=180, threshold=3))
    high_contrast = threshold_image(original, args.threshold)

    variants = [
        ("color", original),
        ("grayscale", grayscale),
        ("sharpened", sharpened),
        ("high-contrast", high_contrast),
    ]

    saved: list[Path] = []
    for title, image in variants:
        path = output_dir / f"{stem}-{title}.png"
        save_image(image, path)
        saved.append(path)

    contact_sheet = build_contact_sheet(variants)
    contact_sheet_path = output_dir / f"{stem}-contact-sheet.png"
    save_image(contact_sheet, contact_sheet_path)
    saved.append(contact_sheet_path)

    tiled_source = sharpened if args.tile_source == "sharpened" else grayscale
    tiles = tile_image(tiled_source, output_dir, stem, args.tile_height, args.tile_overlap)
    saved.extend(tiles)

    print(f"Enhanced image set written to {output_dir}")
    for path in saved:
        print(path)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Enhance math photos for inspection.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    enhance_parser = subparsers.add_parser("enhance", help="create enhanced variants of an image")
    enhance_parser.add_argument("--input", required=True)
    enhance_parser.add_argument("--output-dir", required=True)
    enhance_parser.add_argument("--prefix", default="")
    enhance_parser.add_argument("--upscale", type=float, default=1.0)
    enhance_parser.add_argument("--threshold", type=int, default=185)
    enhance_parser.add_argument("--tile-height", type=int, default=1200)
    enhance_parser.add_argument("--tile-overlap", type=int, default=120)
    enhance_parser.add_argument("--tile-source", choices=["grayscale", "sharpened"], default="sharpened")
    enhance_parser.add_argument("--trim-white", action="store_true")
    enhance_parser.set_defaults(func=enhance)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

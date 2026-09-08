#!/usr/bin/env python3
"""Generate child-friendly SVG math manipulatives."""

from __future__ import annotations

import argparse
import html
from pathlib import Path


def svg_canvas(width: int, height: int, body: list[str]) -> str:
    return "\n".join(
        [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
            '<rect width="100%" height="100%" fill="#fffdf6"/>',
            "<style>",
            'text { font-family: "Avenir Next", "Trebuchet MS", sans-serif; fill: #1f2937; }',
            ".title { font-size: 24px; font-weight: 700; }",
            ".label { font-size: 16px; font-weight: 600; }",
            ".small { font-size: 14px; }",
            "</style>",
            *body,
            "</svg>",
        ]
    )


def save_svg(output: str, width: int, height: int, body: list[str]) -> int:
    output_path = Path(output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(svg_canvas(width, height, body), encoding="utf-8")
    print(f"Saved SVG to {output_path}")
    return 0


def parse_jump(text: str) -> tuple[int, int]:
    parts = [piece.strip() for piece in text.split(",", 1)]
    if len(parts) != 2:
        raise ValueError(f"Invalid jump '{text}'. Expected start,end.")
    return int(parts[0]), int(parts[1])


def number_line(args: argparse.Namespace) -> int:
    if args.end <= args.start:
        raise ValueError("--end must be greater than --start.")
    spacing = 70
    left = 50
    width = left * 2 + (args.end - args.start) * spacing
    height = 220
    base_y = 130
    body = []
    if args.title:
        body.append(
            f'<text x="{width / 2}" y="36" text-anchor="middle" class="title">{html.escape(args.title)}</text>'
        )
    body.append(
        '<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">'
        '<path d="M0,0 L0,6 L9,3 z" fill="#2563eb"/></marker></defs>'
    )
    body.append(
        f'<line x1="{left}" y1="{base_y}" x2="{width - left}" y2="{base_y}" stroke="#374151" stroke-width="4"/>'
    )

    highlights = set(args.highlight)
    positions: dict[int, int] = {}
    for value in range(args.start, args.end + 1):
        x = left + (value - args.start) * spacing
        positions[value] = x
        body.append(
            f'<line x1="{x}" y1="{base_y - 14}" x2="{x}" y2="{base_y + 14}" stroke="#374151" stroke-width="3"/>'
        )
        if value in highlights:
            body.append(
                f'<circle cx="{x}" cy="{base_y}" r="22" fill="#fef3c7" stroke="#f59e0b" stroke-width="3"/>'
            )
        body.append(f'<text x="{x}" y="{base_y + 45}" text-anchor="middle" class="label">{value}</text>')

    for jump in args.jump:
        jump_start, jump_end = parse_jump(jump)
        if jump_start not in positions or jump_end not in positions:
            raise ValueError("Jump endpoints must be inside the number line range.")
        x1 = positions[jump_start]
        x2 = positions[jump_end]
        arc_height = 35 + 10 * abs(jump_end - jump_start)
        mid = (x1 + x2) / 2
        body.append(
            f'<path d="M {x1} {base_y - 18} Q {mid} {base_y - arc_height} {x2} {base_y - 18}" '
            'fill="none" stroke="#2563eb" stroke-width="4" marker-end="url(#arrow)"/>'
        )
        body.append(
            f'<text x="{mid}" y="{base_y - arc_height - 8}" text-anchor="middle" class="small">jump {jump_start} to {jump_end}</text>'
        )

    return save_svg(args.output, width, height, body)


def array_model(args: argparse.Namespace) -> int:
    if args.rows <= 0 or args.cols <= 0:
        raise ValueError("--rows and --cols must be positive.")
    cell = 48
    margin = 40
    width = margin * 2 + args.cols * cell
    height = 140 + args.rows * cell
    body = []
    title = args.title or f"{args.rows} rows of {args.cols}"
    body.append(f'<text x="{width / 2}" y="34" text-anchor="middle" class="title">{html.escape(title)}</text>')
    for row in range(args.rows):
        for col in range(args.cols):
            x = margin + col * cell
            y = 70 + row * cell
            body.append(
                f'<rect x="{x}" y="{y}" width="{cell - 6}" height="{cell - 6}" rx="10" fill="#bfdbfe" stroke="#1d4ed8" stroke-width="2"/>'
            )
    body.append(
        f'<text x="{width / 2}" y="{height - 24}" text-anchor="middle" class="label">{args.rows} x {args.cols} = {args.rows * args.cols}</text>'
    )
    return save_svg(args.output, width, height, body)


def fraction_bar(args: argparse.Namespace) -> int:
    if args.parts <= 0:
        raise ValueError("--parts must be positive.")
    if not 0 <= args.filled <= args.parts:
        raise ValueError("--filled must be between 0 and --parts.")
    width = 620
    height = 180
    margin = 40
    bar_width = width - margin * 2
    segment = bar_width / args.parts
    body = []
    title = args.title or f"{args.filled}/{args.parts}"
    body.append(f'<text x="{width / 2}" y="34" text-anchor="middle" class="title">{html.escape(title)}</text>')
    for index in range(args.parts):
        x = margin + index * segment
        fill = "#86efac" if index < args.filled else "#ffffff"
        body.append(
            f'<rect x="{x:.2f}" y="70" width="{segment:.2f}" height="48" fill="{fill}" stroke="#166534" stroke-width="2"/>'
        )
    body.append(
        f'<text x="{width / 2}" y="146" text-anchor="middle" class="label">{args.filled} out of {args.parts} equal parts</text>'
    )
    return save_svg(args.output, width, height, body)


def place_value(args: argparse.Namespace) -> int:
    if not args.number.isdigit():
        raise ValueError("--number must be a non-negative whole number.")
    labels = [
        "ones",
        "tens",
        "hundreds",
        "thousands",
        "ten-thousands",
        "hundred-thousands",
        "millions",
    ]
    digits = list(args.number)
    place_labels = labels[: len(digits)]
    place_labels.reverse()

    width = max(680, 160 * len(digits))
    height = 260
    margin = 30
    card_width = (width - margin * 2) / len(digits)
    body = []
    title = args.title or f"Place value of {args.number}"
    body.append(f'<text x="{width / 2}" y="34" text-anchor="middle" class="title">{html.escape(title)}</text>')
    expanded_parts = []
    for index, digit in enumerate(digits):
        x = margin + index * card_width
        value = int(digit) * (10 ** (len(digits) - index - 1))
        fill = "#fde68a" if digit != "0" else "#e5e7eb"
        body.append(
            f'<rect x="{x:.2f}" y="70" width="{card_width - 12:.2f}" height="110" rx="14" fill="{fill}" stroke="#92400e" stroke-width="2"/>'
        )
        body.append(
            f'<text x="{x + (card_width - 12) / 2:.2f}" y="108" text-anchor="middle" class="label">{html.escape(place_labels[index])}</text>'
        )
        body.append(
            f'<text x="{x + (card_width - 12) / 2:.2f}" y="148" text-anchor="middle" class="title">{digit}</text>'
        )
        body.append(
            f'<text x="{x + (card_width - 12) / 2:.2f}" y="172" text-anchor="middle" class="small">value {value}</text>'
        )
        if value:
            expanded_parts.append(str(value))
    expanded = " + ".join(expanded_parts) if expanded_parts else "0"
    body.append(
        f'<text x="{width / 2}" y="228" text-anchor="middle" class="label">expanded form: {expanded}</text>'
    )
    return save_svg(args.output, width, height, body)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate child-friendly SVG math manipulatives.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    number_line_parser = subparsers.add_parser("number-line", help="create a number line")
    number_line_parser.add_argument("--start", type=int, required=True)
    number_line_parser.add_argument("--end", type=int, required=True)
    number_line_parser.add_argument("--highlight", action="append", type=int, default=[])
    number_line_parser.add_argument("--jump", action="append", default=[], help="start,end")
    number_line_parser.add_argument("--title", default="")
    number_line_parser.add_argument("--output", required=True)
    number_line_parser.set_defaults(func=number_line)

    array_parser = subparsers.add_parser("array", help="create an array model")
    array_parser.add_argument("--rows", type=int, required=True)
    array_parser.add_argument("--cols", type=int, required=True)
    array_parser.add_argument("--title", default="")
    array_parser.add_argument("--output", required=True)
    array_parser.set_defaults(func=array_model)

    fraction_parser = subparsers.add_parser("fraction-bar", help="create a fraction bar")
    fraction_parser.add_argument("--parts", type=int, required=True)
    fraction_parser.add_argument("--filled", type=int, required=True)
    fraction_parser.add_argument("--title", default="")
    fraction_parser.add_argument("--output", required=True)
    fraction_parser.set_defaults(func=fraction_bar)

    place_value_parser = subparsers.add_parser("place-value", help="create a place value chart")
    place_value_parser.add_argument("--number", required=True)
    place_value_parser.add_argument("--title", default="")
    place_value_parser.add_argument("--output", required=True)
    place_value_parser.set_defaults(func=place_value)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

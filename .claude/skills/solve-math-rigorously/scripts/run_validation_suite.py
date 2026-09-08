#!/usr/bin/env python3
"""Regression-test the math skill helper scripts."""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
VERIFY = ROOT / "math_verify.py"
VISUALIZE = ROOT / "math_visualize.py"
TABLE = ROOT / "math_table.py"
MANIPULATIVES = ROOT / "math_manipulatives.py"
PRACTICE = ROOT / "math_practice.py"
PHOTO = ROOT / "math_photo_helper.py"
PYTHON = Path(sys.executable)


def run_case(label: str, command: list[str], expected_exit: int, must_contain: str | None = None) -> None:
    result = subprocess.run(command, capture_output=True, text=True)
    output = (result.stdout + result.stderr).strip()
    if result.returncode != expected_exit:
        raise RuntimeError(
            f"{label}: expected exit {expected_exit}, got {result.returncode}\nCommand: {' '.join(command)}\n{output}"
        )
    if must_contain and must_contain not in output:
        raise RuntimeError(
            f"{label}: expected output to contain '{must_contain}'\nCommand: {' '.join(command)}\n{output}"
        )
    print(f"[PASS] {label}")


def build_sample_photo(path: Path) -> None:
    image = Image.new("RGB", (900, 1500), "white")
    draw = ImageDraw.Draw(image)
    y = 60
    for line in [
        "Solve the equation:",
        "x^2 + 5x + 6 = 0",
        "",
        "Triangle ABC is right-angled at C.",
        "AC = 3, BC = 4. Find AB.",
    ]:
        draw.text((40, y), line, fill="black")
        y += 90
    image.save(path)


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="math-skill-validation-") as temp_dir:
        temp_path = Path(temp_dir)
        run_case(
            "equivalence identity",
            [str(PYTHON), str(VERIFY), "equiv", "sin(x)^2 + cos(x)^2", "1"],
            0,
            "status: PASS",
        )
        run_case(
            "derivative pass",
            [str(PYTHON), str(VERIFY), "derivative", "x^3 * exp(x)", "exp(x) * (x^3 + 3*x^2)", "--var", "x"],
            0,
            "status: PASS",
        )
        run_case(
            "derivative fail",
            [str(PYTHON), str(VERIFY), "derivative", "x^2", "3*x", "--var", "x"],
            1,
            "status: FAIL",
        )
        run_case(
            "definite integral",
            [str(PYTHON), str(VERIFY), "definite-integral", "2*x*cos(x^2)", "0", "sqrt(pi)", "sin(pi)", "--var", "x"],
            0,
            "status: PASS",
        )
        run_case(
            "solve quadratic",
            [str(PYTHON), str(VERIFY), "solve", "x^2 - 5*x + 6 = 0", "--var", "x", "--expected", "2", "--expected", "3"],
            0,
            "status: PASS",
        )
        run_case(
            "satisfies relation",
            [str(PYTHON), str(VERIFY), "satisfies", "x^2 + y^2 = 25", "--assignment", "x=3", "--assignment", "y=4"],
            0,
            "status: PASS",
        )
        run_case(
            "satisfies inequality",
            [str(PYTHON), str(VERIFY), "satisfies", "x > 2", "--assignment", "x=3"],
            0,
            "status: PASS",
        )
        run_case(
            "system solution",
            [
                str(PYTHON),
                str(VERIFY),
                "system",
                "--equation",
                "x+y=5",
                "--equation",
                "x-y=1",
                "--assignment",
                "x=3",
                "--assignment",
                "y=2",
            ],
            0,
            "status: PASS",
        )
        run_case(
            "infinite limit",
            [str(PYTHON), str(VERIFY), "limit", "1/x", "0", "oo", "--var", "x", "--dir", "+"],
            0,
            "status: PASS",
        )
        run_case(
            "counterexample search",
            [str(PYTHON), str(VERIFY), "counterexample", "sin(x) >= x", "--var", "x", "--xmin", "0.1", "--xmax", "2"],
            1,
            "witness:",
        )
        run_case(
            "sequence table",
            [str(PYTHON), str(TABLE), "sequence", "n^2 + n + 1", "--start", "1", "--end", "4"],
            0,
            "| n | exact | approx |",
        )
        run_case(
            "iteration table",
            [str(PYTHON), str(TABLE), "iterate", "cos(x)", "--start", "1", "--steps", "4"],
            0,
            "| k | x_k | approx |",
        )
        plot_path = temp_path / "validation-plot.png"
        run_case(
            "plot with shading",
            [
                str(PYTHON),
                str(VISUALIZE),
                "--expr",
                "x^2",
                "--shade-upper",
                "x^2",
                "--shade-lower",
                "0",
                "--shade-from",
                "0",
                "--shade-to",
                "2",
                "--xmin",
                "-1",
                "--xmax",
                "3",
                "--output",
                str(plot_path),
            ],
            0,
            "Saved plot to",
        )
        if not plot_path.exists():
            raise RuntimeError("plot with shading: output file was not created")
        number_line_path = temp_path / "number-line.svg"
        run_case(
            "number line manipulative",
            [
                str(PYTHON),
                str(MANIPULATIVES),
                "number-line",
                "--start",
                "0",
                "--end",
                "10",
                "--highlight",
                "7",
                "--jump",
                "3,7",
                "--output",
                str(number_line_path),
            ],
            0,
            "Saved SVG to",
        )
        if not number_line_path.exists():
            raise RuntimeError("number line manipulative: output file was not created")
        fraction_bar_path = temp_path / "fraction-bar.svg"
        run_case(
            "fraction bar manipulative",
            [
                str(PYTHON),
                str(MANIPULATIVES),
                "fraction-bar",
                "--parts",
                "8",
                "--filled",
                "3",
                "--output",
                str(fraction_bar_path),
            ],
            0,
            "Saved SVG to",
        )
        if not fraction_bar_path.exists():
            raise RuntimeError("fraction bar manipulative: output file was not created")
        worksheet_path = temp_path / "worksheet.md"
        run_case(
            "practice worksheet",
            [
                str(PYTHON),
                str(PRACTICE),
                "worksheet",
                "--topic",
                "addition-within-20",
                "--count",
                "5",
                "--seed",
                "7",
                "--audience",
                "combined",
                "--output",
                str(worksheet_path),
            ],
            0,
            "Wrote worksheet to",
        )
        if not worksheet_path.exists():
            raise RuntimeError("practice worksheet: output file was not created")
        worksheet_text = worksheet_path.read_text(encoding="utf-8")
        if "## Answer Key" not in worksheet_text or "## Hint Ladder" not in worksheet_text:
            raise RuntimeError("practice worksheet: expected answer key and hint ladder sections")
        lesson_path = temp_path / "lesson.md"
        run_case(
            "lesson plan",
            [
                str(PYTHON),
                str(PRACTICE),
                "lesson",
                "--topic",
                "fractions-of-sets",
                "--duration",
                "30",
                "--seed",
                "9",
                "--output",
                str(lesson_path),
            ],
            0,
            "Wrote lesson plan to",
        )
        if not lesson_path.exists():
            raise RuntimeError("lesson plan: output file was not created")
        lesson_text = lesson_path.read_text(encoding="utf-8")
        if "## Exit Ticket" not in lesson_text or "## Success Criteria" not in lesson_text:
            raise RuntimeError("lesson plan: expected exit ticket and success criteria sections")
        review_path = temp_path / "review.md"
        run_case(
            "review plan",
            [
                str(PYTHON),
                str(PRACTICE),
                "review-plan",
                "--topic",
                "addition-within-20",
                "--topic",
                "multiplication-facts",
                "--days",
                "4",
                "--seed",
                "5",
                "--output",
                str(review_path),
            ],
            0,
            "Wrote review plan to",
        )
        if not review_path.exists():
            raise RuntimeError("review plan: output file was not created")
        review_text = review_path.read_text(encoding="utf-8")
        if "## Day 1" not in review_text or "## Answer Key" not in review_text:
            raise RuntimeError("review plan: expected day sections and answer key")
        photo_path = temp_path / "worksheet-photo.png"
        build_sample_photo(photo_path)
        photo_dir = temp_path / "photo-enhanced"
        run_case(
            "photo enhancement",
            [
                str(PYTHON),
                str(PHOTO),
                "enhance",
                "--input",
                str(photo_path),
                "--output-dir",
                str(photo_dir),
                "--prefix",
                "worksheet photo",
                "--upscale",
                "1.5",
                "--tile-height",
                "700",
                "--trim-white",
            ],
            0,
            "Enhanced image set written to",
        )
        expected_outputs = [
            photo_dir / "worksheet-photo-color.png",
            photo_dir / "worksheet-photo-grayscale.png",
            photo_dir / "worksheet-photo-sharpened.png",
            photo_dir / "worksheet-photo-high-contrast.png",
            photo_dir / "worksheet-photo-contact-sheet.png",
            photo_dir / "worksheet-photo-tile-01.png",
        ]
        for path in expected_outputs:
            if not path.exists():
                raise RuntimeError(f"photo enhancement: expected output missing: {path}")
    print("Validation suite completed successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

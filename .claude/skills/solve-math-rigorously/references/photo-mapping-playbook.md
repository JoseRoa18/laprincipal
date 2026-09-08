# Photo Mapping Playbook

Use this when the math task comes from a photo, screenshot, scan, textbook page, whiteboard, or handwritten note. For PDFs, start with Claude's native PDF reading and use this playbook for page-level transcription discipline.

## Intake Order

1. Inspect the whole image.
2. Identify the exact problem boundaries.
3. Transcribe the text and symbols faithfully.
4. Separate what is certain from what is inferred.
5. Only then map the mathematics and solve.

## Transcription Rules

- Preserve exponents, subscripts, radicals, fraction structure, and inequality symbols.
- Keep line breaks or item numbers when they matter.
- Distinguish printed text from handwritten edits or annotations.
- If multiple readings are plausible, write them explicitly.

## Ambiguity Checklist

Watch for:

- `x` vs multiplication sign
- `1` vs `l`
- minus vs dash
- `>` vs `>=`
- faint exponents
- missing parentheses
- cropped denominators or radicals
- diagram labels that look like numbers

## Workflow For Hard Images

- If the source is a raster image and code execution is available, enhance it with `scripts/math_photo_helper.py`.
- Re-read the enhanced variants.
- If a single reading still cannot be trusted, present the competing readings before solving.

## Before Solving

Create a clean internal statement:

1. typed problem statement
2. diagram givens
3. unknown to find
4. constraints and assumptions

Solve from that cleaned statement, not directly from the noisy image.

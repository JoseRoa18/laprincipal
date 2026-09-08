# math-skill

A Claude skill for solving math problems rigorously — from quick calculations to full proofs.

## What it does

This skill makes Claude a careful, solver-first math assistant. Instead of jumping straight to an answer, it maps the problem, selects the right method, works through each step explicitly, and verifies the result before presenting it. The goal is answers you can actually trust.

It works with typed problems and with photos — snap a handwritten problem, a whiteboard, or a textbook page and Claude will transcribe it carefully before solving.

## Solving modes

| Mode | What you get |
|------|-------------|
| `solver` (default) | Full problem map, method choice, step-by-step derivation, independent verification |
| `photo-solver` | Transcribe from image first, then solve and verify |
| `fast-answer` | Concise output, but mapping and verification still happen internally |
| `worked-solution` | Full derivation with the key insight made explicit |
| `proof` | Exploration separated from the final clean argument |
| `exam` | Minimal exposition, essential steps only, answer easy to grade |
| `tutor` | Reveals the next move rather than the full solution at once |

Educational modes (`lesson`, `worksheet`, `diagnostic`, `review`, `primary-school`) are also available when you want teaching materials rather than a solution.

## What kinds of problems it handles

- Equations and systems (linear, polynomial, transcendental)
- Inequalities and optimization
- Proofs and number theory
- Counting, combinatorics, and probability
- Sequences, recurrences, and series
- Calculus — limits, derivatives, integrals
- Geometry and trigonometry
- Word problems and modeling
- Reading math from photos, screenshots, PDFs, and handwritten notes

## Verification tools

The skill ships with Python helpers that Claude uses to double-check its own work:

- **`math_verify.py`** — checks expression equivalence, derivatives, integrals, equation solutions, limits, and counterexamples using SymPy
- **`math_visualize.py`** — plots expressions and shaded regions with matplotlib
- **`math_table.py`** — generates tables for sequences and iterations
- **`math_photo_helper.py`** — enhances and tiles photos for cleaner transcription

These run automatically when code execution is available. When it isn't, Claude continues solving and makes its verification status explicit.

## Installation

Install the `.skill` file directly in the Claude desktop app:

1. Download `math-skill.skill` from [Releases](../../releases)
2. In Claude (Cowork or Claude Desktop), open the plugins/skills panel
3. Drag and drop the `.skill` file to install

Or clone this repo and zip the contents as `math-skill.skill` (a `.skill` file is just a zip archive of the skill directory).

## Example prompts

```
Solve x³ - 6x² + 11x - 6 = 0
```
```
Prove that √2 is irrational
```
```
[photo of handwritten problem] What's the answer to this?
```
```
Find the maximum of f(x) = x·e^(-x) on [0, ∞)
```
```
In tutor mode: help me find the integral of x·sin(x)
```

## Repository structure

```
math-skill/
├── SKILL.md                          # Skill instructions loaded by Claude
├── references/                       # Playbooks for specific problem types
│   ├── problem-mapping-playbook.md
│   ├── method-selection-playbook.md
│   ├── solver-loop-playbook.md
│   ├── verification-playbook.md
│   ├── proof-playbook.md
│   ├── photo-mapping-playbook.md
│   ├── diagram-reading-playbook.md
│   ├── visualization-playbook.md
│   └── ...                           # Teaching and educational playbooks
└── scripts/                          # Python verification helpers
    ├── math_verify.py
    ├── math_visualize.py
    ├── math_table.py
    ├── math_photo_helper.py
    ├── math_manipulatives.py
    ├── math_practice.py
    ├── run_validation_suite.py
    ├── bootstrap_env.sh
    └── requirements.txt
```

## Requirements

The Python helpers require `sympy`, `numpy`, and `matplotlib`. Bootstrap automatically:

```bash
bash scripts/bootstrap_env.sh
```

This creates a `.venv` in the skill directory and installs all dependencies.

## License

MIT

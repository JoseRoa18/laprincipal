# Visualization Playbook

Choose a visual because it answers a question, not because the problem looks abstract.

## Plot Functions When

- the user needs roots, intersections, extrema, concavity, asymptotes, or periodic behavior
- two expressions should be compared on the same axes
- a limit or optimization problem benefits from shape intuition

Command pattern:

```bash
.venv/bin/python3 scripts/math_visualize.py --expr "f(x)" --expr "g(x)" --xmin -5 --xmax 5 --output /tmp/plot.png
```

## Use A Number Line Or Sign Chart When

- solving inequalities
- tracking the sign of a derivative or factorized expression
- describing open and closed intervals

Usually build these manually in the explanation after finding critical points.

## Use A Coordinate Sketch When

- solving geometry or vector problems
- interpreting trigonometric relationships
- translating verbal descriptions into positions, slopes, or distances

Keep the sketch simple and label only the relevant points, lengths, and angles.

## Use A Table When

- iterating a recurrence
- showing sequence growth or convergence
- comparing expected and observed values
- demonstrating a numerical method step by step

Tables often teach better than a full plot for short sequences.

## Presentation Rules

- Pick ranges from the math. Do not accept a useless default window if the interesting behavior lies elsewhere.
- Label axes and notable points.
- Mention what the visual confirms and what it only suggests.
- If the visual contradicts the algebra, trust neither immediately. Re-check both.

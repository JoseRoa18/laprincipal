# Verification Playbook

Use at least one independent check for any nontrivial result. Increase the rigor when the problem is easy to get subtly wrong.

## Algebra And Equation Solving

- Substitute candidate solutions into the original statement, not only into a transformed version.
- Check excluded values from denominators, radicals, inverse trig, and logarithms.
- Compare forms by factoring, expanding, or simplifying, then use `math_verify.py equiv` when needed.
- For a single relation with a concrete candidate, use `math_verify.py satisfies`.
- For systems, verify every equation and state whether free parameters remain. Use `math_verify.py system` when a concrete assignment is being checked.

## Calculus

- For derivatives, differentiate your final expression again only if the first derivative looks suspicious; otherwise compare the derivative directly with `math_verify.py derivative`.
- For antiderivatives, differentiate the candidate and remember the constant of integration.
- For definite integrals, combine the symbolic answer with sign or area intuition and, if useful, a quick numeric estimate.
- For limits, inspect one-sided behavior, dominant terms, and removable singularities separately.
- For series, compare early terms and check convergence claims independently.

## Linear Algebra

- Multiply matrices back to confirm inverses or solutions.
- Check determinant, rank, or reduced row-echelon form when uniqueness matters.
- Confirm eigenpairs by direct multiplication `A v = lambda v`.
- Distinguish exact symbolic entries from rounded approximations.

## Probability And Statistics

- Confirm probabilities stay in `[0, 1]` and total probability sums to `1`.
- Check whether events are independent before multiplying probabilities.
- Use complements to cross-check counting arguments.
- For expected value or variance, verify units and scale. A variance cannot be negative.

## Geometry And Trigonometry

- Check units, angle mode, and whether triangles satisfy obvious side or angle constraints.
- Translate geometry to coordinates if the synthetic path gets unclear.
- Use symmetry, special triangles, or area decompositions as a second method.
- Let diagrams guide intuition, but keep the proof algebraic or geometric.

## Discrete Math And Proofs

- Test small cases before generalizing.
- Search for counterexamples whenever a universal claim is made.
- State induction hypotheses precisely and verify base cases separately.
- Use computations only to suggest structure, never as the full proof.

## Word Problems And Modeling

- Define variables before writing equations.
- Check whether the result is physically or contextually sensible.
- Reinsert units at the end.
- Verify that the solution satisfies any integer, positivity, or domain constraints from the story.
- When the story produces equations, test the final numeric answer back in the original context, not only in the cleaned algebraic form.

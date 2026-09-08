# Proof Playbook

Use this when the task is a proof, a universal claim, or a challenge problem where the main difficulty is finding the right idea.

## First Pass

1. Rewrite the claim precisely, including quantifiers and domain.
2. Test small or extreme cases.
3. Try to break the statement before trying to prove it.
4. Extract the likely governing idea: symmetry, parity, monotonicity, invariant, extremal element, telescoping, or a hidden substitution.

## Proof Spine

- State the target clearly.
- Name the intermediate claim that will unlock the result.
- Keep each step logically justified.
- Distinguish heuristic motivation from the formal proof.

## Common Structures

### Equality

- Work forward from the left side or backward from the right side, but do not mix directions invisibly.
- Try to transform the difference into `0` or a sum of nonnegative terms.
- For identities, compare derivatives plus an anchor value only when that method is legitimate and simpler.

### Inequalities

- Check equality cases early.
- Look for convexity, AM-GM, Cauchy-Schwarz, rearrangement, Jensen, or a square-completion path.
- Normalize variables when scale is distracting.

### Induction

- Verify base cases explicitly.
- State the induction hypothesis exactly.
- Make the transition step isolate the new work; do not silently reuse the target statement.

### Number Theory

- Check parity, modular arithmetic, divisibility chains, and valuations.
- If a Diophantine claim looks false, search for a witness before spending time proving it.

### Combinatorics

- Look for bijections, double counting, invariants, extremal arguments, and recurrences.
- For counting formulas, verify small `n` manually.

### Geometry

- Decide early whether synthetic, coordinate, vector, or complex-number geometry is the cleaner language.
- Use diagrams for orientation, not as proof.

## Falsification Rule

If the claim is universal and the path to proof is unclear, use `scripts/math_verify.py counterexample` on a relevant interval or parameter range. A single witness beats pages of shaky algebra.

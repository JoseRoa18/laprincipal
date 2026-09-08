# Solver Loop Playbook

Use this when you know the problem type but the path is still unclear.

## Loop

1. map the problem
2. choose the most promising branch
3. push until a hinge step succeeds or fails
4. checkpoint
5. pivot if needed
6. verify the candidate result

## Checkpoints

After each nontrivial move, ask:

- Was that transformation legal?
- Did the domain change?
- Is the new form actually closer to the target?
- Did I lose or introduce solutions?

## Pivot Options

If the branch stalls, try one of these:

- simplify the target instead of the givens
- solve a smaller or special case
- switch from symbolic to graphical or tabular inspection
- change variables
- differentiate, factor, or complete a square
- move from synthetic geometry to coordinates
- search for a counterexample before proving more

## When To Stop

Stop exploring and start writing the solution when:

- the candidate answer survives direct checks
- the method spine is clear
- the remaining steps are routine

Do not present a polished final answer before the candidate has survived testing.

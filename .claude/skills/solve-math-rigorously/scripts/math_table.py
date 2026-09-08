#!/usr/bin/env python3
"""Generate sequence and iteration tables for math explanations."""

from __future__ import annotations

import argparse
import math
import re
import sys
from typing import Iterable

try:
    import sympy as sp
    from sympy.parsing.sympy_parser import (
        convert_xor,
        function_exponentiation,
        implicit_multiplication_application,
        parse_expr,
        standard_transformations,
    )
except ImportError as exc:  # pragma: no cover - exercised in real runtime
    print(
        "Missing dependency: sympy. Run 'bash scripts/bootstrap_env.sh' from the skill root, "
        "then re-run this script with '.venv/bin/python3'.",
        file=sys.stderr,
    )
    raise SystemExit(2) from exc


TRANSFORMATIONS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
    function_exponentiation,
)
RESERVED_NAMES = {
    "Abs",
    "E",
    "I",
    "Piecewise",
    "cos",
    "cosh",
    "cot",
    "csc",
    "e",
    "exp",
    "ln",
    "log",
    "oo",
    "pi",
    "sec",
    "sin",
    "sinh",
    "sqrt",
    "tan",
    "tanh",
}


def infer_symbol_names(texts: Iterable[str]) -> list[str]:
    names: set[str] = set()
    for text in texts:
        for token in re.findall(r"[A-Za-z_]\w*", text):
            if token not in RESERVED_NAMES:
                names.add(token)
    return sorted(names)


def build_symbol_table(names: Iterable[str]) -> dict[str, object]:
    table = {name: sp.Symbol(name) for name in names}
    table.update(
        {
            "e": sp.E,
            "E": sp.E,
            "I": sp.I,
            "oo": sp.oo,
            "pi": sp.pi,
            "ln": sp.log,
            "log": sp.log,
            "sqrt": sp.sqrt,
            "sin": sp.sin,
            "cos": sp.cos,
            "tan": sp.tan,
            "cot": sp.cot,
            "sec": sp.sec,
            "csc": sp.csc,
            "sinh": sp.sinh,
            "cosh": sp.cosh,
            "tanh": sp.tanh,
            "exp": sp.exp,
            "Abs": sp.Abs,
            "Piecewise": sp.Piecewise,
        }
    )
    return table


def parse_math(text: str, names: Iterable[str]) -> sp.Expr:
    return sp.sympify(
        parse_expr(
            text,
            local_dict=build_symbol_table(names),
            transformations=TRANSFORMATIONS,
            evaluate=True,
        )
    )


def parse_assignments(items: list[str], names: Iterable[str]) -> dict[str, sp.Expr]:
    assignments: dict[str, sp.Expr] = {}
    all_names = set(names)
    for item in items:
        if "=" not in item:
            raise ValueError(f"Invalid assignment '{item}'. Expected name=value.")
        key, value = item.split("=", 1)
        symbol_name = key.strip()
        all_names.add(symbol_name)
        assignments[symbol_name] = parse_math(value.strip(), all_names)
    return assignments


def approximate(expr: sp.Expr) -> str:
    try:
        numeric = complex(sp.N(expr, 20))
    except Exception:
        return "n/a"
    if not math.isfinite(numeric.real) or not math.isfinite(numeric.imag):
        return "n/a"
    if abs(numeric.imag) < 1e-12:
        return f"{numeric.real:.12g}"
    return f"{numeric.real:.12g}{numeric.imag:+.12g}j"


def emit_markdown(headers: list[str], rows: list[list[str]]) -> None:
    print("| " + " | ".join(headers) + " |")
    print("| " + " | ".join(["---"] * len(headers)) + " |")
    for row in rows:
        print("| " + " | ".join(row) + " |")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate math tables.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    sequence = subparsers.add_parser("sequence", help="tabulate an expression by integer index")
    sequence.add_argument("expression")
    sequence.add_argument("--var", default="n")
    sequence.add_argument("--start", type=int, required=True)
    sequence.add_argument("--end", type=int, required=True)
    sequence.add_argument("--assignment", action="append", default=[])
    sequence.set_defaults(func=run_sequence)

    iterate = subparsers.add_parser("iterate", help="tabulate repeated function iteration")
    iterate.add_argument("expression", help="next-value formula in the iteration variable")
    iterate.add_argument("--var", default="x")
    iterate.add_argument("--start", required=True)
    iterate.add_argument("--steps", type=int, required=True)
    iterate.add_argument("--assignment", action="append", default=[])
    iterate.set_defaults(func=run_iterate)

    return parser


def run_sequence(args: argparse.Namespace) -> int:
    if args.end < args.start:
        raise ValueError("--end must be greater than or equal to --start.")
    names = sorted(set(infer_symbol_names([args.expression, " ".join(args.assignment)])) | {args.var})
    assignments = parse_assignments(args.assignment, names)
    table = build_symbol_table(list(names) + list(assignments))
    expression = parse_math(args.expression, list(names) + list(assignments))
    expression = expression.subs({table[name]: value for name, value in assignments.items()})
    variable = table[args.var]

    rows: list[list[str]] = []
    for index in range(args.start, args.end + 1):
        value = sp.simplify(expression.subs({variable: index}))
        rows.append([str(index), str(value), approximate(value)])
    emit_markdown([args.var, "exact", "approx"], rows)
    return 0


def run_iterate(args: argparse.Namespace) -> int:
    if args.steps < 0:
        raise ValueError("--steps must be nonnegative.")
    names = sorted(set(infer_symbol_names([args.expression, args.start, " ".join(args.assignment)])) | {args.var})
    assignments = parse_assignments(args.assignment, names)
    table = build_symbol_table(list(names) + list(assignments))
    expression = parse_math(args.expression, list(names) + list(assignments))
    expression = expression.subs({table[name]: value for name, value in assignments.items()})
    variable = table[args.var]
    current = parse_math(args.start, list(names) + list(assignments))

    rows: list[list[str]] = [["0", str(sp.simplify(current)), approximate(current)]]
    for step in range(1, args.steps + 1):
        current = sp.simplify(expression.subs({variable: current}))
        rows.append([str(step), str(current), approximate(current)])
    emit_markdown(["k", f"{args.var}_k", "approx"], rows)
    return 0


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

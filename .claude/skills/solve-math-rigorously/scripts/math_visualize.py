#!/usr/bin/env python3
"""Create simple math plots for explanations and verification."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

try:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np
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
        "Missing dependencies. Run 'bash scripts/bootstrap_env.sh' from the skill root, "
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


def infer_symbol_names(texts: list[str]) -> list[str]:
    names: set[str] = set()
    for text in texts:
        for token in re.findall(r"[A-Za-z_]\w*", text):
            if token not in RESERVED_NAMES:
                names.add(token)
    return sorted(names)


def build_symbol_table(names: list[str]) -> dict[str, object]:
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


def parse_expression(text: str, names: list[str]) -> sp.Expr:
    return sp.sympify(
        parse_expr(
            text,
            local_dict=build_symbol_table(names),
            transformations=TRANSFORMATIONS,
            evaluate=True,
        )
    )


def parse_point(text: str) -> tuple[float, float]:
    pieces = [part.strip() for part in text.split(",", 1)]
    if len(pieces) != 2:
        raise ValueError(f"Invalid point '{text}'. Expected x,y.")
    return float(pieces[0]), float(pieces[1])


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Plot math expressions.")
    parser.add_argument("--expr", action="append", required=True, help="expression in one variable")
    parser.add_argument("--label", action="append", default=[], help="legend label for an expression")
    parser.add_argument("--var", default="x")
    parser.add_argument("--xmin", type=float, required=True)
    parser.add_argument("--xmax", type=float, required=True)
    parser.add_argument("--ymin", type=float)
    parser.add_argument("--ymax", type=float)
    parser.add_argument("--points", type=int, default=1000)
    parser.add_argument("--point", action="append", default=[], help="x,y point to overlay")
    parser.add_argument("--vertical-line", action="append", type=float, default=[], help="x value to mark")
    parser.add_argument("--horizontal-line", action="append", type=float, default=[], help="y value to mark")
    parser.add_argument("--shade-upper", help="upper expression for a shaded region")
    parser.add_argument("--shade-lower", default="0", help="lower expression for a shaded region")
    parser.add_argument("--shade-from", type=float, help="left endpoint of the shaded region")
    parser.add_argument("--shade-to", type=float, help="right endpoint of the shaded region")
    parser.add_argument("--shade-label", default="shaded region")
    parser.add_argument("--shade-alpha", type=float, default=0.2)
    parser.add_argument("--title", default="")
    parser.add_argument("--output", required=True)
    parser.add_argument("--dpi", type=int, default=160)
    return parser


def evaluate_expression(expr: sp.Expr, variable: sp.Symbol, xs: np.ndarray) -> np.ndarray:
    func = sp.lambdify(variable, expr, modules=["numpy"])
    try:
        ys = np.array(func(xs), dtype=np.complex128)
    except Exception:
        ys = np.array([complex(func(float(x))) for x in xs], dtype=np.complex128)
    if ys.shape == ():
        ys = np.full(xs.shape, ys.item(), dtype=np.complex128)
    return np.where(np.abs(ys.imag) < 1e-9, ys.real, np.nan)


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.xmax <= args.xmin:
        parser.error("--xmax must be greater than --xmin")
    if args.points < 50:
        parser.error("--points must be at least 50")
    if args.label and len(args.label) != len(args.expr):
        parser.error("--label must be supplied zero times or once per --expr")
    if (args.shade_from is None) != (args.shade_to is None):
        parser.error("--shade-from and --shade-to must be supplied together")
    if args.shade_to is not None and args.shade_to <= args.shade_from:
        parser.error("--shade-to must be greater than --shade-from")

    extra_expressions = list(args.expr)
    if args.shade_upper:
        extra_expressions.append(args.shade_upper)
    if args.shade_lower:
        extra_expressions.append(args.shade_lower)
    names = sorted(set(infer_symbol_names(extra_expressions)) | {args.var})
    symbol_table = build_symbol_table(names)
    variable = symbol_table[args.var]
    xs = np.linspace(args.xmin, args.xmax, args.points)

    fig, ax = plt.subplots(figsize=(8, 5))
    for index, text in enumerate(args.expr):
        expr = parse_expression(text, names)
        ys = evaluate_expression(expr, variable, xs)
        label = args.label[index] if args.label else text
        ax.plot(xs, ys, linewidth=2, label=label)

    if args.shade_upper:
        shade_upper = parse_expression(args.shade_upper, names)
        shade_lower = parse_expression(args.shade_lower, names)
        shade_from = args.shade_from if args.shade_from is not None else args.xmin
        shade_to = args.shade_to if args.shade_to is not None else args.xmax
        mask = (xs >= shade_from) & (xs <= shade_to)
        shade_xs = xs[mask]
        if shade_xs.size == 0:
            parser.error("shaded interval does not overlap the plotted x-range")
        shade_upper_values = evaluate_expression(shade_upper, variable, shade_xs)
        shade_lower_values = evaluate_expression(shade_lower, variable, shade_xs)
        ax.fill_between(
            shade_xs,
            shade_lower_values,
            shade_upper_values,
            alpha=args.shade_alpha,
            label=args.shade_label,
        )

    if args.point:
        points = [parse_point(text) for text in args.point]
        ax.scatter(
            [x for x, _ in points],
            [y for _, y in points],
            color="black",
            zorder=5,
            label="points",
        )

    for x_value in args.vertical_line:
        ax.axvline(x_value, color="#aa4444", linestyle="--", linewidth=1)
    for y_value in args.horizontal_line:
        ax.axhline(y_value, color="#4477aa", linestyle="--", linewidth=1)

    ax.axhline(0.0, color="#888888", linewidth=1)
    ax.axvline(0.0, color="#888888", linewidth=1)
    ax.set_xlim(args.xmin, args.xmax)
    if args.ymin is not None or args.ymax is not None:
        ax.set_ylim(args.ymin, args.ymax)
    ax.grid(True, alpha=0.3)
    ax.set_xlabel(args.var)
    ax.set_ylabel("value")
    if args.title:
        ax.set_title(args.title)
    if len(args.expr) > 1 or args.point or args.shade_upper:
        ax.legend()
    fig.tight_layout()
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=args.dpi)
    print(f"Saved plot to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

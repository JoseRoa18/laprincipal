#!/usr/bin/env python3
"""Symbolic and numeric checks for math problem solving."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from dataclasses import dataclass
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
    "Max",
    "Min",
    "N",
    "Piecewise",
    "beta",
    "cos",
    "cosh",
    "cot",
    "coth",
    "csc",
    "diff",
    "e",
    "erf",
    "exp",
    "factorial",
    "gamma",
    "integrate",
    "lambertw",
    "limit",
    "ln",
    "log",
    "oo",
    "pi",
    "sec",
    "sech",
    "sin",
    "sinh",
    "sqrt",
    "sum",
    "tan",
    "tanh",
    "zoo",
}
SAMPLE_VALUES = [
    sp.Rational(-3, 2),
    sp.Rational(-2, 3),
    sp.Rational(1, 2),
    sp.Integer(2),
    sp.Rational(5, 3),
    sp.Integer(-2),
    sp.pi / 3,
    -sp.pi / 4,
]
COMPARISON_OPERATORS = ["<=", ">=", "==", "=", "<", ">"]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Verify common math claims.")
    parser.add_argument("--json", action="store_true", help="emit JSON output")

    subparsers = parser.add_subparsers(dest="command", required=True)

    equiv = subparsers.add_parser("equiv", help="check whether two expressions are equivalent")
    equiv.add_argument("left")
    equiv.add_argument("right")
    equiv.add_argument("--vars", default="")
    equiv.add_argument("--samples", type=int, default=5)
    equiv.set_defaults(func=run_equiv)

    derivative = subparsers.add_parser("derivative", help="check a derivative")
    derivative.add_argument("expression", help="original expression")
    derivative.add_argument("candidate", help="claimed derivative")
    derivative.add_argument("--var", required=True)
    derivative.add_argument("--vars", default="")
    derivative.add_argument("--samples", type=int, default=5)
    derivative.set_defaults(func=run_derivative)

    antiderivative = subparsers.add_parser("antiderivative", help="check an antiderivative")
    antiderivative.add_argument("integrand")
    antiderivative.add_argument("candidate")
    antiderivative.add_argument("--var", required=True)
    antiderivative.add_argument("--vars", default="")
    antiderivative.add_argument("--samples", type=int, default=5)
    antiderivative.set_defaults(func=run_antiderivative)

    definite_integral = subparsers.add_parser("definite-integral", help="check a definite integral")
    definite_integral.add_argument("integrand")
    definite_integral.add_argument("lower")
    definite_integral.add_argument("upper")
    definite_integral.add_argument("candidate")
    definite_integral.add_argument("--var", required=True)
    definite_integral.add_argument("--vars", default="")
    definite_integral.set_defaults(func=run_definite_integral)

    substitute = subparsers.add_parser("substitute", help="evaluate an expression")
    substitute.add_argument("expression")
    substitute.add_argument("--assignment", action="append", default=[], help="x=2 style binding")
    substitute.add_argument("--vars", default="")
    substitute.set_defaults(func=run_substitute)

    satisfies = subparsers.add_parser("satisfies", help="check whether assignments satisfy a relation")
    satisfies.add_argument("relation", help="relation such as x^2 + y^2 = 25")
    satisfies.add_argument("--assignment", action="append", default=[], help="x=2 style binding")
    satisfies.add_argument("--vars", default="")
    satisfies.add_argument("--samples", type=int, default=5)
    satisfies.set_defaults(func=run_satisfies)

    limit = subparsers.add_parser("limit", help="check a limit")
    limit.add_argument("expression")
    limit.add_argument("point")
    limit.add_argument("candidate")
    limit.add_argument("--var", required=True)
    limit.add_argument("--vars", default="")
    limit.add_argument("--dir", default="+-", choices=["+-", "+", "-"])
    limit.set_defaults(func=run_limit)

    solve = subparsers.add_parser("solve", help="compare a finite solution set")
    solve.add_argument("relation", help="expression equal to zero or lhs = rhs")
    solve.add_argument("--var", required=True)
    solve.add_argument("--expected", action="append", default=[])
    solve.add_argument("--domain", choices=["reals", "complexes"], default="reals")
    solve.add_argument("--vars", default="")
    solve.set_defaults(func=run_solve)

    system = subparsers.add_parser("system", help="check whether assignments satisfy a system of equations")
    system.add_argument("--equation", action="append", required=True, help="relation such as x+y=5")
    system.add_argument("--assignment", action="append", default=[], help="x=2 style binding")
    system.add_argument("--vars", default="")
    system.add_argument("--samples", type=int, default=5)
    system.set_defaults(func=run_system)

    counterexample = subparsers.add_parser(
        "counterexample",
        help="search for a witness that disproves an equality or inequality on an interval",
    )
    counterexample.add_argument("claim", help="relation such as sin(x) >= x")
    counterexample.add_argument("--var", required=True)
    counterexample.add_argument("--xmin", type=float, required=True)
    counterexample.add_argument("--xmax", type=float, required=True)
    counterexample.add_argument("--points", type=int, default=801)
    counterexample.add_argument("--assignment", action="append", default=[], help="a=2 style binding")
    counterexample.add_argument("--vars", default="")
    counterexample.set_defaults(func=run_counterexample)

    return parser


def infer_symbol_names(texts: Iterable[str]) -> list[str]:
    names: set[str] = set()
    for text in texts:
        for token in re.findall(r"[A-Za-z_]\w*", text):
            if token not in RESERVED_NAMES:
                names.add(token)
    return sorted(names)


def split_names(raw: str) -> list[str]:
    if not raw:
        return []
    return [name for name in re.split(r"[\s,]+", raw) if name]


def make_symbol_table(names: Iterable[str]) -> dict[str, sp.Symbol]:
    table = {name: sp.Symbol(name) for name in names}
    table.update(
        {
            "e": sp.E,
            "E": sp.E,
            "I": sp.I,
            "oo": sp.oo,
            "pi": sp.pi,
            "zoo": sp.zoo,
            "ln": sp.log,
            "log": sp.log,
            "sqrt": sp.sqrt,
            "sin": sp.sin,
            "cos": sp.cos,
            "tan": sp.tan,
            "cot": sp.cot,
            "sec": sp.sec,
            "csc": sp.csc,
            "asin": sp.asin,
            "acos": sp.acos,
            "atan": sp.atan,
            "sinh": sp.sinh,
            "cosh": sp.cosh,
            "tanh": sp.tanh,
            "exp": sp.exp,
            "Abs": sp.Abs,
            "Max": sp.Max,
            "Min": sp.Min,
            "Piecewise": sp.Piecewise,
        }
    )
    return table


def parse_math(text: str, extra_names: Iterable[str]) -> sp.Expr:
    symbol_table = make_symbol_table(extra_names)
    return sp.sympify(
        parse_expr(
            text,
            local_dict=symbol_table,
            transformations=TRANSFORMATIONS,
            evaluate=True,
        )
    )


def parse_relation(text: str, extra_names: Iterable[str]) -> sp.Expr:
    if "=" in text:
        left, right = text.split("=", 1)
        return parse_math(left, extra_names) - parse_math(right, extra_names)
    return parse_math(text, extra_names)


def parse_comparison(text: str, extra_names: Iterable[str]) -> tuple[sp.Expr, str, sp.Expr]:
    for operator in COMPARISON_OPERATORS:
        if operator in text:
            left, right = text.split(operator, 1)
            return parse_math(left, extra_names), operator, parse_math(right, extra_names)
    raise ValueError(
        f"Invalid comparison '{text}'. Expected one of: <=, >=, =, ==, <, >."
    )


def parse_assignments(raw_assignments: list[str], extra_names: Iterable[str]) -> dict[str, sp.Expr]:
    assignments: dict[str, sp.Expr] = {}
    all_names = set(extra_names)
    for item in raw_assignments:
        if "=" not in item:
            raise ValueError(f"Invalid assignment '{item}'. Expected name=value.")
        name, value = item.split("=", 1)
        key = name.strip()
        all_names.add(key)
        assignments[key] = value.strip()
    return {name: parse_math(text, all_names) for name, text in assignments.items()}


def expression_to_text(expr: sp.Expr) -> str:
    return str(sp.simplify(expr))


def number_to_text(value: complex | float | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, complex):
        if abs(value.imag) < 1e-12:
            return f"{value.real:.12g}"
        return f"{value.real:.12g}{value.imag:+.12g}j"
    return f"{value:.12g}"


def numeric_value(expr: sp.Expr) -> complex | float | None:
    try:
        evaluated = sp.N(expr, 30)
    except Exception:
        return None
    if getattr(evaluated, "is_real", False):
        try:
            number = float(evaluated)
        except Exception:
            return None
        if math.isfinite(number):
            return number
        return None
    try:
        number = complex(evaluated)
    except Exception:
        return None
    if math.isfinite(number.real) and math.isfinite(number.imag):
        return number
    return None


def numeric_magnitude(value: complex | float | None) -> float | None:
    if value is None:
        return None
    if isinstance(value, complex):
        return abs(value)
    return abs(float(value))


def is_exact_zero(expr: sp.Expr) -> tuple[bool, str]:
    simplified = sp.simplify(expr)
    if simplified == 0:
        return True, str(simplified)
    equals_zero = simplified.equals(0)
    return equals_zero is True, str(simplified)


def expressions_match(left: sp.Expr, right: sp.Expr) -> tuple[bool, str]:
    if sp.simplify(left) == sp.simplify(right):
        return True, "0"
    if left == right:
        return True, "0"
    return is_exact_zero(left - right)


@dataclass
class ProbeResult:
    passed: bool
    attempted: int
    details: list[dict[str, str]]


def numeric_probe(expr: sp.Expr, symbols: list[sp.Symbol], samples: int) -> ProbeResult:
    if not symbols or samples <= 0:
        return ProbeResult(True, 0, [])

    details: list[dict[str, str]] = []
    attempted = 0
    for index in range(samples * 3):
        substitutions: dict[sp.Symbol, sp.Expr] = {}
        for offset, symbol in enumerate(symbols):
            substitutions[symbol] = SAMPLE_VALUES[(index + offset) % len(SAMPLE_VALUES)]
        try:
            value = sp.simplify(expr.subs(substitutions))
        except Exception:
            continue
        numeric = numeric_value(value)
        if numeric is None:
            continue
        attempted += 1
        magnitude = abs(numeric)
        details.append(
            {
                "substitution": ", ".join(f"{symbol}={substitutions[symbol]}" for symbol in symbols),
                "residual": expression_to_text(value),
                "approx_residual": number_to_text(numeric) or "n/a",
            }
        )
        if magnitude > 1e-8:
            return ProbeResult(False, attempted, details)
        if attempted >= samples:
            break
    return ProbeResult(True, attempted, details)


def emit(payload: dict[str, object], as_json: bool) -> None:
    if as_json:
        print(json.dumps(payload, indent=2, sort_keys=True))
        return
    for key, value in payload.items():
        if isinstance(value, list):
            print(f"{key}:")
            for item in value:
                print(f"  - {item}")
        else:
            print(f"{key}: {value}")


def resolve_names(*texts: str, vars_arg: str = "", extra: Iterable[str] = ()) -> list[str]:
    explicit = split_names(vars_arg)
    inferred = infer_symbol_names(texts)
    return sorted(set(explicit) | set(inferred) | set(extra))


def check_residual(
    residual: sp.Expr,
    symbols: list[sp.Symbol],
    samples: int,
    label: str,
) -> tuple[int, dict[str, object]]:
    exact, residual_text = is_exact_zero(residual)
    probe = numeric_probe(residual, symbols, samples)
    constant_numeric_residual = numeric_value(sp.simplify(residual))

    if exact:
        status = "PASS"
        exit_code = 0
    elif constant_numeric_residual is not None:
        status = "PASS" if numeric_magnitude(constant_numeric_residual) <= 1e-8 else "FAIL"
        exit_code = 0 if status == "PASS" else 1
    elif probe.attempted and not probe.passed:
        status = "FAIL"
        exit_code = 1
    else:
        status = "INCONCLUSIVE"
        exit_code = 1
    payload: dict[str, object] = {
        "status": status,
        "check": label,
        "symbolic_residual": residual_text,
        "numeric_probe_attempted": probe.attempted,
        "numeric_probe_consistent": probe.passed,
    }
    if constant_numeric_residual is not None:
        payload["approx_residual"] = number_to_text(constant_numeric_residual) or "n/a"
    if probe.details:
        payload["numeric_probe_details"] = [
            f"{item['substitution']} -> residual {item['residual']} (approx {item['approx_residual']})"
            for item in probe.details
        ]
    if status == "PASS" and not exact and constant_numeric_residual is not None:
        payload["note"] = (
            "Residual was numerically zero, but the equality was not simplified to an exact symbolic identity."
        )
    elif status == "INCONCLUSIVE" and probe.passed and probe.attempted:
        payload["note"] = (
            "Numeric samples were consistent, but SymPy did not prove the claim symbolically. "
            "Treat this as evidence, not proof."
        )
    return exit_code, payload


def run_equiv(args: argparse.Namespace) -> tuple[int, dict[str, object]]:
    names = resolve_names(args.left, args.right, vars_arg=args.vars)
    residual = parse_math(args.left, names) - parse_math(args.right, names)
    symbols = [make_symbol_table(names)[name] for name in names]
    return check_residual(residual, symbols, args.samples, "equiv")


def run_derivative(args: argparse.Namespace) -> tuple[int, dict[str, object]]:
    names = resolve_names(args.expression, args.candidate, vars_arg=args.vars, extra=[args.var])
    table = make_symbol_table(names)
    variable = table[args.var]
    expression = parse_math(args.expression, names)
    candidate = parse_math(args.candidate, names)
    residual = sp.diff(expression, variable) - candidate
    symbols = [table[name] for name in names]
    return check_residual(residual, symbols, args.samples, "derivative")


def run_antiderivative(args: argparse.Namespace) -> tuple[int, dict[str, object]]:
    names = resolve_names(args.integrand, args.candidate, vars_arg=args.vars, extra=[args.var])
    table = make_symbol_table(names)
    variable = table[args.var]
    integrand = parse_math(args.integrand, names)
    candidate = parse_math(args.candidate, names)
    residual = sp.diff(candidate, variable) - integrand
    symbols = [table[name] for name in names]
    return check_residual(residual, symbols, args.samples, "antiderivative")


def run_definite_integral(args: argparse.Namespace) -> tuple[int, dict[str, object]]:
    names = resolve_names(
        args.integrand,
        args.lower,
        args.upper,
        args.candidate,
        vars_arg=args.vars,
        extra=[args.var],
    )
    table = make_symbol_table(names)
    variable = table[args.var]
    integrand = parse_math(args.integrand, names)
    lower = parse_math(args.lower, names)
    upper = parse_math(args.upper, names)
    candidate = parse_math(args.candidate, names)
    actual = sp.integrate(integrand, (variable, lower, upper))
    exact, residual_text = expressions_match(actual, candidate)
    residual_numeric = numeric_value(sp.simplify(actual - candidate))
    passed = exact or (residual_numeric is not None and numeric_magnitude(residual_numeric) <= 1e-8)
    payload = {
        "status": "PASS" if passed else "FAIL",
        "check": "definite-integral",
        "actual_value": str(actual),
        "candidate": str(candidate),
        "residual": residual_text,
    }
    if residual_numeric is not None:
        payload["approx_residual"] = number_to_text(residual_numeric) or "n/a"
    if passed and not exact:
        payload["note"] = (
            "The definite integral matched numerically, but SymPy did not reduce the result to the same exact form."
        )
    return (0 if passed else 1), payload


def run_substitute(args: argparse.Namespace) -> tuple[int, dict[str, object]]:
    raw_assignment_text = " ".join(args.assignment)
    names = resolve_names(args.expression, raw_assignment_text, vars_arg=args.vars)
    assignments = parse_assignments(args.assignment, names)
    expr = parse_math(args.expression, list(names) + list(assignments))
    table = make_symbol_table(list(names) + list(assignments))
    substituted = sp.simplify(expr.subs({table[name]: value for name, value in assignments.items()}))
    payload = {
        "status": "PASS",
        "check": "substitute",
        "exact_value": str(substituted),
        "approx_value": number_to_text(numeric_value(substituted)) or "n/a",
    }
    return 0, payload


def run_satisfies(args: argparse.Namespace) -> tuple[int, dict[str, object]]:
    raw_assignment_text = " ".join(args.assignment)
    names = resolve_names(args.relation, raw_assignment_text, vars_arg=args.vars)
    assignments = parse_assignments(args.assignment, names)
    table = make_symbol_table(list(names) + list(assignments))
    substitutions = {table[name]: value for name, value in assignments.items()}

    try:
        left, operator, right = parse_comparison(args.relation, list(names) + list(assignments))
    except ValueError:
        relation = parse_relation(args.relation, list(names) + list(assignments))
        substituted = sp.simplify(relation.subs(substitutions))
        symbols = sorted(substituted.free_symbols, key=lambda symbol: symbol.name)
        exit_code, payload = check_residual(substituted, symbols, args.samples, "satisfies")
        payload["relation"] = args.relation
        payload["assignments"] = ", ".join(f"{name}={value}" for name, value in assignments.items()) or "none"
        return exit_code, payload

    left = sp.simplify(left.subs(substitutions))
    right = sp.simplify(right.subs(substitutions))
    remaining_symbols = sorted((left.free_symbols | right.free_symbols), key=lambda symbol: symbol.name)

    if operator in ("=", "=="):
        exit_code, payload = check_residual(left - right, remaining_symbols, args.samples, "satisfies")
        payload["relation"] = args.relation
        payload["assignments"] = ", ".join(f"{name}={value}" for name, value in assignments.items()) or "none"
        return exit_code, payload

    if not remaining_symbols:
        left_value = numeric_value(left)
        right_value = numeric_value(right)
        if left_value is None or right_value is None:
            return 1, {
                "status": "INCONCLUSIVE",
                "check": "satisfies",
                "relation": args.relation,
                "assignments": ", ".join(f"{name}={value}" for name, value in assignments.items()) or "none",
                "note": "The relation could not be evaluated numerically after substitution.",
            }
        passed = relation_holds(left_value, operator, right_value)
        return (0 if passed else 1), {
            "status": "PASS" if passed else "FAIL",
            "check": "satisfies",
            "relation": args.relation,
            "assignments": ", ".join(f"{name}={value}" for name, value in assignments.items()) or "none",
            "left_value": number_to_text(left_value) or "n/a",
            "right_value": number_to_text(right_value) or "n/a",
        }

    probe_details: list[str] = []
    attempted = 0
    for index in range(args.samples * 3):
        sample_subs: dict[sp.Symbol, sp.Expr] = {}
        for offset, symbol in enumerate(remaining_symbols):
            sample_subs[symbol] = SAMPLE_VALUES[(index + offset) % len(SAMPLE_VALUES)]
        left_value = numeric_value(sp.N(left.subs(sample_subs), 30))
        right_value = numeric_value(sp.N(right.subs(sample_subs), 30))
        if left_value is None or right_value is None:
            continue
        attempted += 1
        holds = relation_holds(left_value, operator, right_value)
        probe_details.append(
            f"{', '.join(f'{symbol}={sample_subs[symbol]}' for symbol in remaining_symbols)} -> "
            f"{number_to_text(left_value) or 'n/a'} {operator} {number_to_text(right_value) or 'n/a'}"
        )
        if not holds:
            return 1, {
                "status": "FAIL",
                "check": "satisfies",
                "relation": args.relation,
                "assignments": ", ".join(f"{name}={value}" for name, value in assignments.items()) or "none",
                "numeric_probe_details": probe_details,
            }
        if attempted >= args.samples:
            break

    status = "INCONCLUSIVE" if attempted == 0 else "PASS"
    return (0 if status == "PASS" else 1), {
        "status": status,
        "check": "satisfies",
        "relation": args.relation,
        "assignments": ", ".join(f"{name}={value}" for name, value in assignments.items()) or "none",
        "numeric_probe_attempted": attempted,
        "numeric_probe_details": probe_details,
        "note": (
            "Numeric sampling supported the relation, but this is evidence rather than a symbolic proof."
            if status == "PASS"
            else "No numeric probe could be completed after substitution."
        ),
    }


def run_limit(args: argparse.Namespace) -> tuple[int, dict[str, object]]:
    names = resolve_names(args.expression, args.point, args.candidate, vars_arg=args.vars, extra=[args.var])
    table = make_symbol_table(names)
    variable = table[args.var]
    expression = parse_math(args.expression, names)
    point = parse_math(args.point, names)
    candidate = parse_math(args.candidate, names)

    if args.dir == "+-":
        actual = sp.limit(expression, variable, point, dir="+-")
    else:
        actual = sp.limit(expression, variable, point, dir=args.dir)
    exact, residual_text = expressions_match(actual, candidate)
    payload = {
        "status": "PASS" if exact else "FAIL",
        "check": "limit",
        "actual_limit": str(actual),
        "candidate": str(candidate),
        "residual": residual_text,
    }
    return (0 if exact else 1), payload


def run_solve(args: argparse.Namespace) -> tuple[int, dict[str, object]]:
    expected_blob = " ".join(args.expected)
    names = resolve_names(args.relation, expected_blob, vars_arg=args.vars, extra=[args.var])
    table = make_symbol_table(names)
    variable = table[args.var]
    relation = parse_relation(args.relation, names)
    domain = sp.S.Reals if args.domain == "reals" else sp.S.Complexes
    actual = sp.solveset(relation, variable, domain=domain)
    expected = sp.FiniteSet(*(parse_math(value, names) for value in args.expected))

    if isinstance(actual, sp.FiniteSet):
        simplified_actual = sp.FiniteSet(*(sp.simplify(item) for item in actual))
        simplified_expected = sp.FiniteSet(*(sp.simplify(item) for item in expected))
        passed = simplified_actual == simplified_expected
        payload = {
            "status": "PASS" if passed else "FAIL",
            "check": "solve",
            "actual_solutions": str(simplified_actual),
            "expected_solutions": str(simplified_expected),
        }
        return (0 if passed else 1), payload

    payload = {
        "status": "INCONCLUSIVE",
        "check": "solve",
        "actual_solutions": str(actual),
        "expected_solutions": str(expected),
        "note": "SymPy did not return a finite solution set, so this comparison is not decisive.",
    }
    return 1, payload


def run_system(args: argparse.Namespace) -> tuple[int, dict[str, object]]:
    raw_assignment_text = " ".join(args.assignment)
    names = resolve_names(" ".join(args.equation), raw_assignment_text, vars_arg=args.vars)
    assignments = parse_assignments(args.assignment, names)
    table = make_symbol_table(list(names) + list(assignments))

    summaries: list[str] = []
    overall_status = "PASS"
    exit_code = 0
    for equation in args.equation:
        residual = parse_relation(equation, list(names) + list(assignments))
        substituted = sp.simplify(residual.subs({table[name]: value for name, value in assignments.items()}))
        symbols = sorted(substituted.free_symbols, key=lambda symbol: symbol.name)
        _, payload = check_residual(substituted, symbols, args.samples, "system-equation")
        status = str(payload["status"])
        summaries.append(f"{equation} -> {status} (residual {payload['symbolic_residual']})")
        if status == "FAIL":
            overall_status = "FAIL"
            exit_code = 1
        elif status == "INCONCLUSIVE" and overall_status != "FAIL":
            overall_status = "INCONCLUSIVE"
            exit_code = 1

    payload = {
        "status": overall_status,
        "check": "system",
        "assignments": ", ".join(f"{name}={value}" for name, value in assignments.items()) or "none",
        "equation_results": summaries,
    }
    return exit_code, payload


def relation_holds(left_value: float | complex, operator: str, right_value: float | complex) -> bool:
    tolerance = 1e-8
    difference = left_value - right_value
    if isinstance(difference, complex):
        if abs(difference.imag) > tolerance:
            return False
        difference = difference.real
    if operator in ("=", "=="):
        return abs(difference) <= tolerance
    if operator == "<=":
        return difference <= tolerance
    if operator == ">=":
        return difference >= -tolerance
    if operator == "<":
        return difference < -tolerance
    if operator == ">":
        return difference > tolerance
    raise ValueError(f"Unsupported operator: {operator}")


def run_counterexample(args: argparse.Namespace) -> tuple[int, dict[str, object]]:
    raw_assignment_text = " ".join(args.assignment)
    names = resolve_names(
        args.claim,
        raw_assignment_text,
        vars_arg=args.vars,
        extra=[args.var],
    )
    if args.xmax <= args.xmin:
        raise ValueError("--xmax must be greater than --xmin.")
    if args.points < 3:
        raise ValueError("--points must be at least 3.")

    assignments = parse_assignments(args.assignment, names)
    table = make_symbol_table(list(names) + list(assignments))
    variable = table[args.var]
    left, operator, right = parse_comparison(args.claim, list(names) + list(assignments))
    left = sp.simplify(left.subs({table[name]: value for name, value in assignments.items()}))
    right = sp.simplify(right.subs({table[name]: value for name, value in assignments.items()}))

    if operator in ("=", "=="):
        exact, residual_text = expressions_match(left, right)
        if exact:
            return 0, {
                "status": "PASS",
                "check": "counterexample",
                "claim": args.claim,
                "residual": residual_text,
                "note": "The equality was proved symbolically, so no counterexample exists.",
            }

    points_checked = 0
    for index in range(args.points):
        x_value = args.xmin + (args.xmax - args.xmin) * index / (args.points - 1)
        substitutions = {variable: x_value}
        left_value = numeric_value(sp.N(left.subs(substitutions), 30))
        right_value = numeric_value(sp.N(right.subs(substitutions), 30))
        if left_value is None or right_value is None:
            continue
        points_checked += 1
        if not relation_holds(left_value, operator, right_value):
            return 1, {
                "status": "FAIL",
                "check": "counterexample",
                "claim": args.claim,
                "witness": f"{args.var}={x_value:.12g}",
                "left_value": number_to_text(left_value) or "n/a",
                "right_value": number_to_text(right_value) or "n/a",
                "note": "A sampled witness violates the claim on the requested interval.",
            }

    return 1, {
        "status": "INCONCLUSIVE",
        "check": "counterexample",
        "claim": args.claim,
        "checked_points": points_checked,
        "note": (
            "No sampled counterexample was found on the interval, but a sampled search is not a proof."
        ),
    }


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    exit_code, payload = args.func(args)
    emit(payload, args.json)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Generate reusable math practice sheets, lesson plans, and review schedules."""

from __future__ import annotations

import argparse
import random
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Problem:
    prompt: str
    answer: str
    hints: list[str]


@dataclass
class TopicSpec:
    title: str
    misconceptions: list[str]
    next_prompt: str
    manipulatives: list[str]
    prerequisites: list[str]
    success_criteria: list[str]
    teacher_move: str


TOPICS: dict[str, TopicSpec] = {
    "addition-within-20": TopicSpec(
        title="Addition Within 20",
        misconceptions=[
            "The learner may recount from 1 instead of counting on.",
            "The learner may miss the make-10 strategy.",
        ],
        next_prompt="Ask: Can you make 10 first, then add the rest?",
        manipulatives=["number line", "counters"],
        prerequisites=["Count forward reliably.", "Know teen numbers as 10 and some ones."],
        success_criteria=[
            "Add two numbers within 20.",
            "Use counting on or make-10 when it helps.",
            "Check with a quick estimate or another method.",
        ],
        teacher_move="Model counting on and make-10 with the same pair of numbers before moving to symbols.",
    ),
    "subtraction-within-100": TopicSpec(
        title="Subtraction Within 100",
        misconceptions=[
            "The learner may subtract the smaller digit from the larger digit without place value.",
            "The learner may forget to regroup when ones are not enough.",
        ],
        next_prompt="Ask: What happens to the tens when you regroup one ten into ten ones?",
        manipulatives=["place-value chart", "base-ten blocks"],
        prerequisites=["Read two-digit numbers as tens and ones.", "Add and subtract within 20."],
        success_criteria=[
            "Subtract two-digit numbers accurately.",
            "Regroup when the ones are not enough.",
            "Explain the subtraction with tens and ones language.",
        ],
        teacher_move="Keep the place-value chart visible while crossing from tens to ones so regrouping stays concrete.",
    ),
    "multiplication-facts": TopicSpec(
        title="Multiplication Facts",
        misconceptions=[
            "The learner may not connect multiplication to equal groups or arrays.",
            "The learner may reverse factors in a word problem without understanding why the total stays the same.",
        ],
        next_prompt="Ask: How many rows and how many in each row?",
        manipulatives=["array", "equal groups"],
        prerequisites=["Count equal groups.", "Use repeated addition."],
        success_criteria=[
            "Interpret multiplication as equal groups or arrays.",
            "Recall or derive a basic multiplication fact.",
            "Explain what each factor means in the context.",
        ],
        teacher_move="Build the array first, then connect the rows and columns to the multiplication sentence.",
    ),
    "fractions-of-sets": TopicSpec(
        title="Fractions Of Sets",
        misconceptions=[
            "The learner may not treat the parts as equal groups.",
            "The learner may multiply before finding one equal part.",
        ],
        next_prompt="Ask: What is one part if the whole is split into the denominator number of equal groups?",
        manipulatives=["fraction bar", "equal groups"],
        prerequisites=["Share a set into equal groups.", "Know numerator and denominator roles."],
        success_criteria=[
            "Find one equal part of a set.",
            "Find multiple equal parts of a set.",
            "Use the denominator before the numerator action.",
        ],
        teacher_move="Show the whole set, partition into equal groups, then circle the requested number of groups.",
    ),
    "linear-equations-one-step": TopicSpec(
        title="One-Step Linear Equations",
        misconceptions=[
            "The learner may apply the same operation to only one side.",
            "The learner may choose the wrong inverse operation.",
        ],
        next_prompt="Ask: What single inverse move will undo the operation on the variable?",
        manipulatives=["balance model", "inverse-operation table"],
        prerequisites=["Understand inverse operations.", "Evaluate simple expressions."],
        success_criteria=[
            "Choose the correct inverse operation.",
            "Apply the operation to both sides.",
            "Check the solution by substitution.",
        ],
        teacher_move="Use balance language first, then translate the same move into algebra notation.",
    ),
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate math practice materials.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    worksheet = subparsers.add_parser("worksheet", help="generate a worksheet")
    worksheet.add_argument("--topic", choices=sorted(TOPICS), required=True)
    worksheet.add_argument("--count", type=int, default=8)
    worksheet.add_argument("--seed", type=int, default=0)
    worksheet.add_argument("--audience", choices=["student", "teacher", "combined"], default="combined")
    worksheet.add_argument("--title", default="")
    worksheet.add_argument("--output")
    worksheet.set_defaults(func=run_worksheet)

    lesson = subparsers.add_parser("lesson", help="generate a lesson plan")
    lesson.add_argument("--topic", choices=sorted(TOPICS), required=True)
    lesson.add_argument("--seed", type=int, default=0)
    lesson.add_argument("--duration", type=int, default=30)
    lesson.add_argument("--audience", choices=["teacher", "combined"], default="teacher")
    lesson.add_argument("--title", default="")
    lesson.add_argument("--output")
    lesson.set_defaults(func=run_lesson)

    review = subparsers.add_parser("review-plan", help="generate a spiral review plan")
    review.add_argument("--topic", action="append", choices=sorted(TOPICS), required=True)
    review.add_argument("--days", type=int, default=5)
    review.add_argument("--seed", type=int, default=0)
    review.add_argument("--title", default="")
    review.add_argument("--output")
    review.set_defaults(func=run_review_plan)

    return parser


def addition_problem(rng: random.Random) -> Problem:
    left = rng.randint(2, 14)
    right = rng.randint(2, 20 - left)
    answer = left + right
    bridge = min(10 - left, right) if left < 10 else 0
    hints = [
        f"Start at {left} and count on {right} more.",
        f"If it helps, make 10 first: {left} + {bridge} = {left + bridge}, then add the rest.",
        f"The total is {answer}.",
    ]
    return Problem(f"{left} + {right} =", str(answer), hints)


def subtraction_problem(rng: random.Random) -> Problem:
    top = rng.randint(24, 99)
    bottom = rng.randint(5, top - 1)
    answer = top - bottom
    tens = bottom // 10
    ones = bottom % 10
    hints = [
        f"Subtract {tens * 10} first, then subtract {ones}.",
        "If the ones are not enough, regroup one ten into ten ones.",
        f"The difference is {answer}.",
    ]
    return Problem(f"{top} - {bottom} =", str(answer), hints)


def multiplication_problem(rng: random.Random) -> Problem:
    left = rng.randint(2, 12)
    right = rng.randint(2, 12)
    answer = left * right
    hints = [
        f"Think of {left} groups of {right}.",
        f"Repeated addition also works: {right} added {left} times.",
        f"The product is {answer}.",
    ]
    return Problem(f"{left} x {right} =", str(answer), hints)


def fraction_problem(rng: random.Random) -> Problem:
    denominator = rng.choice([2, 3, 4, 5, 6, 8])
    numerator = rng.randint(1, denominator - 1)
    base = rng.randint(2, 6)
    whole = denominator * base
    answer = numerator * base
    hints = [
        f"Split {whole} into {denominator} equal groups first.",
        f"One group is {whole} / {denominator} = {base}.",
        f"Take {numerator} of those groups: {numerator} x {base} = {answer}.",
    ]
    return Problem(f"What is {numerator}/{denominator} of {whole}?", str(answer), hints)


def linear_problem(rng: random.Random) -> Problem:
    form = rng.choice(["add", "subtract", "multiply", "divide"])
    if form == "add":
        value = rng.randint(2, 15)
        offset = rng.randint(2, 12)
        total = value + offset
        return Problem(
            f"Solve: x + {offset} = {total}",
            f"x = {value}",
            [
                f"Undo + {offset} with - {offset}.",
                f"Subtract {offset} from both sides.",
                f"x = {value}.",
            ],
        )
    if form == "subtract":
        value = rng.randint(2, 15)
        offset = rng.randint(2, value + 8)
        total = value - offset
        return Problem(
            f"Solve: x - {offset} = {total}",
            f"x = {value}",
            [
                f"Undo - {offset} with + {offset}.",
                f"Add {offset} to both sides.",
                f"x = {value}.",
            ],
        )
    if form == "multiply":
        value = rng.randint(2, 12)
        factor = rng.randint(2, 9)
        total = value * factor
        return Problem(
            f"Solve: {factor}x = {total}",
            f"x = {value}",
            [
                f"Undo x {factor} with divide by {factor}.",
                f"Divide both sides by {factor}.",
                f"x = {value}.",
            ],
        )
    divisor = rng.randint(2, 9)
    quotient = rng.randint(2, 12)
    value = divisor * quotient
    return Problem(
        f"Solve: x / {divisor} = {quotient}",
        f"x = {value}",
        [
            f"Undo divide by {divisor} with multiply by {divisor}.",
            f"Multiply both sides by {divisor}.",
            f"x = {value}.",
        ],
    )


def generator_for(topic: str):
    generators = {
        "addition-within-20": addition_problem,
        "subtraction-within-100": subtraction_problem,
        "multiplication-facts": multiplication_problem,
        "fractions-of-sets": fraction_problem,
        "linear-equations-one-step": linear_problem,
    }
    return generators[topic]


def challenge_problem(topic: str, rng: random.Random) -> Problem:
    if topic == "addition-within-20":
        start = rng.randint(4, 9)
        first = rng.randint(3, 6)
        second = rng.randint(2, 5)
        total = start + first + second
        return Problem(
            f"Mia has {start} stickers. She gets {first} more, then {second} more. How many stickers does she have now?",
            str(total),
            [
                "Add the new stickers in two small steps.",
                f"First find {start} + {first}. Then add {second}.",
                f"The total is {total}.",
            ],
        )
    if topic == "subtraction-within-100":
        total = rng.randint(50, 90)
        removed = rng.randint(11, 29)
        answer = total - removed
        return Problem(
            f"There were {total} books on a shelf. {removed} were taken away. How many are left?",
            str(answer),
            [
                "Think left over means subtraction.",
                f"Subtract {removed} from {total}.",
                f"{total} - {removed} = {answer}.",
            ],
        )
    if topic == "multiplication-facts":
        rows = rng.randint(3, 8)
        cols = rng.randint(3, 8)
        answer = rows * cols
        return Problem(
            f"An array has {rows} rows with {cols} stars in each row. How many stars are there?",
            str(answer),
            [
                "Rows times stars in each row gives the total.",
                f"Compute {rows} x {cols}.",
                f"The array has {answer} stars.",
            ],
        )
    if topic == "fractions-of-sets":
        denominator = rng.choice([3, 4, 5, 6])
        numerator = rng.randint(1, denominator - 1)
        per_part = rng.randint(3, 6)
        whole = denominator * per_part
        answer = numerator * per_part
        return Problem(
            f"A class has {whole} crayons. {numerator}/{denominator} of them are blue. How many blue crayons are there?",
            str(answer),
            [
                f"Find one {denominator}th of {whole} first.",
                f"One part is {per_part}, so {numerator} parts is {answer}.",
                f"There are {answer} blue crayons.",
            ],
        )
    value = rng.randint(2, 9)
    factor = rng.randint(2, 9)
    total = value * factor
    return Problem(
        f"Solve and check: {factor}x = {total}",
        f"x = {value}",
        [
            f"Divide both sides by {factor}.",
            f"x = {total} / {factor} = {value}.",
            f"Check by substituting: {factor} x {value} = {total}.",
        ],
    )


def diagnostic_items(topic: str, rng: random.Random) -> list[Problem]:
    generate = generator_for(topic)
    return [generate(rng) for _ in range(2)]


def practice_items(topic: str, count: int, rng: random.Random) -> list[Problem]:
    generate = generator_for(topic)
    return [generate(rng) for _ in range(count)]


def render_problem_list(title: str, problems: list[Problem]) -> list[str]:
    lines = [f"## {title}", ""]
    for index, problem in enumerate(problems, start=1):
        lines.append(f"{index}. {problem.prompt}")
    lines.append("")
    return lines


def render_answer_key(diagnostic: list[Problem], practice: list[Problem], challenge: Problem) -> list[str]:
    lines = ["## Answer Key", ""]
    lines.append("### Quick Diagnostic")
    lines.append("")
    for index, problem in enumerate(diagnostic, start=1):
        lines.append(f"{index}. {problem.answer}")
    lines.append("")
    lines.append("### Practice")
    lines.append("")
    for index, problem in enumerate(practice, start=1):
        lines.append(f"{index}. {problem.answer}")
    lines.append("")
    lines.append("### Challenge")
    lines.append("")
    lines.append(f"1. {challenge.answer}")
    lines.append("")
    return lines


def render_hint_ladder(practice: list[Problem], challenge: Problem) -> list[str]:
    lines = ["## Hint Ladder", ""]
    for index, problem in enumerate(practice, start=1):
        lines.append(f"### Practice {index}")
        lines.append("")
        for step, hint in enumerate(problem.hints, start=1):
            lines.append(f"{step}. {hint}")
        lines.append("")
    lines.append("### Challenge")
    lines.append("")
    for step, hint in enumerate(challenge.hints, start=1):
        lines.append(f"{step}. {hint}")
    lines.append("")
    return lines


def render_lesson_answer_key(warm_up: list[Problem], guided: list[Problem], independent: list[Problem], exit_ticket: Problem) -> list[str]:
    lines = ["## Answer Key", ""]
    lines.append("### Warm-Up")
    lines.append("")
    for index, problem in enumerate(warm_up, start=1):
        lines.append(f"{index}. {problem.answer}")
    lines.append("")
    lines.append("### Guided Practice")
    lines.append("")
    for index, problem in enumerate(guided, start=1):
        lines.append(f"{index}. {problem.answer}")
    lines.append("")
    lines.append("### Independent Practice")
    lines.append("")
    for index, problem in enumerate(independent, start=1):
        lines.append(f"{index}. {problem.answer}")
    lines.append("")
    lines.append("### Exit Ticket")
    lines.append("")
    lines.append(f"1. {exit_ticket.answer}")
    lines.append("")
    return lines


def render_teacher_notes(topic: str) -> list[str]:
    spec = TOPICS[topic]
    lines = ["## Teacher Notes", ""]
    lines.append("Likely misconceptions:")
    lines.append("")
    for item in spec.misconceptions:
        lines.append(f"- {item}")
    lines.append("")
    lines.append(f"Next prompt: {spec.next_prompt}")
    lines.append("")
    return lines


def render_topic_metadata(topic: str) -> list[str]:
    spec = TOPICS[topic]
    lines = ["## Success Criteria", ""]
    for item in spec.success_criteria:
        lines.append(f"- {item}")
    lines.append("")
    lines.append("## Prerequisites")
    lines.append("")
    for item in spec.prerequisites:
        lines.append(f"- {item}")
    lines.append("")
    lines.append("## Suggested Models")
    lines.append("")
    for item in spec.manipulatives:
        lines.append(f"- {item}")
    lines.append("")
    return lines


def render_worksheet(topic: str, count: int, seed: int, audience: str, title: str) -> str:
    if count <= 0:
        raise ValueError("--count must be positive.")
    rng = random.Random(seed)
    spec = TOPICS[topic]
    actual_title = title or spec.title
    diagnostic = diagnostic_items(topic, rng)
    practice = practice_items(topic, count, rng)
    challenge = challenge_problem(topic, rng)

    lines = [f"# Practice Sheet: {actual_title}", "", f"Topic: `{topic}`", f"Seed: `{seed}`", ""]
    lines.extend(render_problem_list("Quick Diagnostic", diagnostic))
    lines.extend(render_problem_list("Practice", practice))
    lines.extend(render_problem_list("Challenge", [challenge]))

    if audience in {"teacher", "combined"}:
        lines.extend(render_answer_key(diagnostic, practice, challenge))
        lines.extend(render_hint_ladder(practice, challenge))
        lines.extend(render_teacher_notes(topic))

    return "\n".join(lines).rstrip() + "\n"


def render_lesson(topic: str, seed: int, duration: int, audience: str, title: str) -> str:
    if duration <= 0:
        raise ValueError("--duration must be positive.")
    rng = random.Random(seed)
    spec = TOPICS[topic]
    actual_title = title or spec.title
    warm_up = diagnostic_items(topic, rng)
    guided = practice_items(topic, 2, rng)
    independent_count = max(3, min(6, duration // 10 + 1))
    independent = practice_items(topic, independent_count, rng)
    exit_ticket = challenge_problem(topic, rng)

    lines = [f"# Lesson Plan: {actual_title}", "", f"Topic: `{topic}`", f"Seed: `{seed}`", f"Suggested duration: `{duration}` minutes", ""]
    lines.extend(render_topic_metadata(topic))
    lines.append("## Lesson Flow")
    lines.append("")
    lines.append(f"- Teacher move: {spec.teacher_move}")
    lines.append(f"- Diagnostic prompt: {spec.next_prompt}")
    lines.append("")
    lines.extend(render_problem_list("Warm-Up", warm_up))
    lines.append("## Mini-Lesson")
    lines.append("")
    lines.append(f"Model with: {', '.join(spec.manipulatives)}")
    lines.append("Show one worked example slowly, naming the representation before the operation.")
    lines.append("")
    lines.extend(render_problem_list("Guided Practice", guided))
    lines.extend(render_problem_list("Independent Practice", independent))
    lines.extend(render_problem_list("Exit Ticket", [exit_ticket]))

    if audience in {"teacher", "combined"}:
        lines.extend(render_lesson_answer_key(warm_up, guided, independent, exit_ticket))
        lines.extend(render_hint_ladder(independent, exit_ticket))
        lines.extend(render_teacher_notes(topic))

    return "\n".join(lines).rstrip() + "\n"


def render_review_plan(topics: list[str], days: int, seed: int, title: str) -> str:
    if days <= 0:
        raise ValueError("--days must be positive.")
    rng = random.Random(seed)
    actual_title = title or "Spiral Review Plan"
    lines = [f"# {actual_title}", "", f"Topics: `{', '.join(topics)}`", f"Seed: `{seed}`", f"Days: `{days}`", ""]
    answer_lines = ["## Answer Key", ""]

    for day in range(1, days + 1):
        focus_topic = topics[(day - 1) % len(topics)]
        spiral_topic = topics[day % len(topics)]
        warmup = diagnostic_items(focus_topic, rng)[0]
        focus_items = practice_items(focus_topic, 2, rng)
        spiral_item = practice_items(spiral_topic, 1, rng)[0]
        exit_ticket = challenge_problem(focus_topic, rng)

        lines.append(f"## Day {day}")
        lines.append("")
        lines.append(f"- Focus topic: `{focus_topic}`")
        lines.append(f"- Spiral topic: `{spiral_topic}`")
        lines.append(f"- Suggested model: {', '.join(TOPICS[focus_topic].manipulatives)}")
        lines.append("")
        lines.append("### Retrieval Warm-Up")
        lines.append("")
        lines.append(f"1. {warmup.prompt}")
        lines.append("")
        lines.append("### Focus Practice")
        lines.append("")
        for index, problem in enumerate(focus_items, start=1):
            lines.append(f"{index}. {problem.prompt}")
        lines.append("")
        lines.append("### Spiral Review")
        lines.append("")
        lines.append(f"1. {spiral_item.prompt}")
        lines.append("")
        lines.append("### Exit Ticket")
        lines.append("")
        lines.append(f"1. {exit_ticket.prompt}")
        lines.append("")

        answer_lines.append(f"### Day {day}")
        answer_lines.append("")
        answer_lines.append(f"Warm-Up: {warmup.answer}")
        for index, problem in enumerate(focus_items, start=1):
            answer_lines.append(f"Focus {index}: {problem.answer}")
        answer_lines.append(f"Spiral: {spiral_item.answer}")
        answer_lines.append(f"Exit Ticket: {exit_ticket.answer}")
        answer_lines.append("")

    lines.extend(answer_lines)
    return "\n".join(lines).rstrip() + "\n"


def write_output(text: str, output: str | None, label: str) -> None:
    if output:
        output_path = Path(output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(text, encoding="utf-8")
        print(f"Wrote {label} to {output_path}")
        return
    print(text, end="")


def run_worksheet(args: argparse.Namespace) -> int:
    text = render_worksheet(args.topic, args.count, args.seed, args.audience, args.title)
    write_output(text, args.output, "worksheet")
    return 0


def run_lesson(args: argparse.Namespace) -> int:
    text = render_lesson(args.topic, args.seed, args.duration, args.audience, args.title)
    write_output(text, args.output, "lesson plan")
    return 0


def run_review_plan(args: argparse.Namespace) -> int:
    text = render_review_plan(args.topic, args.days, args.seed, args.title)
    write_output(text, args.output, "review plan")
    return 0


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
import argparse
import calendar
import csv
import html
import json
import math
import random
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path


DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DAY_NAMES_KO = ["월", "화", "수", "목", "금", "토", "일"]
UNASSIGNED_ID = "__unassigned__"


@dataclass(frozen=True)
class Shift:
    id: str
    date: date
    day_name: str
    day_kind: str
    key: str
    name: str
    start: int
    end: int
    credit_hours: float
    order: int


def parse_time(value):
    hour, minute = value.split(":")
    return int(hour) * 60 + int(minute)


def format_time(minutes):
    hour = minutes // 60
    minute = minutes % 60
    return f"{hour:02d}:{minute:02d}"


def overlaps(start_a, end_a, start_b, end_b):
    return start_a < end_b and start_b < end_a


def load_config(path):
    with path.open(encoding="utf-8") as fp:
        return json.load(fp)


def month_dates(month_value):
    year, month = map(int, month_value.split("-"))
    last_day = calendar.monthrange(year, month)[1]
    for day in range(1, last_day + 1):
        yield date(year, month, day)


def build_shifts(config):
    shifts = []
    templates = config["rules"]["shift_templates"]
    for current in month_dates(config["month"]):
        day_kind = "weekend" if current.weekday() >= 5 else "weekday"
        for order, template in enumerate(templates[day_kind]):
            shift_id = f"{current.isoformat()}:{template['key']}"
            shifts.append(
                Shift(
                    id=shift_id,
                    date=current,
                    day_name=DAY_NAMES_KO[current.weekday()],
                    day_kind=day_kind,
                    key=template["key"],
                    name=template["name"],
                    start=parse_time(template["start"]),
                    end=parse_time(template["end"]),
                    credit_hours=float(template["credit_hours"]),
                    order=order,
                )
            )
    return shifts


def unavailable_by_rule(assistant, shift):
    for rule in assistant.get("unavailable_rules", []):
        if rule.get("date") != shift.date.isoformat():
            continue
        if rule.get("mode") == "all":
            return True
        if shift.key in rule.get("unavailable_shifts", []):
            return True
        only_shifts = rule.get("only_shifts")
        if only_shifts is not None and shift.key not in only_shifts:
            return True
    return False


def class_conflict(assistant, shift):
    if shift.date.weekday() >= 5:
        return False
    day_key = DAY_KEYS[shift.date.weekday()]
    for start, end in assistant.get("classes", {}).get(day_key, []):
        if overlaps(shift.start, shift.end, parse_time(start), parse_time(end)):
            return True
    return False


def can_work_static(assistant, shift):
    return not unavailable_by_rule(assistant, shift) and not class_conflict(assistant, shift)


def build_candidates(config, shifts):
    assistants = config["assistants"]
    return {
        shift.id: [
            assistant["id"]
            for assistant in assistants
            if can_work_static(assistant, shift)
        ]
        for shift in shifts
    }


def summarize_hours(config, assignments, shifts_by_id):
    hours = {assistant["id"]: 0.0 for assistant in config["assistants"]}
    counts = {assistant["id"]: 0 for assistant in config["assistants"]}
    weekends = {assistant["id"]: 0 for assistant in config["assistants"]}
    shift_types = {
        assistant["id"]: {template["key"]: 0 for group in config["rules"]["shift_templates"].values() for template in group}
        for assistant in config["assistants"]
    }
    for shift_id, assistant_id in assignments.items():
        if assistant_id == UNASSIGNED_ID:
            continue
        shift = shifts_by_id[shift_id]
        hours[assistant_id] += shift.credit_hours
        counts[assistant_id] += 1
        weekends[assistant_id] += 1 if shift.day_kind == "weekend" else 0
        shift_types[assistant_id][shift.key] += 1
    return hours, counts, weekends, shift_types


def objective(config, assignments, shifts_by_id):
    hours, counts, weekends, _ = summarize_hours(config, assignments, shifts_by_id)
    values = list(hours.values())
    if not values:
        return (math.inf, math.inf, math.inf, math.inf)
    average = sum(values) / len(values)
    variance = sum((value - average) ** 2 for value in values) / len(values)
    return (
        max(values) - min(values),
        math.sqrt(variance),
        max(counts.values()) - min(counts.values()),
        max(weekends.values()) - min(weekends.values()),
    )


def greedy_once(config, shifts, candidates, rng):
    assistants = config["assistants"]
    assistant_ids = [assistant["id"] for assistant in assistants]
    shifts_by_id = {shift.id: shift for shift in shifts}
    total_hours = sum(shift.credit_hours for shift in shifts)
    target_hours = total_hours / len(assistant_ids)

    hours = {assistant_id: 0.0 for assistant_id in assistant_ids}
    counts = {assistant_id: 0 for assistant_id in assistant_ids}
    weekends = {assistant_id: 0 for assistant_id in assistant_ids}
    shift_type_counts = {assistant_id: {} for assistant_id in assistant_ids}
    days_worked = {assistant_id: set() for assistant_id in assistant_ids}
    assignments = {}

    assignment_order = sorted(
        shifts,
        key=lambda shift: (len(candidates[shift.id]), shift.date.isoformat(), shift.order),
    )

    for shift in assignment_order:
        possible = [
            assistant_id
            for assistant_id in candidates[shift.id]
            if shift.date.isoformat() not in days_worked[assistant_id]
        ]
        if not possible:
            return None

        def score(assistant_id):
            projected = hours[assistant_id] + shift.credit_hours
            over_target = max(0.0, projected - target_hours)
            return (
                projected
                + over_target * 1.6
                + counts[assistant_id] * 0.18
                + weekends[assistant_id] * (0.5 if shift.day_kind == "weekend" else 0.05)
                + shift_type_counts[assistant_id].get(shift.key, 0) * 0.35
                + rng.random() * 1.15
            )

        selected = min(possible, key=score)
        assignments[shift.id] = selected
        hours[selected] += shift.credit_hours
        counts[selected] += 1
        weekends[selected] += 1 if shift.day_kind == "weekend" else 0
        shift_type_counts[selected][shift.key] = shift_type_counts[selected].get(shift.key, 0) + 1
        days_worked[selected].add(shift.date.isoformat())

    return improve(config, assignments, shifts_by_id, candidates)


def improve(config, assignments, shifts_by_id, candidates):
    assignments = dict(assignments)
    assistant_ids = [assistant["id"] for assistant in config["assistants"]]
    days_worked = {assistant_id: set() for assistant_id in assistant_ids}
    for shift_id, assistant_id in assignments.items():
        days_worked[assistant_id].add(shifts_by_id[shift_id].date.isoformat())

    changed = True
    while changed:
        changed = False
        current_obj = objective(config, assignments, shifts_by_id)
        hours, _, _, _ = summarize_hours(config, assignments, shifts_by_id)
        ordered_high = sorted(assistant_ids, key=lambda item: hours[item], reverse=True)
        ordered_low = sorted(assistant_ids, key=lambda item: hours[item])

        for high_id in ordered_high:
            high_shift_ids = [
                shift_id
                for shift_id, assistant_id in assignments.items()
                if assistant_id == high_id
            ]
            high_shift_ids.sort(key=lambda shift_id: shifts_by_id[shift_id].credit_hours, reverse=True)

            for shift_id in high_shift_ids:
                shift = shifts_by_id[shift_id]
                shift_date = shift.date.isoformat()
                for low_id in ordered_low:
                    if low_id == high_id:
                        continue
                    if low_id not in candidates[shift_id]:
                        continue
                    if shift_date in days_worked[low_id]:
                        continue

                    assignments[shift_id] = low_id
                    days_worked[high_id].remove(shift_date)
                    days_worked[low_id].add(shift_date)
                    new_obj = objective(config, assignments, shifts_by_id)
                    if new_obj < current_obj:
                        changed = True
                        break

                    assignments[shift_id] = high_id
                    days_worked[low_id].remove(shift_date)
                    days_worked[high_id].add(shift_date)
                if changed:
                    break
            if changed:
                break

    return assignments


def solve(config, attempts, seed, strict=False):
    rng = random.Random(seed)
    shifts = build_shifts(config)
    shifts_by_id = {shift.id: shift for shift in shifts}
    candidates = build_candidates(config, shifts)

    impossible = [shift for shift in shifts if not candidates[shift.id]]
    if impossible and strict:
        details = ", ".join(f"{shift.date.isoformat()} {shift.name}" for shift in impossible)
        raise RuntimeError(f"배정 가능한 조교가 없는 근무가 있습니다: {details}")
    assignable_shifts = [shift for shift in shifts if candidates[shift.id]]

    best = None
    best_obj = None
    tolerance = config["rules"].get("fairness_tolerance_hours", 10)
    for _ in range(attempts):
        result = greedy_once(config, assignable_shifts, candidates, rng)
        if result is None:
            continue
        result_obj = objective(config, result, shifts_by_id)
        if best is None or result_obj < best_obj:
            best = result
            best_obj = result_obj
            if result_obj[0] <= tolerance and result_obj[1] < 2.5:
                break

    if best is None:
        raise RuntimeError("완성된 근무표를 찾지 못했습니다. 제약을 완화하거나 attempts를 늘려 주세요.")

    for shift in impossible:
        best[shift.id] = UNASSIGNED_ID
    return best, shifts, candidates


def validate(config, assignments, shifts, candidates):
    shifts_by_id = {shift.id: shift for shift in shifts}
    issues = []
    assigned_shift_ids = set(assignments)
    expected_shift_ids = {shift.id for shift in shifts}

    missing = expected_shift_ids - assigned_shift_ids
    if missing:
        issues.append(f"미배정 근무 {len(missing)}개")

    per_day = {}
    for shift_id, assistant_id in assignments.items():
        shift = shifts_by_id[shift_id]
        if assistant_id == UNASSIGNED_ID:
            issues.append(f"{shift.date.isoformat()} {shift.name}: 배정 가능한 조교 없음")
            continue
        if assistant_id not in candidates[shift_id]:
            issues.append(f"{shift.date.isoformat()} {shift.name}: {assistant_id} 배정 불가 조건 위반")
        key = (shift.date.isoformat(), assistant_id)
        per_day[key] = per_day.get(key, 0) + 1

    for (day, assistant_id), count in per_day.items():
        if count > 1:
            issues.append(f"{day}: {assistant_id} 하루 {count}회 배정")

    hours, _, _, _ = summarize_hours(config, assignments, shifts_by_id)
    tolerance = config["rules"].get("fairness_tolerance_hours", 10)
    if max(hours.values()) - min(hours.values()) > tolerance:
        issues.append(
            f"월간 시간 편차 초과: {max(hours.values()) - min(hours.values()):.1f}시간"
        )

    return issues


def schedule_rows(config, assignments, shifts):
    assistants = {assistant["id"]: assistant for assistant in config["assistants"]}
    rows = []
    for shift in sorted(shifts, key=lambda item: (item.date, item.order)):
        assistant_id = assignments[shift.id]
        assistant = assistants.get(
            assistant_id,
            {"name": "미배정", "short_name": "미배정"},
        )
        rows.append(
            {
                "date": shift.date.isoformat(),
                "day": shift.day_name,
                "shift": shift.name,
                "shift_key": shift.key,
                "start": format_time(shift.start),
                "end": format_time(shift.end),
                "credit_hours": shift.credit_hours,
                "assistant": assistant["name"],
                "short_name": assistant["short_name"],
            }
        )
    return rows


def write_csv(rows, path):
    with path.open("w", encoding="utf-8-sig", newline="") as fp:
        writer = csv.DictWriter(
            fp,
            fieldnames=[
                "date",
                "day",
                "shift",
                "shift_key",
                "start",
                "end",
                "credit_hours",
                "assistant",
                "short_name",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)


def write_markdown(config, rows, summary, issues, path):
    shift_order = ["open", "middle", "close", "night"]
    grouped = {}
    for row in rows:
        grouped.setdefault((row["date"], row["day"]), {})[row["shift_key"]] = row

    lines = [f"# {config['title']}", ""]
    lines.append("| 날짜 | 요일 | 오픈 | 미들 | 마감 | 야간 |")
    lines.append("|---|---:|---|---|---|---|")
    for (day, day_name), shifts_for_day in grouped.items():
        cells = []
        for shift_key in shift_order:
            row = shifts_for_day.get(shift_key)
            if row:
                cells.append(f"{row['short_name']} ({row['start']}-{row['end']})")
            else:
                cells.append("-")
        lines.append(f"| {day} | {day_name} | " + " | ".join(cells) + " |")

    lines.extend(["", "## 근무 시간 요약", ""])
    lines.append("| 조교 | 시간 | 근무 수 | 주말 근무 |")
    lines.append("|---|---:|---:|---:|")
    for item in summary["assistant_hours"]:
        lines.append(
            f"| {item['name']} | {item['hours']:.1f} | {item['shift_count']} | {item['weekend_count']} |"
        )

    lines.extend(["", "## 검증", ""])
    if issues:
        lines.extend(f"- {issue}" for issue in issues)
    else:
        lines.append("- 모든 근무가 배정되었고, 수업/근무불가/하루 1회/시간 편차 조건을 통과했습니다.")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(config, rows, summary, issues, path):
    shift_order = ["open", "middle", "close", "night"]
    grouped = {}
    for row in rows:
        grouped.setdefault((row["date"], row["day"]), {})[row["shift_key"]] = row

    schedule_rows_html = []
    for (day, day_name), shifts_for_day in grouped.items():
        cells = []
        for shift_key in shift_order:
            row = shifts_for_day.get(shift_key)
            if row:
                value = f"{row['short_name']}<small>{row['start']}-{row['end']}</small>"
            else:
                value = "-"
            cells.append(f"<td>{value}</td>")
        schedule_rows_html.append(
            f"<tr><th>{html.escape(day)}</th><td>{html.escape(day_name)}</td>{''.join(cells)}</tr>"
        )

    summary_rows_html = []
    for item in summary["assistant_hours"]:
        summary_rows_html.append(
            "<tr>"
            f"<th>{html.escape(item['name'])}</th>"
            f"<td>{item['hours']:.1f}</td>"
            f"<td>{item['shift_count']}</td>"
            f"<td>{item['weekend_count']}</td>"
            "</tr>"
        )

    issue_html = (
        "<ul>" + "".join(f"<li>{html.escape(issue)}</li>" for issue in issues) + "</ul>"
        if issues
        else "<p>모든 근무가 배정되었고 검증 조건을 통과했습니다.</p>"
    )

    document = f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(config['title'])}</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px; color: #202124; }}
    h1 {{ font-size: 28px; margin: 0 0 20px; }}
    h2 {{ font-size: 18px; margin: 28px 0 10px; }}
    table {{ border-collapse: collapse; width: 100%; margin: 12px 0 24px; }}
    th, td {{ border: 1px solid #d8dadd; padding: 8px 10px; text-align: left; vertical-align: top; }}
    thead th {{ background: #f2f5f7; }}
    tbody th {{ white-space: nowrap; }}
    small {{ display: block; color: #5f6368; margin-top: 2px; }}
  </style>
</head>
<body>
  <h1>{html.escape(config['title'])}</h1>
  <table>
    <thead><tr><th>날짜</th><th>요일</th><th>오픈</th><th>미들</th><th>마감</th><th>야간</th></tr></thead>
    <tbody>{''.join(schedule_rows_html)}</tbody>
  </table>
  <h2>근무 시간 요약</h2>
  <table>
    <thead><tr><th>조교</th><th>시간</th><th>근무 수</th><th>주말 근무</th></tr></thead>
    <tbody>{''.join(summary_rows_html)}</tbody>
  </table>
  <h2>검증</h2>
  {issue_html}
</body>
</html>
"""
    path.write_text(document, encoding="utf-8")


def build_summary(config, assignments, shifts):
    shifts_by_id = {shift.id: shift for shift in shifts}
    hours, counts, weekends, shift_types = summarize_hours(config, assignments, shifts_by_id)
    assistants = {assistant["id"]: assistant for assistant in config["assistants"]}
    assistant_hours = []
    for assistant_id, value in sorted(hours.items(), key=lambda item: (item[1], assistants[item[0]]["short_name"])):
        assistant_hours.append(
            {
                "id": assistant_id,
                "name": assistants[assistant_id]["name"],
                "short_name": assistants[assistant_id]["short_name"],
                "hours": value,
                "shift_count": counts[assistant_id],
                "weekend_count": weekends[assistant_id],
                "shift_types": shift_types[assistant_id],
            }
        )
    values = list(hours.values())
    return {
        "month": config["month"],
        "total_shifts": len(shifts),
        "assigned_shifts": sum(1 for assistant_id in assignments.values() if assistant_id != UNASSIGNED_ID),
        "unassigned_shifts": sum(1 for assistant_id in assignments.values() if assistant_id == UNASSIGNED_ID),
        "required_credit_hours": sum(shift.credit_hours for shift in shifts),
        "total_credit_hours": sum(values),
        "min_hours": min(values),
        "max_hours": max(values),
        "hour_range": max(values) - min(values),
        "assistant_hours": assistant_hours,
    }


def write_outputs(config, assignments, shifts, candidates, out_dir):
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = schedule_rows(config, assignments, shifts)
    summary = build_summary(config, assignments, shifts)
    issues = validate(config, assignments, shifts, candidates)

    month_key = config["month"].replace("-", "_")
    write_csv(rows, out_dir / f"{month_key}_schedule.csv")
    write_markdown(config, rows, summary, issues, out_dir / f"{month_key}_schedule.md")
    write_html(config, rows, summary, issues, out_dir / f"{month_key}_schedule.html")
    (out_dir / f"{month_key}_summary.json").write_text(
        json.dumps({"summary": summary, "validation_issues": issues}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return summary, issues


def main():
    root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="제2생활관 조교 근무표 생성기")
    parser.add_argument("--data", type=Path, default=root / "data" / "june_2026.json")
    parser.add_argument("--out", type=Path, default=root / "output")
    parser.add_argument("--attempts", type=int, default=5000)
    parser.add_argument("--seed", type=int, default=202606)
    parser.add_argument("--strict", action="store_true", help="배정 불가능한 근무가 있으면 실패 처리")
    args = parser.parse_args()

    started_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    config = load_config(args.data)
    assignments, shifts, candidates = solve(config, attempts=args.attempts, seed=args.seed, strict=args.strict)
    summary, issues = write_outputs(config, assignments, shifts, candidates, args.out)

    print(f"{config['title']}")
    print(f"generated_at: {started_at}")
    print(f"total_shifts: {summary['total_shifts']}")
    print(f"assigned_shifts: {summary['assigned_shifts']}")
    print(f"unassigned_shifts: {summary['unassigned_shifts']}")
    print(f"assigned_credit_hours: {summary['total_credit_hours']:.1f} / required {summary['required_credit_hours']:.1f}")
    print(f"hour_range: {summary['hour_range']:.1f} ({summary['min_hours']:.1f}~{summary['max_hours']:.1f})")
    print(f"output_dir: {args.out}")
    if issues:
        print("validation: FAIL")
        for issue in issues:
            print(f"- {issue}")
    else:
        print("validation: PASS")


if __name__ == "__main__":
    main()

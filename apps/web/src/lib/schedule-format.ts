import type { AssistantProfile, AvailabilityRule, ShiftKey } from "@part-time/scheduler-core";

export const shiftLabels: Record<string, string> = {
  open: "오픈",
  middle: "미들",
  close: "마감",
  night: "야간"
};

export const dayLabels: Record<string, string> = {
  mon: "월",
  tue: "화",
  wed: "수",
  thu: "목",
  fri: "금"
};

const dayTokens: Record<string, string> = {
  "월": "mon", "화": "tue", "수": "wed", "목": "thu", "금": "fri", "토": "sat", "일": "sun",
  "mon": "mon", "tue": "tue", "wed": "wed", "thu": "thu", "fri": "fri", "sat": "sat", "sun": "sun"
};

export function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return month;
  return `${year}년 ${monthNumber}월`;
}

export function remapDateToMonth(date: string, month: string) {
  const day = Number(date.split("-")[2] ?? 1);
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return `${month}-${String(Math.min(Math.max(day, 1), lastDay)).padStart(2, "0")}`;
}

export function isoDate(month: string, day: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  if (!year || !monthNumber || day < 1 || day > lastDay) return null;
  return `${month}-${String(day).padStart(2, "0")}`;
}

export function ruleKind(rule: AvailabilityRule) {
  if (rule.mode === "all") return "all";
  const blocked = rule.unavailable_shifts?.[0];
  return blocked ? `block:${blocked}` : "all";
}

export function buildRuleFromKind(rule: AvailabilityRule, kind: string): AvailabilityRule {
  if (kind === "all") {
    return { date: rule.date, mode: "all", reason: rule.reason };
  }
  const key = kind.replace("block:", "") as ShiftKey;
  return { date: rule.date, unavailable_shifts: [key], reason: rule.reason };
}

export function countUnavailableInRange(assistant: AssistantProfile, startDate: string, endDate: string) {
  const [from, to] = startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
  return (assistant.unavailable_rules ?? []).filter((rule) => rule.date >= from && rule.date <= to).length;
}

export function parseBulkUnavailable(text: string, month: string): AvailabilityRule[] {
  return text
    .split(/\n+/)
    .flatMap((line) => parseUnavailableLine(line, month));
}

function parseUnavailableLine(line: string, month: string): AvailabilityRule[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  const dates = expandDates(trimmed, month);
  if (!dates.length) return [];

  const unavailableShifts = Object.entries(shiftLabels)
    .filter(([key, label]) => trimmed.toLowerCase().includes(key) || trimmed.includes(label))
    .map(([key]) => key as ShiftKey);
  const isAllDay = unavailableShifts.length === 0 || trimmed.includes("전체") || trimmed.includes("종일");
  const reason = trimmed.replace(/\s+/g, " ");

  return dates.map((date) =>
    isAllDay
      ? { date, mode: "all", reason }
      : { date, unavailable_shifts: unavailableShifts, reason }
  );
}

function expandDates(text: string, month: string) {
  const dates = new Set<string>();
  const rangePattern = /(?:(\d{1,2})[/.])?(\d{1,2})\s*[-~]\s*(?:(\d{1,2})[/.])?(\d{1,2})/g;
  const isoPattern = /\b\d{4}-\d{2}-(\d{2})\b/g;
  let sanitized = text;

  for (const match of text.matchAll(isoPattern)) {
    const date = isoDate(month, Number(match[1]));
    if (date) dates.add(date);
    sanitized = sanitized.replace(match[0], " ");
  }

  for (const match of sanitized.matchAll(rangePattern)) {
    const startDay = Number(match[2]);
    const endDay = Number(match[4]);
    const [from, to] = startDay <= endDay ? [startDay, endDay] : [endDay, startDay];
    for (let day = from; day <= to; day += 1) {
      const date = isoDate(month, day);
      if (date) dates.add(date);
    }
    sanitized = sanitized.replace(match[0], " ");
  }

  const singlePattern = /(?:(\d{1,2})[/.])?(\d{1,2})(?!\s*[:시])/g;
  for (const match of sanitized.matchAll(singlePattern)) {
    const day = Number(match[2]);
    const date = isoDate(month, day);
    if (date) dates.add(date);
  }

  return [...dates].sort();
}

export function parseBulkClasses(text: string): AssistantProfile["classes"] {
  const classes: AssistantProfile["classes"] = {};
  const timePattern = /(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})/g;

  for (const rawLine of text.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const dayMatch = Object.keys(dayTokens)
      .sort((a, b) => b.length - a.length)
      .find((token) => line.toLowerCase().startsWith(token.toLowerCase()));
    if (!dayMatch) continue;
    const day = dayTokens[dayMatch] as keyof typeof classes;

    for (const match of line.matchAll(timePattern)) {
      classes[day] ??= [];
      classes[day]!.push([normalizeTime(match[1]), normalizeTime(match[2])]);
    }
  }

  return classes;
}

function normalizeTime(value: string) {
  const [hour, minute] = value.split(":");
  return `${hour.padStart(2, "0")}:${minute}`;
}

export function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

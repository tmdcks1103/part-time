import type {
  AssignmentMap,
  AssistantProfile,
  CandidateMap,
  DayKey,
  DayKind,
  FairnessWindow,
  ScheduleSummary,
  SchedulerConfig,
  ShiftInstance,
  SolveOptions,
  SolveResult
} from "./types";

export * from "./types";

export const UNASSIGNED_ID = "__unassigned__";
export const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const DAY_NAMES_KO = ["월", "화", "수", "목", "금", "토", "일"];

export function parseTime(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function formatTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function overlaps(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

export function monthDates(month: string): { iso: string; date: Date }[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return Array.from({ length: lastDay }, (_, index) => {
    const day = index + 1;
    return {
      iso: `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      date: new Date(year, monthNumber - 1, day)
    };
  });
}

export function buildShifts(config: SchedulerConfig): ShiftInstance[] {
  return monthDates(config.month).flatMap(({ iso, date }) => {
    const dayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1;
    const dayKind: DayKind = dayIndex >= 5 ? "weekend" : "weekday";
    return config.rules.shift_templates[dayKind].map((template, order) => ({
      id: `${iso}:${template.key}`,
      date: iso,
      dayIndex,
      dayName: DAY_NAMES_KO[dayIndex],
      dayKind,
      key: template.key,
      name: template.name,
      start: parseTime(template.start),
      end: parseTime(template.end),
      creditHours: Number(template.credit_hours),
      order
    }));
  });
}

export function classConflict(assistant: AssistantProfile, shift: ShiftInstance): boolean {
  if (shift.dayIndex >= 5) return false;
  const classes = assistant.classes?.[DAY_KEYS[shift.dayIndex]] ?? [];
  return classes.some(([start, end]) => overlaps(shift.start, shift.end, parseTime(start), parseTime(end)));
}

function shouldIgnoreClassConflicts(config?: SchedulerConfig): boolean {
  return Boolean(config?.rules.ignore_class_conflicts);
}

export function blockedReason(assistant: AssistantProfile, shift: ShiftInstance, config?: SchedulerConfig): string {
  for (const rule of assistant.unavailable_rules ?? []) {
    if (rule.date !== shift.date) continue;
    if (rule.mode === "all") return rule.reason ?? "근무 불가";
    if ((rule.unavailable_shifts ?? []).includes(shift.key)) return rule.reason ?? `${shift.name} 불가`;
    if (rule.only_shifts && !rule.only_shifts.includes(shift.key)) {
      return rule.reason ?? `${rule.only_shifts.join(", ")}만 가능`;
    }
  }
  if (!shouldIgnoreClassConflicts(config) && classConflict(assistant, shift)) return "수업 시간";
  return "";
}

export function buildCandidates(config: SchedulerConfig, shifts: ShiftInstance[]): CandidateMap {
  return Object.fromEntries(
    shifts.map((shift) => [
      shift.id,
      config.assistants
        .filter((assistant) => blockedReason(assistant, shift, config) === "")
        .map((assistant) => assistant.id)
    ])
  );
}

function seededRandom(seed: number): () => number {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function summarizeRaw(config: SchedulerConfig, assignments: AssignmentMap, shifts: ShiftInstance[]) {
  const shiftMap = new Map(shifts.map((shift) => [shift.id, shift]));
  const hours = Object.fromEntries(config.assistants.map((assistant) => [assistant.id, 0]));
  const counts = Object.fromEntries(config.assistants.map((assistant) => [assistant.id, 0]));
  const weekends = Object.fromEntries(config.assistants.map((assistant) => [assistant.id, 0]));
  const shiftTypes = Object.fromEntries(
    config.assistants.map((assistant) => [assistant.id, { open: 0, middle: 0, close: 0, night: 0 } as Record<string, number>])
  );

  for (const [shiftId, assistantId] of Object.entries(assignments)) {
    if (assistantId === UNASSIGNED_ID) continue;
    const shift = shiftMap.get(shiftId);
    if (!shift || !(assistantId in hours)) continue;
    hours[assistantId] += shift.creditHours;
    counts[assistantId] += 1;
    weekends[assistantId] += shift.dayKind === "weekend" ? 1 : 0;
    shiftTypes[assistantId][shift.key] = (shiftTypes[assistantId][shift.key] ?? 0) + 1;
  }

  return { hours, counts, weekends, shiftTypes };
}

function activeFairnessWindows(config: SchedulerConfig): FairnessWindow[] {
  return (config.rules.fairness_windows ?? [])
    .filter((window) => window.active !== false && window.start_date && window.end_date)
    .map((window) =>
      window.start_date <= window.end_date
        ? window
        : { ...window, start_date: window.end_date, end_date: window.start_date }
    );
}

function shiftsInWindow(shifts: ShiftInstance[], window: FairnessWindow): ShiftInstance[] {
  return shifts.filter((shift) => shift.date >= window.start_date && shift.date <= window.end_date);
}

function hourRange(values: number[]): number {
  return values.length ? Math.max(...values) - Math.min(...values) : 0;
}

function standardDeviation(values: number[]): number {
  if (!values.length) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

export function summarize(config: SchedulerConfig, assignments: AssignmentMap, shifts: ShiftInstance[]): ScheduleSummary {
  const raw = summarizeRaw(config, assignments, shifts);
  const values = Object.values(raw.hours);
  const requiredCreditHours = shifts.reduce((sum, shift) => sum + shift.creditHours, 0);
  const assignedShifts = Object.values(assignments).filter((assistantId) => assistantId !== UNASSIGNED_ID).length;
  const assistants = Object.fromEntries(config.assistants.map((assistant) => [assistant.id, assistant]));
  const assistantHours = Object.entries(raw.hours)
    .map(([assistantId, hours]) => ({
      id: assistantId,
      name: assistants[assistantId]?.name ?? assistantId,
      shortName: assistants[assistantId]?.short_name ?? assistantId,
      hours,
      shiftCount: raw.counts[assistantId] ?? 0,
      weekendCount: raw.weekends[assistantId] ?? 0,
      shiftTypes: raw.shiftTypes[assistantId] ?? {}
    }))
    .sort((left, right) => left.hours - right.hours || left.shortName.localeCompare(right.shortName));

  return {
    month: config.month,
    totalShifts: shifts.length,
    assignedShifts,
    unassignedShifts: shifts.length - assignedShifts,
    requiredCreditHours,
    assignedCreditHours: values.reduce((sum, value) => sum + value, 0),
    minHours: values.length ? Math.min(...values) : 0,
    maxHours: values.length ? Math.max(...values) : 0,
    hourRange: hourRange(values),
    assistantHours
  };
}

function objective(config: SchedulerConfig, assignments: AssignmentMap, shifts: ShiftInstance[]): number[] {
  const summary = summarize(config, assignments, shifts);
  const values = summary.assistantHours.map((assistant) => assistant.hours);
  const counts = summary.assistantHours.map((assistant) => assistant.shiftCount);
  const weekends = summary.assistantHours.map((assistant) => assistant.weekendCount);
  const nights = summary.assistantHours.map((assistant) => assistant.shiftTypes.night ?? 0);
  const windowScores = activeFairnessWindows(config).flatMap((window) => {
    const windowSummary = summarize(config, assignments, shiftsInWindow(shifts, window));
    const windowValues = windowSummary.assistantHours.map((assistant) => assistant.hours);
    return [windowSummary.hourRange, standardDeviation(windowValues)];
  });

  return [
    ...windowScores,
    summary.hourRange,
    standardDeviation(values),
    hourRange(nights),
    hourRange(counts),
    hourRange(weekends)
  ];
}

function compareObjective(left: number[], right: number[] | null): number {
  if (!right) return -1;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function greedyOnce(config: SchedulerConfig, shifts: ShiftInstance[], candidates: CandidateMap, seed: number): AssignmentMap | null {
  const random = seededRandom(seed);
  const assistantIds = config.assistants.map((assistant) => assistant.id);
  const assignableShifts = shifts.filter((shift) => candidates[shift.id]?.length);
  const assignmentOrder = [...assignableShifts].sort(
    (left, right) =>
      candidates[left.id].length - candidates[right.id].length ||
      left.date.localeCompare(right.date) ||
      left.order - right.order
  );
  const targetHours = assignableShifts.reduce((sum, shift) => sum + shift.creditHours, 0) / assistantIds.length;
  const windows = activeFairnessWindows(config).map((window) => {
    const windowShifts = shiftsInWindow(assignableShifts, window);
    return {
      ...window,
      targetHours: windowShifts.reduce((sum, shift) => sum + shift.creditHours, 0) / assistantIds.length
    };
  });
  const hours = Object.fromEntries(assistantIds.map((id) => [id, 0]));
  const windowHours = Object.fromEntries(
    windows.map((window) => [window.id, Object.fromEntries(assistantIds.map((id) => [id, 0]))])
  );
  const counts = Object.fromEntries(assistantIds.map((id) => [id, 0]));
  const weekends = Object.fromEntries(assistantIds.map((id) => [id, 0]));
  const shiftTypeCounts = Object.fromEntries(assistantIds.map((id) => [id, {} as Record<string, number>]));
  const daysWorked = Object.fromEntries(assistantIds.map((id) => [id, new Set<string>()]));
  const assignments: AssignmentMap = {};

  for (const shift of assignmentOrder) {
    const possible = candidates[shift.id].filter((assistantId) => !daysWorked[assistantId].has(shift.date));
    if (!possible.length) return null;

    const selected = possible.reduce<{ id: string; score: number } | null>((best, assistantId) => {
      const projected = hours[assistantId] + shift.creditHours;
      const windowScore = windows.reduce((sum, window) => {
        if (shift.date < window.start_date || shift.date > window.end_date) return sum;
        const projectedWindow = windowHours[window.id][assistantId] + shift.creditHours;
        return sum + projectedWindow * 2.8 + Math.max(0, projectedWindow - window.targetHours) * 4.2;
      }, 0);
      const score =
        windowScore +
        projected +
        Math.max(0, projected - targetHours) * 1.8 +
        counts[assistantId] * 0.2 +
        weekends[assistantId] * (shift.dayKind === "weekend" ? 0.55 : 0.06) +
        (shiftTypeCounts[assistantId][shift.key] ?? 0) * (shift.key === "night" ? 1.25 : 0.38) +
        random() * 1.4;
      return !best || score < best.score ? { id: assistantId, score } : best;
    }, null)?.id;

    if (!selected) return null;
    assignments[shift.id] = selected;
    hours[selected] += shift.creditHours;
    for (const window of windows) {
      if (shift.date >= window.start_date && shift.date <= window.end_date) {
        windowHours[window.id][selected] += shift.creditHours;
      }
    }
    counts[selected] += 1;
    weekends[selected] += shift.dayKind === "weekend" ? 1 : 0;
    shiftTypeCounts[selected][shift.key] = (shiftTypeCounts[selected][shift.key] ?? 0) + 1;
    daysWorked[selected].add(shift.date);
  }

  for (const shift of shifts) {
    assignments[shift.id] ??= UNASSIGNED_ID;
  }
  return assignments;
}

export function validate(config: SchedulerConfig, assignments: AssignmentMap, shifts: ShiftInstance[], candidates: CandidateMap): string[] {
  const issues: string[] = [];
  const perDay: Record<string, number> = {};

  for (const shift of shifts) {
    const assistantId = assignments[shift.id];
    if (!assistantId || assistantId === UNASSIGNED_ID) {
      issues.push(`${shift.date} ${shift.name}: 배정 가능한 조교 없음`);
      continue;
    }
    if (!candidates[shift.id]?.includes(assistantId)) {
      issues.push(`${shift.date} ${shift.name}: 배정 조건 위반`);
    }
    const dayKey = `${shift.date}:${assistantId}`;
    perDay[dayKey] = (perDay[dayKey] ?? 0) + 1;
  }

  for (const [key, count] of Object.entries(perDay)) {
    if (count > 1) issues.push(`${key.split(":")[0]}: 하루 ${count}회 배정`);
  }

  const summary = summarize(config, assignments, shifts);
  if (summary.hourRange > config.rules.fairness_tolerance_hours) {
    issues.push(`월간 시간 편차 ${summary.hourRange.toFixed(1)}시간`);
  }
  for (const window of activeFairnessWindows(config)) {
    const windowSummary = summarize(config, assignments, shiftsInWindow(shifts, window));
    if (windowSummary.hourRange > window.tolerance_hours) {
      issues.push(`${window.label}: 기간 시간 편차 ${windowSummary.hourRange.toFixed(1)}시간`);
    }
  }

  return issues;
}

export function solveSchedule(config: SchedulerConfig, options: SolveOptions = {}): SolveResult {
  const attempts = options.attempts ?? 2500;
  const seed = options.seed ?? 202606;
  const shifts = buildShifts(config);
  return solveShifts(config, shifts, attempts, seed);
}

export function solveScheduleRange(config: SchedulerConfig, startDate: string, endDate: string, options: SolveOptions = {}): SolveResult {
  const attempts = options.attempts ?? 2500;
  const seed = options.seed ?? 202606;
  const [from, to] = startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
  const shifts = monthsBetween(from, to)
    .flatMap((month) => buildShifts({ ...config, month }))
    .filter((shift) => shift.date >= from && shift.date <= to);
  return solveShifts(config, shifts, attempts, seed);
}

function monthsBetween(startDate: string, endDate: string): string[] {
  const [startYear, startMonth] = startDate.slice(0, 7).split("-").map(Number);
  const [endYear, endMonth] = endDate.slice(0, 7).split("-").map(Number);
  if (!startYear || !startMonth || !endYear || !endMonth) return [startDate.slice(0, 7)];
  const months: string[] = [];
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

function solveShifts(config: SchedulerConfig, shifts: ShiftInstance[], attempts: number, seed: number): SolveResult {
  const candidates = buildCandidates(config, shifts);
  let best: AssignmentMap | null = null;
  let bestObjective: number[] | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const assignments = greedyOnce(config, shifts, candidates, seed + attempt * 9973);
    if (!assignments) continue;
    const currentObjective = objective(config, assignments, shifts);
    if (compareObjective(currentObjective, bestObjective) < 0) {
      best = assignments;
      bestObjective = currentObjective;
    }
  }

  const assignments =
    best ??
    Object.fromEntries(shifts.map((shift) => [shift.id, candidates[shift.id]?.[0] ?? UNASSIGNED_ID]));

  const summary = summarize(config, assignments, shifts);
  const issues = validate(config, assignments, shifts, candidates);
  return { assignments, shifts, candidates, summary, issues };
}

"use client";

import { useMemo, useState } from "react";
import {
  blockedReason,
  formatTime,
  solveScheduleRange,
  summarize,
  UNASSIGNED_ID,
  validate,
  type AvailabilityRule,
  type AssistantProfile,
  type AssignmentMap,
  type SchedulerConfig,
  type ShiftKey,
  type ShiftInstance,
  type SolveResult
} from "@part-time/scheduler-core";
import { canManageSchedule, type AppUser } from "@/lib/auth";

const periodColumns = ["open", "middle", "close", "night"];
const shiftLabels: Record<string, string> = {
  open: "오픈",
  middle: "미들",
  close: "마감",
  night: "야간"
};
const defaultStartDate = "2026-07-15";
const defaultEndDate = "2026-07-31";

interface PeriodScheduleProductProps {
  initialConfig: SchedulerConfig;
  initialUser: AppUser;
}

export function PeriodScheduleProduct({ initialConfig, initialUser }: PeriodScheduleProductProps) {
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [config, setConfig] = useState<SchedulerConfig>(() => prepareConfigForMonth(initialConfig, defaultStartDate.slice(0, 7)));
  const [attempts, setAttempts] = useState(3000);
  const [seed, setSeed] = useState(202607);
  const [selectedAssistantId, setSelectedAssistantId] = useState(initialConfig.assistants[0]?.id ?? "");
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [manualAssignments, setManualAssignments] = useState<AssignmentMap | null>(null);

  const managerMode = canManageSchedule(initialUser.role);
  const solveResult = useMemo<SolveResult>(
    () => solveScheduleRange(config, startDate, endDate, { attempts, seed }),
    [attempts, config, endDate, seed, startDate]
  );
  const assignments = manualAssignments ?? solveResult.assignments;
  const summary = useMemo(() => summarize(config, assignments, solveResult.shifts), [assignments, config, solveResult.shifts]);
  const issues = useMemo(
    () => validate(config, assignments, solveResult.shifts, solveResult.candidates),
    [assignments, config, solveResult.candidates, solveResult.shifts]
  );
  const selectedAssistant = config.assistants.find((assistant) => assistant.id === selectedAssistantId) ?? config.assistants[0];
  const selectedShift = solveResult.shifts.find((shift) => shift.id === selectedShiftId) ?? null;
  const nightCounts = summary.assistantHours.map((assistant) => assistant.shiftTypes.night ?? 0);
  const nightRange = nightCounts.length ? Math.max(...nightCounts) - Math.min(...nightCounts) : 0;

  function patchConfig(updater: (draft: SchedulerConfig) => void) {
    setConfig((current) => {
      const next = structuredClone(current);
      updater(next);
      return next;
    });
    setManualAssignments(null);
  }

  function updateStartDate(date: string) {
    if (!date) return;
    setStartDate(date);
    syncConfigMonth(date);
  }

  function updateEndDate(date: string) {
    if (!date) return;
    setEndDate(date);
    syncConfigMonth(startDate);
  }

  function syncConfigMonth(date: string) {
    const nextMonth = date.slice(0, 7);
    if (!nextMonth || nextMonth === config.month) return;
    setConfig((current) => prepareConfigForMonth(current, nextMonth));
    const numericSeed = Number(nextMonth.replace("-", ""));
    if (!Number.isNaN(numericSeed)) setSeed(numericSeed);
    setManualAssignments(null);
  }

  function assignShift(assistantId: string) {
    if (!selectedShift) return;
    setManualAssignments((current) => ({
      ...(current ?? solveResult.assignments),
      [selectedShift.id]: assistantId
    }));
  }

  function regenerate() {
    setManualAssignments(null);
    setSelectedShiftId(null);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ startDate, endDate, config, assignments }, null, 2)], { type: "application/json" });
    download(`${startDate}_${endDate}_period_workspace.json`, blob);
  }

  function exportCsv() {
    const assistants = Object.fromEntries(config.assistants.map((assistant) => [assistant.id, assistant]));
    const rows = solveResult.shifts.map((shift) => {
      const assistant = assistants[assignments[shift.id]];
      return [
        shift.date,
        shift.dayName,
        shift.name,
        formatTime(shift.start),
        formatTime(shift.end),
        shift.creditHours,
        assistant?.name ?? "미배정"
      ];
    });
    const csv = [["date", "day", "shift", "start", "end", "credit_hours", "assistant"], ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    download(`${startDate}_${endDate}_period_schedule.csv`, new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  }

  return (
    <main className="product-shell periodShell">
      <header className="topbar">
        <div>
          <p className="eyebrow">기간 전용 편성 화면</p>
          <h1>{startDate} - {endDate} 근무표</h1>
        </div>
        <div className="topbarControls">
          <a className="buttonLink" href="/">월간 편성</a>
          <button type="button" onClick={exportJson}>JSON</button>
          <button type="button" onClick={exportCsv}>CSV</button>
          <button type="button" className="primary" disabled={!managerMode} onClick={regenerate}>재생성</button>
        </div>
      </header>

      <section className="metrics">
        <Metric label="기간 근무" value={`${summary.assignedShifts}/${summary.totalShifts}`} />
        <Metric label="기간 편차" value={`${summary.hourRange.toFixed(1)}h`} tone={summary.hourRange <= config.rules.fairness_tolerance_hours ? "ok" : "bad"} />
        <Metric label="야간 편차" value={`${nightRange}회`} tone={nightRange <= 1 ? "ok" : "bad"} />
        <Metric label="미배정" value={`${summary.unassignedShifts}`} tone={summary.unassignedShifts ? "bad" : "ok"} />
        <Metric label="검증" value={issues.length ? `${issues.length}건` : "통과"} tone={issues.length ? "bad" : "ok"} />
      </section>

      <section className="periodWorkspace">
        <aside className="panel periodControls">
          <section className="panelBlock">
            <div className="blockTitle">
              <h2>기간 설정</h2>
            </div>
            <div className="formGrid">
              <label>
                <span>시작일</span>
                <input type="date" value={startDate} disabled={!managerMode} onChange={(event) => updateStartDate(event.target.value)} />
              </label>
              <label>
                <span>종료일</span>
                <input type="date" value={endDate} disabled={!managerMode} onChange={(event) => updateEndDate(event.target.value)} />
              </label>
              <label>
                <span>편차 허용</span>
                <input type="number" min="0" step="0.5" value={config.rules.fairness_tolerance_hours} disabled={!managerMode} onChange={(event) => patchConfig((draft) => { draft.rules.fairness_tolerance_hours = Number(event.target.value); })} />
              </label>
              <label className="checkboxLabel">
                <span>수업 시간 반영</span>
                <input type="checkbox" checked={!config.rules.ignore_class_conflicts} disabled={!managerMode} onChange={(event) => patchConfig((draft) => { draft.rules.ignore_class_conflicts = !event.target.checked; })} />
              </label>
              <label>
                <span>시도 횟수</span>
                <input type="number" value={attempts} disabled={!managerMode} onChange={(event) => setAttempts(Number(event.target.value))} />
              </label>
              <label>
                <span>시드</span>
                <input type="number" value={seed} disabled={!managerMode} onChange={(event) => setSeed(Number(event.target.value))} />
              </label>
            </div>
          </section>

          <section className="panelBlock">
            <div className="blockTitle">
              <h2>조교별 제한 반영</h2>
            </div>
            <div className="periodRoster">
              {config.assistants.map((assistant) => {
                const person = summary.assistantHours.find((item) => item.id === assistant.id);
                const unavailableCount = countUnavailableInRange(assistant, startDate, endDate);
                const classCount = Object.values(assistant.classes ?? {}).reduce((sum, ranges) => sum + (ranges?.length ?? 0), 0);
                return (
                  <button
                    key={assistant.id}
                    type="button"
                    className={assistant.id === selectedAssistantId ? "periodPerson active" : "periodPerson"}
                    onClick={() => setSelectedAssistantId(assistant.id)}
                  >
                    <div>
                      <strong>{assistant.name}</strong>
                      <small>{unavailableCount}개 제한 · 수업 {classCount}개</small>
                    </div>
                    <b>{person?.hours.toFixed(0) ?? 0}h</b>
                  </button>
                );
              })}
            </div>
          </section>

          <PeriodLimitEditor
            assistant={selectedAssistant}
            startDate={startDate}
            endDate={endDate}
            disabled={!managerMode}
            onChange={(assistant) => patchConfig((draft) => {
              const index = draft.assistants.findIndex((item) => item.id === assistant.id);
              if (index >= 0) draft.assistants[index] = assistant;
            })}
          />
        </aside>

        <section className="panel periodSchedulePanel">
          <div className="scheduleHeader">
            <div>
              <h2>기간 근무표</h2>
              <p>{issues[0] ?? "기존 조교별 제한을 반영해 기간표를 생성했습니다."}</p>
            </div>
            <span className={config.rules.ignore_class_conflicts ? "rolePill manager" : "rolePill"}>{config.rules.ignore_class_conflicts ? "방학 모드" : "수업 반영"}</span>
          </div>
          <PeriodTable
            shifts={solveResult.shifts}
            assignments={assignments}
            assistants={config.assistants}
            selectedShiftId={selectedShiftId}
            onSelectShift={setSelectedShiftId}
          />
        </section>

        <aside className="panel periodInspectorPanel">
          <PeriodInspector
            shift={selectedShift}
            assistants={config.assistants}
            assignments={assignments}
            shifts={solveResult.shifts}
            config={config}
            disabled={!managerMode}
            onAssign={assignShift}
          />
        </aside>
      </section>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={tone ? `tone-${tone}` : undefined}>{value}</strong>
    </div>
  );
}

function PeriodTable({
  shifts,
  assignments,
  assistants,
  selectedShiftId,
  onSelectShift
}: {
  shifts: ShiftInstance[];
  assignments: AssignmentMap;
  assistants: AssistantProfile[];
  selectedShiftId: string | null;
  onSelectShift: (id: string) => void;
}) {
  const assistantsById = Object.fromEntries(assistants.map((assistant) => [assistant.id, assistant]));
  const grouped = shifts.reduce<Record<string, ShiftInstance[]>>((acc, shift) => {
    acc[shift.date] ??= [];
    acc[shift.date].push(shift);
    return acc;
  }, {});

  return (
    <div className="tableScroller periodTableScroller">
      <table className="scheduleTable">
        <thead>
          <tr>
            <th>날짜</th>
            <th>오픈</th>
            <th>미들</th>
            <th>마감</th>
            <th>야간</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(grouped).map(([date, dateShifts]) => (
            <tr key={date}>
              <th className="dateCell">
                {date.slice(5)}
                <small>{dateShifts[0]?.dayName}</small>
              </th>
              {periodColumns.map((key) => {
                const shift = dateShifts.find((item) => item.key === key);
                if (!shift) return <td key={key} />;
                const assistant = assistantsById[assignments[shift.id]];
                return (
                  <td key={shift.id}>
                    <button
                      type="button"
                      className={[
                        "shiftCard",
                        shift.id === selectedShiftId ? "selected" : "",
                        !assistant ? "unassigned" : ""
                      ].join(" ")}
                      onClick={() => onSelectShift(shift.id)}
                    >
                      <strong>{assistant?.short_name ?? "미배정"}</strong>
                      <small>{formatTime(shift.start)}-{formatTime(shift.end)} · {shift.creditHours}h</small>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PeriodLimitEditor({
  assistant,
  startDate,
  endDate,
  disabled,
  onChange
}: {
  assistant?: AssistantProfile;
  startDate: string;
  endDate: string;
  disabled: boolean;
  onChange: (assistant: AssistantProfile) => void;
}) {
  const [bulkText, setBulkText] = useState("");
  if (!assistant) return <section className="panelBlock"><div className="emptyBox">조교를 선택하세요.</div></section>;
  const activeAssistant = assistant;
  const rules = activeAssistant.unavailable_rules ?? [];
  const [from, to] = startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
  const periodRules = rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => rule.date >= from && rule.date <= to);

  function updateAssistant(updater: (draft: AssistantProfile) => void) {
    const next = structuredClone(activeAssistant);
    next.unavailable_rules ??= [];
    updater(next);
    onChange(next);
  }

  return (
    <section className="panelBlock">
      <div className="blockTitle">
        <h2>{activeAssistant.short_name} 제한 편집</h2>
        <button
          type="button"
          disabled={disabled}
          onClick={() => updateAssistant((draft) => {
            draft.unavailable_rules.push({ date: startDate, mode: "all", reason: "" });
          })}
        >
          추가
        </button>
      </div>

      <div className="quickInput periodQuickInput">
        <textarea
          disabled={disabled}
          value={bulkText}
          placeholder={"15-17 전체불가\n20 오픈 불가\n22 야간 불가"}
          onChange={(event) => setBulkText(event.target.value)}
        />
        <button
          type="button"
          disabled={disabled || !bulkText.trim()}
          onClick={() => {
            const parsed = parseBulkUnavailable(bulkText, startDate.slice(0, 7));
            if (!parsed.length) return;
            updateAssistant((draft) => {
              draft.unavailable_rules.push(...parsed);
            });
            setBulkText("");
          }}
        >
          빠른 입력 적용
        </button>
      </div>

      <div className="ruleRows periodRuleRows">
        {periodRules.map(({ rule, index }) => (
          <div key={`${rule.date}-${index}`} className="ruleRow periodRuleRow">
            <input disabled={disabled} type="date" value={rule.date} onChange={(event) => updateAssistant((draft) => {
              draft.unavailable_rules[index] = { ...draft.unavailable_rules[index], date: event.target.value };
            })} />
            <select disabled={disabled} value={ruleKind(rule)} onChange={(event) => updateAssistant((draft) => {
              draft.unavailable_rules[index] = buildRuleFromKind(draft.unavailable_rules[index], event.target.value);
            })}>
              <option value="all">전체 불가</option>
              <option value="block:open">오픈 불가</option>
              <option value="block:middle">미들 불가</option>
              <option value="block:close">마감 불가</option>
              <option value="block:night">야간 불가</option>
            </select>
            <input className="reasonInput" disabled={disabled} value={rule.reason ?? ""} placeholder="사유" onChange={(event) => updateAssistant((draft) => {
              draft.unavailable_rules[index] = { ...draft.unavailable_rules[index], reason: event.target.value };
            })} />
            <button type="button" disabled={disabled} aria-label="근무 제한 삭제" onClick={() => updateAssistant((draft) => {
              draft.unavailable_rules.splice(index, 1);
            })}>
              삭제
            </button>
          </div>
        ))}
        {!periodRules.length ? <div className="emptyBox">이 기간에 등록된 근무 제한이 없습니다.</div> : null}
      </div>
    </section>
  );
}

function PeriodInspector({
  shift,
  assistants,
  assignments,
  shifts,
  config,
  disabled,
  onAssign
}: {
  shift: ShiftInstance | null;
  assistants: AssistantProfile[];
  assignments: AssignmentMap;
  shifts: ShiftInstance[];
  config: SchedulerConfig;
  disabled: boolean;
  onAssign: (assistantId: string) => void;
}) {
  if (!shift) return <section className="panelBlock"><div className="emptyBox">근무 칸을 선택하세요.</div></section>;
  const assigned = assignments[shift.id];
  return (
    <section className="panelBlock">
      <div className="blockTitle">
        <h2>후보 조정</h2>
      </div>
      <div className="shiftInspector">
        <strong>{shift.date} {shift.name}</strong>
        <span>{formatTime(shift.start)}-{formatTime(shift.end)} · {shift.creditHours}h</span>
        <button type="button" disabled={disabled} className={assigned === UNASSIGNED_ID ? "candidate active" : "candidate"} onClick={() => onAssign(UNASSIGNED_ID)}>
          미배정
        </button>
        {assistants.map((assistant) => {
          const reason = blockedReason(assistant, shift, config);
          const sameDay = shifts.some((other) => other.id !== shift.id && other.date === shift.date && assignments[other.id] === assistant.id);
          const blocked = Boolean(reason || sameDay);
          return (
            <button
              type="button"
              key={assistant.id}
              disabled={disabled || blocked}
              className={assigned === assistant.id ? "candidate active" : "candidate"}
              onClick={() => onAssign(assistant.id)}
            >
              <span>{assistant.name}</span>
              <small>{blocked ? reason || "같은 날 배정" : "가능"}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function prepareConfigForMonth(config: SchedulerConfig, month: string): SchedulerConfig {
  const next = structuredClone(config);
  next.month = month;
  next.title = `${month} 기간 근무표`;
  next.rules.ignore_class_conflicts = true;
  next.rules.fairness_tolerance_hours = 0;
  next.rules.fairness_windows = [];
  next.assistants.forEach((assistant) => {
    assistant.unavailable_rules = (assistant.unavailable_rules ?? []).map((rule) => ({
      ...rule,
      date: remapDateToMonth(rule.date, month)
    }));
  });
  return next;
}

function remapDateToMonth(date: string, month: string) {
  const day = Number(date.split("-")[2] ?? 1);
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return `${month}-${String(Math.min(Math.max(day, 1), lastDay)).padStart(2, "0")}`;
}

function countUnavailableInRange(assistant: AssistantProfile, startDate: string, endDate: string) {
  const [from, to] = startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
  return (assistant.unavailable_rules ?? []).filter((rule) => rule.date >= from && rule.date <= to).length;
}

function ruleKind(rule: AvailabilityRule) {
  if (rule.mode === "all") return "all";
  const blocked = rule.unavailable_shifts?.[0];
  return blocked ? `block:${blocked}` : "all";
}

function buildRuleFromKind(rule: AvailabilityRule, kind: string): AvailabilityRule {
  if (kind === "all") {
    return { date: rule.date, mode: "all", reason: rule.reason };
  }
  const key = kind.replace("block:", "") as ShiftKey;
  return { date: rule.date, unavailable_shifts: [key], reason: rule.reason };
}

function parseBulkUnavailable(text: string, month: string): AvailabilityRule[] {
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

function isoDate(month: string, day: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  if (!year || !monthNumber || day < 1 || day > lastDay) return null;
  return `${month}-${String(day).padStart(2, "0")}`;
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

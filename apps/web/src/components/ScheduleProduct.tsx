"use client";

import { useMemo, useState } from "react";
import {
  blockedReason,
  formatTime,
  solveSchedule,
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
import type { ScheduleVersion } from "@/lib/schedule-store";

const shiftColumns = ["open", "middle", "close", "night"];
const shiftLabels: Record<string, string> = {
  open: "오픈",
  middle: "미들",
  close: "마감",
  night: "야간"
};
const dayLabels: Record<string, string> = {
  mon: "월",
  tue: "화",
  wed: "수",
  thu: "목",
  fri: "금"
};

interface ScheduleProductProps {
  initialConfig: SchedulerConfig;
  versions: ScheduleVersion[];
  initialUser: AppUser;
}

export function ScheduleProduct({ initialConfig, versions, initialUser }: ScheduleProductProps) {
  const [config, setConfig] = useState<SchedulerConfig>(initialConfig);
  const [attempts, setAttempts] = useState(2500);
  const [seed, setSeed] = useState(202606);
  const [selectedAssistantId, setSelectedAssistantId] = useState(initialConfig.assistants[0]?.id ?? "");
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [manualAssignments, setManualAssignments] = useState<AssignmentMap | null>(null);
  const [showGuide, setShowGuide] = useState(true);

  const solveResult = useMemo<SolveResult>(() => solveSchedule(config, { attempts, seed }), [config, attempts, seed]);
  const assignments = manualAssignments ?? solveResult.assignments;
  const summary = useMemo(() => summarize(config, assignments, solveResult.shifts), [assignments, config, solveResult.shifts]);
  const issues = useMemo(
    () => validate(config, assignments, solveResult.shifts, solveResult.candidates),
    [assignments, config, solveResult.candidates, solveResult.shifts]
  );

  const selectedAssistant = config.assistants.find((assistant) => assistant.id === selectedAssistantId);
  const selectedShift = solveResult.shifts.find((shift) => shift.id === selectedShiftId) ?? null;
  const managerMode = canManageSchedule(initialUser.role);
  const nightCounts = summary.assistantHours.map((assistant) => assistant.shiftTypes.night ?? 0);
  const nightRange = nightCounts.length ? Math.max(...nightCounts) - Math.min(...nightCounts) : 0;

  function regenerate() {
    setManualAssignments(null);
    setSelectedShiftId(null);
  }

  function patchConfig(updater: (draft: SchedulerConfig) => void) {
    setConfig((current) => {
      const next = structuredClone(current);
      updater(next);
      return next;
    });
    setManualAssignments(null);
  }

  function updateMonth(month: string) {
    patchConfig((draft) => {
      draft.month = month;
      draft.title = `${monthLabel(month)} 조교 근무표`;
      draft.assistants.forEach((assistant) => {
        assistant.unavailable_rules = (assistant.unavailable_rules ?? []).map((rule) => ({
          ...rule,
          date: remapDateToMonth(rule.date, month)
        }));
      });
    });
    const numericSeed = Number(month.replace("-", ""));
    if (!Number.isNaN(numericSeed)) setSeed(numericSeed);
  }

  function assignShift(assistantId: string) {
    if (!selectedShift) return;
    setManualAssignments((current) => ({
      ...(current ?? solveResult.assignments),
      [selectedShift.id]: assistantId
    }));
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ config, assignments }, null, 2)], { type: "application/json" });
    download(`${config.month.replace("-", "_")}_workspace.json`, blob);
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
    download(`${config.month.replace("-", "_")}_schedule.csv`, new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  }

  return (
    <main className="product-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">근무 담당자용 편성 화면</p>
          <h1>{monthLabel(config.month)} 근무표 워크프레임</h1>
        </div>
        <div className="topbarControls">
          <button type="button" onClick={() => setShowGuide((value) => !value)}>{showGuide ? "가이드 닫기" : "가이드 보기"}</button>
          <a className="buttonLink" href="/period">기간 편성</a>
          <button type="button" onClick={exportJson}>JSON</button>
          <button type="button" onClick={exportCsv}>CSV</button>
          <button type="button" className="primary" onClick={regenerate} disabled={!managerMode}>재생성</button>
        </div>
      </header>

      {showGuide ? (
        <section className="guideRail" aria-label="편성 가이드">
          <GuideBubble step="1" title="달과 기준을 먼저 고르세요" body="근무월을 바꾸면 기존 불가 날짜가 같은 일자로 이동합니다." />
          <GuideBubble step="2" title="조교별 불가 일정을 붙여넣으세요" body="예: 14-17 전체불가, 16 오픈 불가처럼 입력하고 적용합니다." />
          <GuideBubble step="3" title="표에서 칸을 눌러 마지막 조정" body="미배정이나 특정 날짜를 선택해 가능한 조교로 직접 바꿀 수 있습니다." />
        </section>
      ) : null}

      <section className="metrics">
        <Metric label="배정" value={`${summary.assignedShifts}/${summary.totalShifts}`} />
        <Metric label="시간 편차" value={`${summary.hourRange.toFixed(1)}h`} tone={summary.hourRange <= config.rules.fairness_tolerance_hours ? "ok" : "bad"} />
        <Metric label="야간 편차" value={`${nightRange}회`} tone={nightRange <= 1 ? "ok" : "bad"} />
        <Metric label="미배정" value={`${summary.unassignedShifts}`} tone={summary.unassignedShifts ? "bad" : "ok"} />
        <Metric label="검증" value={issues.length ? `${issues.length}건` : "통과"} tone={issues.length ? "bad" : "ok"} />
      </section>

      <section className="workspace">
        <aside className="panel leftPanel">
          <section className="panelBlock">
            <div className="blockTitle">
              <h2>생성 조건</h2>
            </div>
            <div className="formGrid">
              <label>
                <span>근무월</span>
                <input value={config.month} type="month" disabled={!managerMode} onChange={(event) => updateMonth(event.target.value)} />
              </label>
              <label>
                <span>편차 허용</span>
                <input value={config.rules.fairness_tolerance_hours} type="number" disabled={!managerMode} onChange={(event) => patchConfig((draft) => { draft.rules.fairness_tolerance_hours = Number(event.target.value); })} />
              </label>
              <label className="checkboxLabel">
                <span>수업 제외</span>
                <input checked={!config.rules.ignore_class_conflicts} type="checkbox" disabled={!managerMode} onChange={(event) => patchConfig((draft) => { draft.rules.ignore_class_conflicts = !event.target.checked; })} />
              </label>
              <label>
                <span>시도 횟수</span>
                <input value={attempts} type="number" disabled={!managerMode} onChange={(event) => setAttempts(Number(event.target.value))} />
              </label>
              <label>
                <span>시드</span>
                <input value={seed} type="number" disabled={!managerMode} onChange={(event) => setSeed(Number(event.target.value))} />
              </label>
            </div>
          </section>

          <section className="panelBlock">
            <div className="blockTitle">
              <h2>조교</h2>
              {managerMode ? <button type="button" onClick={() => addAssistant(patchConfig, setSelectedAssistantId)}>추가</button> : null}
            </div>
            <div className="assistantList">
              {config.assistants.map((assistant) => {
                const person = summary.assistantHours.find((item) => item.id === assistant.id);
                return (
                  <button
                    key={assistant.id}
                    type="button"
                    className={assistant.id === selectedAssistantId ? "assistantItem active" : "assistantItem"}
                    onClick={() => setSelectedAssistantId(assistant.id)}
                  >
                    <span>
                      <strong>{assistant.name}</strong>
                      <small>{assistant.short_name} · 야간 {person?.shiftTypes.night ?? 0}회</small>
                    </span>
                    <b>{person?.hours.toFixed(0) ?? 0}h</b>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="panelBlock">
            <div className="blockTitle">
              <h2>버전</h2>
            </div>
            <div className="versionList">
              {versions.map((version) => (
                <div key={version.id} className="versionItem">
                  <strong>{version.label}</strong>
                  <span>{version.createdBy}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>

        <section className="panel schedulePanel">
          <div className="scheduleHeader">
            <div>
              <h2>{config.month} 근무표</h2>
              <p>{issues[0] ?? "모든 하드 제약을 통과했습니다."}</p>
            </div>
            <span className={managerMode ? "rolePill manager" : "rolePill"}>담당자 모드</span>
          </div>
          <ScheduleTable
            shifts={solveResult.shifts}
            assignments={assignments}
            assistants={config.assistants}
            selectedShiftId={selectedShiftId}
            onSelectShift={setSelectedShiftId}
          />
        </section>

        <aside className="panel rightPanel">
          <AssistantEditor
            assistant={selectedAssistant}
            month={config.month}
            disabled={!managerMode}
            onChange={(assistant) => patchConfig((draft) => {
              const index = draft.assistants.findIndex((item) => item.id === assistant.id);
              if (index >= 0) draft.assistants[index] = assistant;
            })}
          />
          <ShiftInspector
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

      <FloatingDilemma />
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

function GuideBubble({ step, title, body }: { step: string; title: string; body: string }) {
  return (
    <article className="guideBubble">
      <b>{step}</b>
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
    </article>
  );
}

function FloatingDilemma() {
  return (
    <div className="floatingDilemma">
      <button type="button" className="floatingDilemmaButton" aria-describedby="floating-dilemma-copy">
        ?
      </button>
      <div id="floating-dilemma-copy" className="floatingDilemmaPopover" role="tooltip">
        <p>김정은이 만들어달라고 해서 만들었는데 배은망덕해서 지울까 고민중인데 어떻게 생각해? 지울까?</p>
        <div>
          <button type="button">Yes</button>
          <button type="button">No</button>
        </div>
      </div>
    </div>
  );
}

function ScheduleTable({
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
    <div className="tableScroller">
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
              {shiftColumns.map((key) => {
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

function AssistantEditor({
  assistant,
  month,
  disabled,
  onChange
}: {
  assistant?: AssistantProfile;
  month: string;
  disabled: boolean;
  onChange: (assistant: AssistantProfile) => void;
}) {
  const [bulkText, setBulkText] = useState("");
  if (!assistant) return <section className="panelBlock"><div className="emptyBox">조교를 선택하세요.</div></section>;
  const activeAssistant = assistant;

  const classRows = Object.entries(activeAssistant.classes).flatMap(([day, ranges]) =>
    (ranges ?? []).map((range, index) => ({ day, range, index }))
  );

  function updateAssistant(updater: (draft: AssistantProfile) => void) {
    const next = structuredClone(activeAssistant);
    updater(next);
    onChange(next);
  }

  return (
    <section className="panelBlock">
      <div className="blockTitle">
        <h2>조교 상세</h2>
      </div>
      <div className="editorStack">
        <div className="formGrid">
          <label>
            <span>이름</span>
            <input disabled={disabled} value={activeAssistant.name} onChange={(event) => updateAssistant((draft) => { draft.name = event.target.value; })} />
          </label>
          <label>
            <span>표시명</span>
            <input disabled={disabled} value={activeAssistant.short_name} onChange={(event) => updateAssistant((draft) => { draft.short_name = event.target.value; })} />
          </label>
        </div>
        <div className="miniTitle">
          <h3>수업 시간</h3>
          <button type="button" disabled={disabled} onClick={() => updateAssistant((draft) => {
            draft.classes.mon ??= [];
            draft.classes.mon.push(["09:00", "09:50"]);
          })}>추가</button>
        </div>
        <div className="miniRows">
          {classRows.map((row) => (
            <div key={`${row.day}-${row.index}`} className="miniRow">
              <select disabled={disabled} value={row.day} onChange={(event) => updateAssistant((draft) => moveClass(draft, row.day, row.index, event.target.value))}>
                {Object.entries(dayLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <input disabled={disabled} type="time" value={row.range[0]} onChange={(event) => updateAssistant((draft) => { draft.classes[row.day as keyof typeof draft.classes]![row.index][0] = event.target.value; })} />
              <input disabled={disabled} type="time" value={row.range[1]} onChange={(event) => updateAssistant((draft) => { draft.classes[row.day as keyof typeof draft.classes]![row.index][1] = event.target.value; })} />
            </div>
          ))}
        </div>
        <div className="miniTitle">
          <h3>근무 제한</h3>
          <button type="button" disabled={disabled} onClick={() => updateAssistant((draft) => {
            draft.unavailable_rules ??= [];
            draft.unavailable_rules.push({ date: `${month}-01`, mode: "all", reason: "" });
          })}>추가</button>
        </div>
        <div className="quickInput">
          <textarea
            disabled={disabled}
            value={bulkText}
            placeholder={"14-17 전체불가\n16 오픈 불가\n20 야간 불가"}
            onChange={(event) => setBulkText(event.target.value)}
          />
          <button
            type="button"
            disabled={disabled || !bulkText.trim()}
            onClick={() => {
              const rules = parseBulkUnavailable(bulkText, month);
              if (!rules.length) return;
              updateAssistant((draft) => {
                draft.unavailable_rules = [...(draft.unavailable_rules ?? []), ...rules];
              });
              setBulkText("");
            }}
          >
            빠른 입력 적용
          </button>
        </div>
        <div className="ruleRows">
          {(activeAssistant.unavailable_rules ?? []).map((rule, index) => (
            <div key={`${rule.date}-${index}`} className="ruleRow">
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
              <input disabled={disabled} value={rule.reason ?? ""} placeholder="사유" onChange={(event) => updateAssistant((draft) => {
                draft.unavailable_rules[index] = { ...draft.unavailable_rules[index], reason: event.target.value };
              })} />
              <button type="button" disabled={disabled} aria-label="근무 제한 삭제" onClick={() => updateAssistant((draft) => {
                draft.unavailable_rules.splice(index, 1);
              })}>삭제</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ShiftInspector({
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
        <h2>근무 조정</h2>
      </div>
      <div className="shiftInspector">
        <strong>{shift.date} {shift.name}</strong>
        <span>{formatTime(shift.start)}-{formatTime(shift.end)}</span>
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

function addAssistant(patchConfig: (updater: (draft: SchedulerConfig) => void) => void, setSelectedAssistantId: (id: string) => void) {
  const id = `assistant_${Date.now()}`;
  patchConfig((draft) => {
    draft.assistants.push({
      id,
      name: "새 조교",
      short_name: "신규",
      classes: {},
      unavailable_rules: []
    });
  });
  setSelectedAssistantId(id);
}

function moveClass(assistant: AssistantProfile, oldDay: string, index: number, newDay: string) {
  const oldRanges = assistant.classes[oldDay as keyof typeof assistant.classes] ?? [];
  const [range] = oldRanges.splice(index, 1);
  assistant.classes[newDay as keyof typeof assistant.classes] ??= [];
  assistant.classes[newDay as keyof typeof assistant.classes]!.push(range);
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return month;
  return `${year}년 ${monthNumber}월`;
}

function remapDateToMonth(date: string, month: string) {
  const day = Number(date.split("-")[2] ?? 1);
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return `${month}-${String(Math.min(Math.max(day, 1), lastDay)).padStart(2, "0")}`;
}

function isoDate(month: string, day: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  if (!year || !monthNumber || day < 1 || day > lastDay) return null;
  return `${month}-${String(day).padStart(2, "0")}`;
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

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

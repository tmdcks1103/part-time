"use client";

import { useMemo, useState } from "react";
import {
  blockedReason,
  formatTime,
  solveSchedule,
  summarize,
  UNASSIGNED_ID,
  validate,
  type AssistantProfile,
  type AssignmentMap,
  type SchedulerConfig,
  type ShiftInstance,
  type SolveResult
} from "@part-time/scheduler-core";
import { canManageSchedule, demoUsers, type AppUser, type UserRole } from "@/lib/auth";
import type { ScheduleVersion } from "@/lib/schedule-store";

const shiftColumns = ["open", "middle", "close", "night"];
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
  const [currentUser, setCurrentUser] = useState<AppUser>(initialUser);
  const [attempts, setAttempts] = useState(2500);
  const [seed, setSeed] = useState(202606);
  const [selectedAssistantId, setSelectedAssistantId] = useState(initialConfig.assistants[0]?.id ?? "");
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [manualAssignments, setManualAssignments] = useState<AssignmentMap | null>(null);

  const solveResult = useMemo<SolveResult>(() => solveSchedule(config, { attempts, seed }), [config, attempts, seed]);
  const assignments = manualAssignments ?? solveResult.assignments;
  const summary = useMemo(() => summarize(config, assignments, solveResult.shifts), [assignments, config, solveResult.shifts]);
  const issues = useMemo(
    () => validate(config, assignments, solveResult.shifts, solveResult.candidates),
    [assignments, config, solveResult.candidates, solveResult.shifts]
  );

  const selectedAssistant = config.assistants.find((assistant) => assistant.id === selectedAssistantId);
  const selectedShift = solveResult.shifts.find((shift) => shift.id === selectedShiftId) ?? null;
  const managerMode = canManageSchedule(currentUser.role);

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
          <p className="eyebrow">제2생활관 조교 근무 운영</p>
          <h1>월간 근무표 워크스페이스</h1>
        </div>
        <div className="topbarControls">
          <select
            aria-label="데모 사용자"
            value={currentUser.id}
            onChange={(event) => setCurrentUser(demoUsers.find((user) => user.id === event.target.value) ?? initialUser)}
          >
            {demoUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} · {roleLabel(user.role)}
              </option>
            ))}
          </select>
          <button type="button" onClick={exportJson}>JSON</button>
          <button type="button" onClick={exportCsv}>CSV</button>
          <button type="button" className="primary" onClick={regenerate} disabled={!managerMode}>재생성</button>
        </div>
      </header>

      <section className="metrics">
        <Metric label="배정" value={`${summary.assignedShifts}/${summary.totalShifts}`} />
        <Metric label="시간 편차" value={`${summary.hourRange.toFixed(1)}h`} tone={summary.hourRange <= config.rules.fairness_tolerance_hours ? "ok" : "bad"} />
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
                <input value={config.month} type="month" disabled={!managerMode} onChange={(event) => patchConfig((draft) => { draft.month = event.target.value; })} />
              </label>
              <label>
                <span>편차 허용</span>
                <input value={config.rules.fairness_tolerance_hours} type="number" disabled={!managerMode} onChange={(event) => patchConfig((draft) => { draft.rules.fairness_tolerance_hours = Number(event.target.value); })} />
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
                      <small>{assistant.short_name}</small>
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
            <span className={managerMode ? "rolePill manager" : "rolePill"}>{roleLabel(currentUser.role)}</span>
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
            disabled={!managerMode && currentUser.assistantId !== selectedAssistant?.id}
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
  disabled,
  onChange
}: {
  assistant?: AssistantProfile;
  disabled: boolean;
  onChange: (assistant: AssistantProfile) => void;
}) {
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
      </div>
    </section>
  );
}

function ShiftInspector({
  shift,
  assistants,
  assignments,
  shifts,
  disabled,
  onAssign
}: {
  shift: ShiftInstance | null;
  assistants: AssistantProfile[];
  assignments: AssignmentMap;
  shifts: ShiftInstance[];
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
          const reason = blockedReason(assistant, shift);
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

function roleLabel(role: UserRole) {
  return {
    admin: "관리자",
    scheduler: "담당자",
    assistant: "조교",
    viewer: "조회"
  }[role];
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

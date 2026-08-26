"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  formatTime,
  solveScheduleRange,
  summarize,
  validate,
  type AssistantProfile,
  type AssignmentMap,
  type SchedulerConfig,
  type SolveResult
} from "@part-time/scheduler-core";
import { canManageSchedule, type AppUser } from "@/lib/auth";
import { applyStoredRoster, loadLastPeriod, saveLastPeriod } from "@/lib/schedule-store";
import { countUnavailableInRange, download, parseBulkUnavailable, remapDateToMonth } from "@/lib/schedule-format";
import { useIdentity } from "@/lib/identity";
import {
  createVersion,
  formatRelativeTime,
  postActivity,
  useActivityFeed,
  useDraftSync,
  usePresence,
  useRosterSync,
  useVersionHistory,
  type DraftPayload
} from "@/lib/collab";
import { Metric } from "@/components/shared/Metric";
import { ShiftGrid } from "@/components/shared/ShiftGrid";
import { ShiftAssignmentPanel } from "@/components/shared/ShiftAssignmentPanel";
import { UnavailableRuleRow } from "@/components/shared/UnavailableRuleRow";
import { CollaboratorPanel, IdentityPicker } from "@/components/shared/CollaboratorPanel";

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

  const { identity, setIdentity } = useIdentity();
  const scopeKey = `period:${startDate}:${endDate}`;

  useEffect(() => {
    setConfig((current) => applyStoredRoster(current));
  }, []);

  // 새로고침해도 마지막으로 보던 기간으로 돌아오도록 복원한다. localStorage는 서버
  // 렌더링 시점엔 없으므로 최초 렌더는 항상 하드코딩된 기본 기간으로 시작하고(서버와
  // 동일해야 hydration 불일치가 없다), 마운트된 뒤 이 effect에서만 전환한다.
  useEffect(() => {
    const stored = loadLastPeriod();
    if (!stored || (stored.startDate === defaultStartDate && stored.endDate === defaultEndDate)) return;
    setStartDate(stored.startDate);
    setEndDate(stored.endDate);
    setConfig((current) => prepareConfigForMonth(current, stored.startDate.slice(0, 7)));
    const numericSeed = Number(stored.startDate.slice(0, 7).replace("-", ""));
    if (!Number.isNaN(numericSeed)) setSeed(numericSeed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveLastPeriod(startDate, endDate);
  }, [startDate, endDate]);

  const roster = useRosterSync(
    config.assistants,
    (assistants) => patchConfig((draft) => { draft.assistants = assistants; }),
    identity
  );
  const presence = usePresence("period", scopeKey, identity);
  const activity = useActivityFeed(20);
  const { versions, refresh: refreshVersions } = useVersionHistory(scopeKey);

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

  const draftPayload: DraftPayload = {
    settings: {
      attempts,
      seed,
      fairnessToleranceHours: config.rules.fairness_tolerance_hours,
      ignoreClassConflicts: config.rules.ignore_class_conflicts,
      startDate,
      endDate
    },
    manualAssignments: manualAssignments ?? {},
    summary: {
      assignedShifts: summary.assignedShifts,
      totalShifts: summary.totalShifts,
      unassignedShifts: summary.unassignedShifts,
      hourRange: summary.hourRange
    }
  };

  function applyDraftRemote(settings: Record<string, unknown>, remoteManualAssignments: AssignmentMap) {
    const typed = settings as {
      attempts?: number;
      seed?: number;
      fairnessToleranceHours?: number;
      ignoreClassConflicts?: boolean;
      startDate?: string;
      endDate?: string;
    };
    if (typeof typed.attempts === "number") setAttempts(typed.attempts);
    if (typeof typed.seed === "number") setSeed(typed.seed);
    if (typed.startDate) setStartDate(typed.startDate);
    if (typed.endDate) setEndDate(typed.endDate);
    patchConfig((next) => {
      if (typeof typed.fairnessToleranceHours === "number") next.rules.fairness_tolerance_hours = typed.fairnessToleranceHours;
      if (typeof typed.ignoreClassConflicts === "boolean") next.rules.ignore_class_conflicts = typed.ignoreClassConflicts;
    });
    setManualAssignments(Object.keys(remoteManualAssignments ?? {}).length ? remoteManualAssignments : null);
  }

  const draftSync = useDraftSync(scopeKey, "period", draftPayload, applyDraftRemote, identity);

  function saveVersion() {
    if (!identity) return;
    createVersion(scopeKey, "period", "수동 저장", draftPayload, identity).then(refreshVersions);
  }

  function loadVersion(version: { settings: Record<string, unknown>; manual_assignments: AssignmentMap; label: string; created_by: string }) {
    applyDraftRemote(version.settings, version.manual_assignments);
    if (identity) postActivity(identity, "이전 버전 불러오기", `${version.label} (${version.created_by})`, scopeKey);
  }

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
    if (identity) {
      postActivity(identity, "재생성", undefined, scopeKey);
      createVersion(scopeKey, "period", "재생성", { ...draftPayload, manualAssignments: {} }, identity).then(refreshVersions);
    }
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
          <IdentityPicker identity={identity} onChange={setIdentity} />
          <Link className="buttonLink" href="/">월간 편성</Link>
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
          <CollaboratorPanel
            online={presence.online}
            activity={activity}
            rosterStatus={roster.status}
            rosterUpdateAvailable={roster.updateAvailable}
            onReloadRoster={roster.reloadFromServer}
            draftStatus={draftSync.status}
            draftUpdateAvailable={draftSync.updateAvailable}
            onReloadDraft={draftSync.reloadFromServer}
            draftRemoteMeta={draftSync.remoteMeta}
            summary={summary}
            identityMissing={!identity}
          />

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
              {managerMode && (
                <button
                  type="button"
                  onClick={() => {
                    const id = `assistant_${Date.now()}`;
                    patchConfig((draft) => {
                      draft.assistants.push({ id, name: "새 조교", short_name: "신규", classes: {}, unavailable_rules: [] });
                    });
                    setSelectedAssistantId(id);
                    if (identity) postActivity(identity, "조교 추가");
                  }}
                >
                  + 추가
                </button>
              )}
            </div>
            <div className="periodRoster">
              {config.assistants.map((assistant) => {
                const person = summary.assistantHours.find((item) => item.id === assistant.id);
                const unavailableCount = countUnavailableInRange(assistant, startDate, endDate);
                const classCount = Object.values(assistant.classes ?? {}).reduce((sum, ranges) => sum + (ranges?.length ?? 0), 0);
                return (
                  <div
                    key={assistant.id}
                    className={assistant.id === selectedAssistantId ? "assistantItem periodPerson active" : "assistantItem periodPerson"}
                  >
                    <button
                      type="button"
                      className="assistantItemMain"
                      onClick={() => setSelectedAssistantId(assistant.id)}
                    >
                      <span>
                        <strong>{assistant.name}</strong>
                        <small>{unavailableCount}개 제한 · 수업 {classCount}개</small>
                      </span>
                      <b>{person?.hours.toFixed(0) ?? 0}h</b>
                    </button>
                    {managerMode && (
                      <button
                        type="button"
                        className="assistantItemDelete"
                        aria-label={`${assistant.name} 삭제`}
                        onClick={() => {
                          if (!window.confirm(`${assistant.name} 조교를 삭제할까요?`)) return;
                          patchConfig((draft) => {
                            draft.assistants = draft.assistants.filter((a) => a.id !== assistant.id);
                          });
                          if (selectedAssistantId === assistant.id) {
                            const remaining = config.assistants.filter((a) => a.id !== assistant.id);
                            setSelectedAssistantId(remaining[0]?.id ?? "");
                          }
                          if (identity) postActivity(identity, "조교 삭제", assistant.name);
                        }}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panelBlock">
            <div className="blockTitle">
              <h2>버전</h2>
              {managerMode ? <button type="button" disabled={!identity} onClick={saveVersion}>새 버전으로 저장</button> : null}
            </div>
            <div className="versionList">
              {versions.length ? (
                versions.map((version) => (
                  <div key={version.id} className="versionItem">
                    <div>
                      <strong>{version.label}</strong>
                      <span>{version.created_by} · {formatRelativeTime(version.created_at)}</span>
                    </div>
                    <button type="button" disabled={!managerMode} onClick={() => loadVersion(version)}>불러오기</button>
                  </div>
                ))
              ) : (
                <div className="emptyBox">아직 저장된 버전이 없습니다.</div>
              )}
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
          <ShiftGrid
            shifts={solveResult.shifts}
            assignments={assignments}
            assistants={config.assistants}
            selectedShiftId={selectedShiftId}
            onSelectShift={setSelectedShiftId}
            scrollerClassName="periodTableScroller"
          />
        </section>

        <aside className="panel periodInspectorPanel">
          <ShiftAssignmentPanel
            title="후보 조정"
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
  const [parseNotice, setParseNotice] = useState(false);
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

      <div className="quickInput periodQuickInput">
        <textarea
          disabled={disabled}
          value={bulkText}
          placeholder={"15-17 전체불가\n20 오픈 불가\n22 야간 불가"}
          onChange={(event) => {
            setBulkText(event.target.value);
            setParseNotice(false);
          }}
        />
        <button
          type="button"
          disabled={disabled || !bulkText.trim()}
          onClick={() => {
            const parsed = parseBulkUnavailable(bulkText, startDate.slice(0, 7));
            if (!parsed.length) {
              setParseNotice(true);
              return;
            }
            updateAssistant((draft) => {
              draft.unavailable_rules.push(...parsed);
            });
            setBulkText("");
            setParseNotice(false);
          }}
        >
          빠른 입력 적용
        </button>
        {parseNotice ? <small className="parseNotice">날짜를 인식하지 못했습니다. &quot;15-17 전체불가&quot;처럼 날짜를 포함해 입력해 주세요.</small> : null}
      </div>

      <div className="ruleRows periodRuleRows">
        {periodRules.map(({ rule, index }) => (
          <UnavailableRuleRow
            key={`${rule.date}-${index}`}
            rule={rule}
            disabled={disabled}
            compact
            onChange={(next) => updateAssistant((draft) => {
              draft.unavailable_rules[index] = next;
            })}
            onDelete={() => updateAssistant((draft) => {
              draft.unavailable_rules.splice(index, 1);
            })}
          />
        ))}
        {!periodRules.length ? <div className="emptyBox">이 기간에 등록된 근무 제한이 없습니다.</div> : null}
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

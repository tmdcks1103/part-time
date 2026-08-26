"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  formatTime,
  solveSchedule,
  summarize,
  validate,
  type AssistantProfile,
  type AssignmentMap,
  type SchedulerConfig,
  type SolveResult
} from "@part-time/scheduler-core";
import { canManageSchedule, type AppUser } from "@/lib/auth";
import { applyStoredRoster, type ScheduleVersion } from "@/lib/schedule-store";
import { dayLabels, download, monthLabel, parseBulkClasses, parseBulkUnavailable, remapDateToMonth } from "@/lib/schedule-format";
import { useIdentity, type Identity } from "@/lib/identity";
import { postActivity, useActivityFeed, useDraftPeek, useDraftSave, usePresence, useRosterSync } from "@/lib/collab";
import { Metric } from "@/components/shared/Metric";
import { ShiftGrid } from "@/components/shared/ShiftGrid";
import { ShiftAssignmentPanel } from "@/components/shared/ShiftAssignmentPanel";
import { UnavailableRuleRow } from "@/components/shared/UnavailableRuleRow";
import { CollaboratorPanel, IdentityPicker } from "@/components/shared/CollaboratorPanel";

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

  const { identity, setIdentity } = useIdentity();
  const scopeKey = `month:${config.month}`;

  useEffect(() => {
    setConfig((current) => applyStoredRoster(current));
  }, []);

  const roster = useRosterSync(
    config.assistants,
    (assistants) => patchConfig((draft) => { draft.assistants = assistants; }),
    identity
  );
  const presence = usePresence("month", scopeKey, identity);
  const activity = useActivityFeed(20);
  const { draft, loading: draftLoading } = useDraftPeek(scopeKey);
  const { status: draftSaveStatus, save: saveDraft } = useDraftSave(scopeKey, "month");

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
    if (identity) postActivity(identity, "재생성", undefined, scopeKey);
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
    if (identity) postActivity(identity, "근무월 변경", month, scopeKey);
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

  function handleSaveDraft() {
    if (!identity) return;
    saveDraft(
      {
        settings: {
          attempts,
          seed,
          fairnessToleranceHours: config.rules.fairness_tolerance_hours,
          ignoreClassConflicts: config.rules.ignore_class_conflicts
        },
        manualAssignments: assignments,
        summary: {
          assignedShifts: summary.assignedShifts,
          totalShifts: summary.totalShifts,
          unassignedShifts: summary.unassignedShifts,
          hourRange: summary.hourRange
        }
      },
      identity
    );
  }

  function handleLoadDraft() {
    if (!draft) return;
    const settings = draft.settings as { attempts?: number; seed?: number; fairnessToleranceHours?: number; ignoreClassConflicts?: boolean };
    if (typeof settings.attempts === "number") setAttempts(settings.attempts);
    if (typeof settings.seed === "number") setSeed(settings.seed);
    patchConfig((next) => {
      if (typeof settings.fairnessToleranceHours === "number") next.rules.fairness_tolerance_hours = settings.fairnessToleranceHours;
      if (typeof settings.ignoreClassConflicts === "boolean") next.rules.ignore_class_conflicts = settings.ignoreClassConflicts;
    });
    setManualAssignments(draft.manualAssignments);
    if (identity) postActivity(identity, "동료 버전 불러오기", `${draft.updatedBy}님 저장본`, scopeKey);
  }

  return (
    <main className="product-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">근무 담당자용 편성 화면</p>
          <h1>{monthLabel(config.month)} 근무표 워크프레임</h1>
        </div>
        <div className="topbarControls">
          <IdentityPicker identity={identity} onChange={setIdentity} />
          <button type="button" onClick={() => setShowGuide((value) => !value)}>{showGuide ? "가이드 닫기" : "가이드 보기"}</button>
          <Link className="buttonLink" href="/period">기간 편성</Link>
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
          <CollaboratorPanel
            online={presence.online}
            activity={activity}
            rosterStatus={roster.status}
            rosterUpdateAvailable={roster.updateAvailable}
            onReloadRoster={roster.reloadFromServer}
            draft={draft}
            draftLoading={draftLoading}
            draftStatus={draftSaveStatus}
            onSaveDraft={handleSaveDraft}
            onLoadDraft={handleLoadDraft}
            identityMissing={!identity}
          />

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
              {managerMode ? <button type="button" onClick={() => addAssistant(patchConfig, setSelectedAssistantId, identity)}>추가</button> : null}
            </div>
            <div className="assistantList">
              {config.assistants.map((assistant) => {
                const person = summary.assistantHours.find((item) => item.id === assistant.id);
                return (
                  <div
                    key={assistant.id}
                    className={assistant.id === selectedAssistantId ? "assistantItem active" : "assistantItem"}
                  >
                    <button type="button" className="assistantItemMain" onClick={() => setSelectedAssistantId(assistant.id)}>
                      <span>
                        <strong>{assistant.name}</strong>
                        <small>{assistant.short_name} · 야간 {person?.shiftTypes.night ?? 0}회</small>
                      </span>
                      <b>{person?.hours.toFixed(0) ?? 0}h</b>
                    </button>
                    {managerMode ? (
                      <button
                        type="button"
                        className="assistantItemDelete"
                        aria-label={`${assistant.name} 삭제`}
                        onClick={() => removeAssistant(patchConfig, assistant.id, selectedAssistantId, setSelectedAssistantId, config.assistants, identity)}
                      >
                        삭제
                      </button>
                    ) : null}
                  </div>
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
          <ShiftGrid
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
          <ShiftAssignmentPanel
            title="근무 조정"
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
  const [classBulkText, setClassBulkText] = useState("");
  const [ruleParseNotice, setRuleParseNotice] = useState(false);
  const [classParseNotice, setClassParseNotice] = useState(false);
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
              <button type="button" disabled={disabled} aria-label="수업 시간 삭제" onClick={() => updateAssistant((draft) => {
                draft.classes[row.day as keyof typeof draft.classes]!.splice(row.index, 1);
              })}>삭제</button>
            </div>
          ))}
        </div>
        <div className="quickInput">
          <textarea
            disabled={disabled}
            value={classBulkText}
            placeholder={"개강 후 새 시간표를 붙여넣으면 기존 수업 시간을 모두 교체합니다.\n월 09:00-10:15, 11:00-11:50\n화 13:00-14:15\n수 09:00-09:50"}
            onChange={(event) => {
              setClassBulkText(event.target.value);
              setClassParseNotice(false);
            }}
          />
          <button
            type="button"
            disabled={disabled || !classBulkText.trim()}
            onClick={() => {
              const classes = parseBulkClasses(classBulkText);
              if (!Object.keys(classes).length) {
                setClassParseNotice(true);
                return;
              }
              updateAssistant((draft) => {
                draft.classes = classes;
              });
              setClassBulkText("");
              setClassParseNotice(false);
            }}
          >
            시간표 붙여넣기 (기존 시간표 교체)
          </button>
          {classParseNotice ? <small className="parseNotice">요일과 시간을 인식하지 못했습니다. &quot;월 09:00-10:00&quot; 형식으로 입력해 주세요.</small> : null}
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
            onChange={(event) => {
              setBulkText(event.target.value);
              setRuleParseNotice(false);
            }}
          />
          <button
            type="button"
            disabled={disabled || !bulkText.trim()}
            onClick={() => {
              const rules = parseBulkUnavailable(bulkText, month);
              if (!rules.length) {
                setRuleParseNotice(true);
                return;
              }
              updateAssistant((draft) => {
                draft.unavailable_rules = [...(draft.unavailable_rules ?? []), ...rules];
              });
              setBulkText("");
              setRuleParseNotice(false);
            }}
          >
            빠른 입력 적용
          </button>
          {ruleParseNotice ? <small className="parseNotice">날짜를 인식하지 못했습니다. &quot;14-17 전체불가&quot;처럼 날짜를 포함해 입력해 주세요.</small> : null}
        </div>
        <div className="ruleRows">
          {(activeAssistant.unavailable_rules ?? []).map((rule, index) => (
            <UnavailableRuleRow
              key={`${rule.date}-${index}`}
              rule={rule}
              disabled={disabled}
              onChange={(next) => updateAssistant((draft) => {
                draft.unavailable_rules[index] = next;
              })}
              onDelete={() => updateAssistant((draft) => {
                draft.unavailable_rules.splice(index, 1);
              })}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function addAssistant(
  patchConfig: (updater: (draft: SchedulerConfig) => void) => void,
  setSelectedAssistantId: (id: string) => void,
  identity: Identity | null
) {
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
  if (identity) postActivity(identity, "조교 추가");
}

function removeAssistant(
  patchConfig: (updater: (draft: SchedulerConfig) => void) => void,
  id: string,
  selectedAssistantId: string,
  setSelectedAssistantId: (id: string) => void,
  assistants: AssistantProfile[],
  identity: Identity | null
) {
  const assistant = assistants.find((item) => item.id === id);
  if (!assistant) return;
  if (!window.confirm(`${assistant.name} 조교를 삭제할까요?`)) return;
  patchConfig((draft) => {
    draft.assistants = draft.assistants.filter((item) => item.id !== id);
  });
  if (selectedAssistantId === id) {
    const next = assistants.find((item) => item.id !== id);
    setSelectedAssistantId(next?.id ?? "");
  }
  if (identity) postActivity(identity, "조교 삭제", assistant.name);
}

function moveClass(assistant: AssistantProfile, oldDay: string, index: number, newDay: string) {
  const oldRanges = assistant.classes[oldDay as keyof typeof assistant.classes] ?? [];
  const [range] = oldRanges.splice(index, 1);
  assistant.classes[newDay as keyof typeof assistant.classes] ??= [];
  assistant.classes[newDay as keyof typeof assistant.classes]!.push(range);
}

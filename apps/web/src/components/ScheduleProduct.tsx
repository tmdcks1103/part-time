"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  formatTime,
  summarize,
  validate,
  type AssignmentMap,
  type SchedulerConfig,
} from "@part-time/scheduler-core";
import { canManageSchedule, type AppUser } from "@/lib/auth";
import {
  applyStoredRoster,
  loadLastMonth,
  loadLastPeriod,
  saveLastMonth,
  saveLastPeriod,
} from "@/lib/schedule-store";
import { download, monthLabel, remapConfigMonth } from "@/lib/schedule-format";
import { useIdentity } from "@/lib/identity";
import {
  createVersion,
  formatRelativeTime,
  useDraftSync,
  useRosterSync,
  useVersionHistory,
  type DraftPayload,
} from "@/lib/collab";
import { useScheduleSolver } from "@/lib/use-schedule-solver";
import { Metric } from "./shared/Metric";
import { ShiftGrid } from "./shared/ShiftGrid";
import { ShiftAssignmentPanel } from "./shared/ShiftAssignmentPanel";
import { AssistantEditor } from "./shared/AssistantEditor";
import {
  IdentityPicker,
  SyncNotice,
  CollaborationDetails,
} from "./shared/CollaboratorPanel";

interface ScheduleProductProps {
  initialConfig: SchedulerConfig;
  initialUser: AppUser;
  mode?: "month" | "period";
}
const DEFAULT_ATTEMPTS = 500;

export function ScheduleProduct({
  initialConfig,
  initialUser,
  mode = "month",
}: ScheduleProductProps) {
  const [config, setConfig] = useState(initialConfig);
  const [startDate, setStartDate] = useState(`${initialConfig.month}-01`);
  const [endDate, setEndDate] = useState(`${initialConfig.month}-15`);
  const [attempts, setAttempts] = useState(DEFAULT_ATTEMPTS);
  const [seed, setSeed] = useState(
    Number(initialConfig.month.replace("-", "")),
  );
  const [selectedAssistantId, setSelectedAssistantId] = useState(
    initialConfig.assistants[0]?.id ?? "",
  );
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [manualAssignments, setManualAssignments] = useState<AssignmentMap>({});
  const [notice, setNotice] = useState("");
  const [editorMonth, setEditorMonth] = useState(initialConfig.month);
  const [booted, setBooted] = useState(false);
  const { identity, setIdentity } = useIdentity();
  const scopeKey =
    mode === "month"
      ? `month:${config.month}`
      : `period:${startDate}:${endDate}`;

  useEffect(() => {
    const storedPeriod = loadLastPeriod();
    const month =
      mode === "month"
        ? (loadLastMonth() ?? initialConfig.month)
        : (storedPeriod?.startDate.slice(0, 7) ?? initialConfig.month);
    setConfig((current) => remapConfigMonth(applyStoredRoster(current), month));
    setEditorMonth(month);
    setSeed(Number(month.replace("-", "")));
    if (mode === "period" && storedPeriod) {
      setStartDate(storedPeriod.startDate);
      setEndDate(storedPeriod.endDate);
    }
    setBooted(true);
  }, [initialConfig.month, mode]);

  const roster = useRosterSync(
    config.assistants,
    (assistants) => setConfig((current) => ({ ...current, assistants })),
    identity,
  );
  const draftPayload: DraftPayload = {
    settings: {
      attempts,
      seed,
      fairnessToleranceHours: config.rules.fairness_tolerance_hours,
      ignoreClassConflicts: config.rules.ignore_class_conflicts ?? false,
    },
    manualAssignments,
    summary: {},
  };
  function applyDraft(
    settings: Record<string, unknown>,
    assignments: AssignmentMap,
  ) {
    setAttempts(
      typeof settings.attempts === "number"
        ? Math.max(1, Math.min(10000, settings.attempts))
        : DEFAULT_ATTEMPTS,
    );
    setSeed(
      typeof settings.seed === "number"
        ? settings.seed
        : Number(config.month.replace("-", "")),
    );
    setConfig((current) => ({
      ...current,
      rules: {
        ...current.rules,
        fairness_tolerance_hours:
          typeof settings.fairnessToleranceHours === "number"
            ? settings.fairnessToleranceHours
            : initialConfig.rules.fairness_tolerance_hours,
        ignore_class_conflicts: settings.ignoreClassConflicts === true,
      },
    }));
    setManualAssignments(assignments ?? {});
  }
  const draftSync = useDraftSync(
    scopeKey,
    mode,
    draftPayload,
    applyDraft,
    identity,
  );
  const { versions, refresh: refreshVersions } = useVersionHistory(scopeKey);
  const ready = booted && roster.ready && draftSync.ready;
  const managerMode = canManageSchedule(initialUser.role) && ready;
  const unreviewed = config.assistants.filter(
    (a) => a.classes_revision !== 1,
  ).length;
  const needsClasses = unreviewed > 0 && !config.rules.ignore_class_conflicts;
  const solver = useScheduleSolver(
    config,
    attempts,
    seed,
    ready && !needsClasses,
    mode === "period" ? startDate : undefined,
    mode === "period" ? endDate : undefined,
  );
  const solveResult = solver.result;
  // Persist only deliberate edits; generated previews are deterministic from the saved inputs.
  const assignments = useMemo(
    () => ({ ...solveResult.assignments, ...manualAssignments }),
    [solveResult.assignments, manualAssignments],
  );
  const summary = useMemo(
    () => summarize(config, assignments, solveResult.shifts),
    [config, assignments, solveResult.shifts],
  );
  const issues = useMemo(
    () =>
      validate(config, assignments, solveResult.shifts, solveResult.candidates),
    [config, assignments, solveResult],
  );
  const selectedAssistant =
    config.assistants.find((a) => a.id === selectedAssistantId) ??
    config.assistants[0];
  const selectedShift =
    solveResult.shifts.find((s) => s.id === selectedShiftId) ?? null;
  const busy = !ready || solver.calculating;
  const previewPending = busy || needsClasses;
  const months = useMemo(() => {
    const from = mode === "period" ? startDate.slice(0, 7) : config.month;
    const to = mode === "period" ? endDate.slice(0, 7) : config.month;
    const result: string[] = [];
    let cursor = from;
    while (cursor <= to && result.length < 24) {
      result.push(cursor);
      const year = Number(cursor.slice(0, 4)),
        month = Number(cursor.slice(5));
      cursor =
        month === 12
          ? `${year + 1}-01`
          : `${year}-${String(month + 1).padStart(2, "0")}`;
    }
    return result;
  }, [mode, config.month, startDate, endDate]);
  const activeEditorMonth = months.includes(editorMonth)
    ? editorMonth
    : (months[0] ?? config.month);

  function changeScope(month: string, from?: string, to?: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
    setConfig((current) => ({
      ...remapConfigMonth(current, month),
      rules: { ...initialConfig.rules },
    }));
    setEditorMonth(month);
    setAttempts(DEFAULT_ATTEMPTS);
    setSeed(Number(month.replace("-", "")));
    setManualAssignments({});
    setSelectedShiftId(null);
    setNotice("");
    if (mode === "month") saveLastMonth(month);
    else if (from && to) {
      setStartDate(from);
      setEndDate(to);
      saveLastPeriod(from, to);
    }
  }
  function stepMonth(offset: number) {
    const date = new Date(
      Number(config.month.slice(0, 4)),
      Number(config.month.slice(5)) - 1 + offset,
      1,
    );
    changeScope(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  function exportJson() {
    download(
      `${scopeKey.replaceAll(":", "_")}.json`,
      new Blob(
        [JSON.stringify({ config, startDate, endDate, assignments }, null, 2)],
        { type: "application/json" },
      ),
    );
  }
  function exportCsv() {
    const people = new Map(config.assistants.map((a) => [a.id, a.name]));
    const rows = [
      ["날짜", "요일", "근무", "시작", "종료", "인정 시간", "조교"],
      ...solveResult.shifts.map((s) => [
        s.date,
        s.dayName,
        s.name,
        formatTime(s.start),
        formatTime(s.end),
        s.creditHours,
        people.get(assignments[s.id]) ?? "미배정",
      ]),
    ];
    const csv = rows
      .map((row) =>
        row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    download(
      `${config.month}_근무표.csv`,
      new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
    );
  }
  async function saveVersion() {
    if (!identity) return;
    const ok = await createVersion(
      scopeKey,
      mode,
      "수동 저장",
      {
        ...draftPayload,
        manualAssignments: assignments,
        summary: {
          hourRange: summary.hourRange,
          assignedShifts: summary.assignedShifts,
        },
      },
      identity,
    );
    setNotice(
      ok
        ? "현재 근무표를 버전으로 저장했습니다."
        : "버전을 저장하지 못했습니다. 연결 상태를 확인해 주세요.",
    );
    if (ok) refreshVersions();
  }

  return (
    <main className="product-shell">
      <header className="topbar">
        <div className="brandLockup">
          <div className="brandMark" aria-hidden="true">
            ▦
          </div>
          <div>
            <p className="eyebrow">제2생활관</p>
            <h1>조교 근무표</h1>
          </div>
        </div>
        <nav className="viewNav" aria-label="편성 화면">
          <Link aria-current={mode === "month" ? "page" : undefined} href="/">
            월간 편성
          </Link>
          <Link
            aria-current={mode === "period" ? "page" : undefined}
            href="/period"
          >
            기간 편성
          </Link>
        </nav>
        <IdentityPicker identity={identity} onChange={setIdentity} />
      </header>
      <section className="monthToolbar" aria-label="근무 기간 및 작업">
        <div className="monthSwitcher">
          {mode === "month" ? (
            <>
              <button
                aria-label="이전 달"
                disabled={!managerMode}
                onClick={() => stepMonth(-1)}
              >
                ‹
              </button>
              <label>
                <span className="srOnly">근무월</span>
                <input
                  type="month"
                  value={config.month}
                  disabled={!managerMode}
                  onChange={(e) => changeScope(e.target.value)}
                />
              </label>
              <button
                aria-label="다음 달"
                disabled={!managerMode}
                onClick={() => stepMonth(1)}
              >
                ›
              </button>
            </>
          ) : (
            <>
              <label>
                <span>시작일</span>
                <input
                  type="date"
                  value={startDate}
                  max={endDate}
                  disabled={!managerMode}
                  onChange={(e) => {
                    const date = e.target.value;
                    if (
                      date &&
                      date <= endDate &&
                      Number(new Date(endDate)) - Number(new Date(date)) <=
                        366 * 86400000
                    )
                      changeScope(date.slice(0, 7), date, endDate);
                  }}
                />
              </label>
              <span>—</span>
              <label>
                <span>종료일</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  disabled={!managerMode}
                  onChange={(e) => {
                    const date = e.target.value;
                    if (
                      date &&
                      date >= startDate &&
                      Number(new Date(date)) - Number(new Date(startDate)) <=
                        366 * 86400000
                    )
                      changeScope(startDate.slice(0, 7), startDate, date);
                  }}
                />
              </label>
            </>
          )}
        </div>
        <div className="topbarControls">
          <button
            disabled={previewPending || Boolean(solver.error)}
            onClick={exportCsv}
          >
            CSV 내보내기
          </button>
          <button
            className="primary"
            disabled={
              !managerMode || previewPending || !config.assistants.length
            }
            onClick={() => {
              if (
                Object.keys(manualAssignments).length &&
                !window.confirm("수동 배정을 해제하고 다시 자동 배정할까요?")
              )
                return;
              setManualAssignments({});
              setSeed((n) => n + 1);
              setSelectedShiftId(null);
            }}
          >
            {busy ? "준비 중…" : "다시 자동 배정"}
          </button>
        </div>
      </section>
      <div className="syncStrip">
        <SyncNotice label="조교·일정" sync={roster} />
        <SyncNotice label="근무표" sync={draftSync} />
        {!identity ? (
          <span>이름을 선택하면 서버에 자동 저장됩니다.</span>
        ) : null}
      </div>
      {ready && unreviewed > 0 && !config.rules.ignore_class_conflicts ? (
        <div className="reviewBanner">
          <strong>
            수업 시간 확인 {config.assistants.length - unreviewed}/
            {config.assistants.length}명
          </strong>
          <span>
            각 조교의 ‘고정 수업 시간’을 입력해 주세요. 수업이 없으면 ‘수업 없음
            확인’을 눌러 주세요. 모두 확인하면 자동 배정됩니다.
          </span>
        </div>
      ) : null}
      {notice ? (
        <p className="inputNotice" role="status">
          {notice}
        </p>
      ) : null}
      <section className="metrics" aria-label="배정 현황" aria-busy={busy}>
        <Metric
          label="배정 완료"
          value={
            previewPending
              ? "—"
              : `${summary.assignedShifts} / ${summary.totalShifts}`
          }
        />
        <Metric
          label="시간 편차"
          value={previewPending ? "—" : `${summary.hourRange.toFixed(1)}h`}
          tone={
            !previewPending &&
            summary.hourRange > config.rules.fairness_tolerance_hours
              ? "bad"
              : "ok"
          }
        />
        <Metric
          label="미배정"
          value={previewPending ? "—" : `${summary.unassignedShifts}칸`}
          tone={!previewPending && summary.unassignedShifts ? "bad" : "ok"}
        />
        <Metric label="등록 조교" value={`${config.assistants.length}명`} />
      </section>
      <div className="workspace">
        <aside className="panel leftPanel">
          <section className="panelBlock">
            <div className="blockTitle">
              <h2>
                조교{" "}
                <span className="countBadge">{config.assistants.length}</span>
              </h2>
              <button
                className="subtleButton"
                disabled={!managerMode}
                onClick={() => {
                  const id = `assistant_${crypto.randomUUID()}`;
                  setConfig((c) => ({
                    ...c,
                    assistants: [
                      ...c.assistants,
                      {
                        id,
                        name: "새 조교",
                        short_name: "신규",
                        classes: {},
                        classes_revision: 0,
                        unavailable_rules: [],
                      },
                    ],
                  }));
                  setSelectedAssistantId(id);
                  setSelectedShiftId(null);
                }}
              >
                + 추가
              </button>
            </div>
            <div className="assistantList">
              {config.assistants.map((a) => {
                const person = summary.assistantHours.find(
                  (p) => p.id === a.id,
                );
                const dates = a.unavailable_rules.filter((r) =>
                  r.date.startsWith(`${activeEditorMonth}-`),
                ).length;
                return (
                  <div
                    key={a.id}
                    className={`assistantItem ${a.id === selectedAssistant?.id && !selectedShift ? "active" : ""}`}
                  >
                    <button
                      className="assistantItemMain"
                      aria-pressed={
                        a.id === selectedAssistant?.id && !selectedShift
                      }
                      onClick={() => {
                        setSelectedAssistantId(a.id);
                        setSelectedShiftId(null);
                      }}
                    >
                      <span>
                        <strong>{a.name || "새 조교"}</strong>
                        <small>
                          {a.classes_revision !== 1
                            ? "수업 확인 필요"
                            : `불가 ${dates}일 · 야간 ${person?.shiftTypes.night ?? 0}회`}
                        </small>
                      </span>
                      <b>{previewPending ? "—" : `${person?.hours ?? 0}h`}</b>
                    </button>
                  </div>
                );
              })}
              {!config.assistants.length ? (
                <div className="emptyBox">조교를 추가해 시작하세요.</div>
              ) : null}
            </div>
          </section>
          <details className="panelBlock settingsDetails">
            <summary>배정 설정</summary>
            <div className="editorStack">
              <label>
                <span>시간 편차 허용 (시간)</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={config.rules.fairness_tolerance_hours}
                  disabled={!managerMode}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      rules: {
                        ...c.rules,
                        fairness_tolerance_hours: Math.max(
                          0,
                          Number(e.target.value),
                        ),
                      },
                    }))
                  }
                />
              </label>
              <label className="toggleLabel">
                <input
                  type="checkbox"
                  checked={!config.rules.ignore_class_conflicts}
                  disabled={!managerMode}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      rules: {
                        ...c.rules,
                        ignore_class_conflicts: !e.target.checked,
                      },
                    }))
                  }
                />
                <span>수업 시간 반영</span>
              </label>
              {config.rules.ignore_class_conflicts ? (
                <p className="mutedNote">방학 모드 · 수업 제약을 제외합니다.</p>
              ) : null}
              <details>
                <summary>고급 계산 옵션</summary>
                <div className="editorStack">
                  <label>
                    <span>탐색 횟수 (1~10,000)</span>
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      value={attempts}
                      disabled={!managerMode}
                      onChange={(e) =>
                        setAttempts(
                          Math.min(10000, Math.max(1, Number(e.target.value))),
                        )
                      }
                    />
                  </label>
                  <label>
                    <span>생성 시드</span>
                    <input
                      type="number"
                      value={seed}
                      disabled={!managerMode}
                      onChange={(e) => setSeed(Number(e.target.value))}
                    />
                  </label>
                </div>
              </details>
            </div>
          </details>
          <details className="panelBlock">
            <summary>
              저장한 버전 <span className="countBadge">{versions.length}</span>
            </summary>
            <div className="editorStack">
              <button
                disabled={!identity || previewPending || Boolean(solver.error)}
                onClick={saveVersion}
              >
                현재 근무표 저장
              </button>
              {versions.map((v) => (
                <div key={v.id} className="versionItem">
                  <div>
                    <strong>{v.label}</strong>
                    <small>
                      {v.created_by} · {formatRelativeTime(v.created_at)}
                    </small>
                  </div>
                  <button
                    disabled={!managerMode}
                    onClick={() => {
                      applyDraft(v.settings, v.manual_assignments);
                      setNotice(
                        "저장한 배정을 불러왔습니다. 현재 일정과 충돌하는 칸은 확인이 필요합니다.",
                      );
                    }}
                  >
                    불러오기
                  </button>
                </div>
              ))}
              <button disabled={busy} onClick={exportJson}>
                전체 데이터 내보내기
              </button>
            </div>
          </details>
          <CollaborationDetails
            scopeKey={scopeKey}
            mode={mode}
            identity={identity}
          />
        </aside>
        <section className="panel schedulePanel" aria-busy={busy}>
          <div className="scheduleHeader">
            <div>
              <h2>
                {mode === "month" ? monthLabel(config.month) : "선택 기간"}{" "}
                근무표
              </h2>
              <p>근무 칸을 선택하면 배정을 조정할 수 있습니다.</p>
            </div>
            <span className="rolePill">평일 주간 1회 · 야간·주말 중복 가능</span>
          </div>
          {busy ? (
            <div className="loadingState" role="status">
              <span className="loadingDot" />
              {!ready
                ? "저장된 일정을 불러오는 중…"
                : "균형 있는 근무표를 계산하는 중…"}
            </div>
          ) : needsClasses ? (
            <div className="setupState">
              <strong>수업 시간 입력을 기다리고 있어요</strong>
              <p>
                {unreviewed}명의 수업 시간을 확인하면 균형 있는 근무표를 만들 수
                있습니다.
              </p>
              <button
                onClick={() => {
                  setSelectedAssistantId(
                    config.assistants.find((a) => a.classes_revision !== 1)!.id,
                  );
                  setSelectedShiftId(null);
                }}
              >
                미확인 조교 선택
              </button>
            </div>
          ) : solver.error ? (
            <div className="emptyBox" role="alert">
              {solver.error}
            </div>
          ) : (
            <ShiftGrid
              shifts={solveResult.shifts}
              assignments={assignments}
              assistants={config.assistants}
              selectedShiftId={selectedShiftId}
              onSelectShift={setSelectedShiftId}
            />
          )}
          {!previewPending && !solver.error && issues.length ? (
            <details className="validationDetails">
              <summary>확인이 필요한 항목 {issues.length}건</summary>
              <ul>
                {issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
        <aside className="panel rightPanel">
          {selectedShift ? (
            <>
              <div className="panelBlock inspectorBack">
                <button onClick={() => setSelectedShiftId(null)}>
                  ← 조교 일정으로
                </button>
              </div>
              <ShiftAssignmentPanel
                title="근무 배정 조정"
                shift={selectedShift}
                assistants={config.assistants}
                assignments={assignments}
                shifts={solveResult.shifts}
                config={config}
                disabled={!managerMode || previewPending}
                onAssign={(id) =>
                  setManualAssignments((current) => ({
                    ...current,
                    [selectedShift.id]: id,
                  }))
                }
              />
            </>
          ) : selectedAssistant ? (
            <>
              {mode === "period" && months.length > 1 ? (
                <label className="editorMonthLabel">
                  <span>근무 불가 입력 월</span>
                  <select
                    value={activeEditorMonth}
                    onChange={(e) => setEditorMonth(e.target.value)}
                  >
                    {months.map((month) => (
                      <option value={month} key={month}>
                        {monthLabel(month)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <AssistantEditor
                key={`${selectedAssistant.id}:${activeEditorMonth}`}
                assistant={selectedAssistant}
                month={activeEditorMonth}
                disabled={!managerMode}
                onChange={(assistant) =>
                  setConfig((c) => ({
                    ...c,
                    assistants: c.assistants.map((a) =>
                      a.id === assistant.id ? assistant : a,
                    ),
                  }))
                }
              />
              <div className="editorFooter">
                <button
                  className="textDanger"
                  disabled={!managerMode}
                  onClick={() => {
                    if (
                      window.confirm(
                        `${selectedAssistant.name} 조교를 명단에서 삭제할까요?`,
                      )
                    )
                      setConfig((c) => ({
                        ...c,
                        assistants: c.assistants.filter(
                          (a) => a.id !== selectedAssistant.id,
                        ),
                      }));
                  }}
                >
                  이 조교 삭제
                </button>
              </div>
            </>
          ) : (
            <div className="panelBlock emptyBox">
              왼쪽에서 조교를 추가해 주세요.
            </div>
          )}
        </aside>
      </div>
      <footer className="appFooter">
        <span>월별 개인 일정 · 고정 수업 시간 · 자동 저장</span>
        <span>
          {!previewPending && solver.durationMs !== undefined
            ? `계산 ${(solver.durationMs / 1000).toFixed(2)}초`
            : ""}
        </span>
      </footer>
    </main>
  );
}

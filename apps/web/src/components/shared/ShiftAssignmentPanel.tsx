import {
  blockedReason,
  formatTime,
  UNASSIGNED_ID,
  type AssignmentMap,
  type AssistantProfile,
  type SchedulerConfig,
  type ShiftInstance
} from "@part-time/scheduler-core";

export function ShiftAssignmentPanel({
  title,
  shift,
  assistants,
  assignments,
  shifts,
  config,
  disabled,
  onAssign
}: {
  title: string;
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
        <h2>{title}</h2>
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

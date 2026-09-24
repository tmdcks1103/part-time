import { memo, useMemo } from "react";
import {
  formatTime,
  type AssignmentMap,
  type AssistantProfile,
  type ShiftInstance,
} from "@part-time/scheduler-core";

const shiftColumns = ["open", "middle", "close", "night"];

export const ShiftGrid = memo(function ShiftGrid({
  shifts,
  assignments,
  assistants,
  selectedShiftId,
  onSelectShift,
  scrollerClassName,
}: {
  shifts: ShiftInstance[];
  assignments: AssignmentMap;
  assistants: AssistantProfile[];
  selectedShiftId: string | null;
  onSelectShift: (id: string) => void;
  scrollerClassName?: string;
}) {
  const assistantsById = useMemo(
    () =>
      Object.fromEntries(
        assistants.map((assistant) => [assistant.id, assistant]),
      ),
    [assistants],
  );
  const grouped = useMemo(
    () =>
      shifts.reduce<Record<string, ShiftInstance[]>>((acc, shift) => {
        acc[shift.date] ??= [];
        acc[shift.date].push(shift);
        return acc;
      }, {}),
    [shifts],
  );

  return (
    <div
      className={
        scrollerClassName
          ? `tableScroller ${scrollerClassName}`
          : "tableScroller"
      }
    >
      <table className="scheduleTable">
        <caption>날짜별 조교 근무 배정</caption>
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
            <tr
              key={date}
              className={
                dateShifts[0]?.dayKind === "weekend" ? "weekend" : undefined
              }
            >
              <th className="dateCell">
                {Number(date.slice(8))}
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
                        !assistant ? "unassigned" : "",
                      ].join(" ")}
                      aria-pressed={shift.id === selectedShiftId}
                      aria-label={`${date} ${shift.name} · ${assistant?.name ?? "미배정"}`}
                      onClick={() => onSelectShift(shift.id)}
                    >
                      <strong>{assistant?.short_name ?? "미배정"}</strong>
                      <small>
                        {formatTime(shift.start)}-{formatTime(shift.end)} ·{" "}
                        {shift.creditHours}h
                      </small>
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
});

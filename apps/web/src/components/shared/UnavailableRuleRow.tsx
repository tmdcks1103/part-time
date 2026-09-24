import type { AvailabilityRule } from "@part-time/scheduler-core";
import {
  buildRuleFromKind,
  ruleKind,
  shiftLabels,
} from "@/lib/schedule-format";

export function UnavailableRuleRow({
  rule,
  disabled,
  minDate,
  maxDate,
  onChange,
  onDelete,
}: {
  rule: AvailabilityRule;
  disabled: boolean;
  minDate?: string;
  maxDate?: string;
  onChange: (next: AvailabilityRule) => void;
  onDelete: () => void;
}) {
  const kind = ruleKind(rule);
  return (
    <div className="ruleRow">
      <input
        aria-label="근무 불가 날짜"
        disabled={disabled}
        type="date"
        min={minDate}
        max={maxDate}
        value={rule.date}
        onChange={(e) => {
          const date = e.target.value;
          if (
            date &&
            (!minDate || date >= minDate) &&
            (!maxDate || date <= maxDate)
          )
            onChange({ ...rule, date });
        }}
      />
      <select
        aria-label="근무 불가 유형"
        disabled={disabled}
        value={kind}
        onChange={(e) => onChange(buildRuleFromKind(rule, e.target.value))}
      >
        <option value="all">하루 전체 불가</option>
        {Object.entries(shiftLabels).map(([key, label]) => (
          <option key={`block:${key}`} value={`block:${key}`}>
            {label} 불가
          </option>
        ))}
        {Object.entries(shiftLabels).map(([key, label]) => (
          <option key={`only:${key}`} value={`only:${key}`}>
            {label}만 가능
          </option>
        ))}
        {kind.includes(",") ? (
          <option value={kind}>
            {(rule.only_shifts ?? rule.unavailable_shifts ?? [])
              .map((k) => shiftLabels[k] ?? k)
              .join("·")}
            {rule.only_shifts ? "만 가능" : " 불가"}
          </option>
        ) : null}
      </select>
      <input
        aria-label="근무 불가 사유"
        className="reasonInput"
        disabled={disabled}
        value={rule.reason ?? ""}
        placeholder="사유 (선택)"
        onChange={(e) => onChange({ ...rule, reason: e.target.value })}
      />
      <button
        disabled={disabled}
        aria-label={`${rule.date} 근무 불가 삭제`}
        onClick={onDelete}
      >
        삭제
      </button>
    </div>
  );
}

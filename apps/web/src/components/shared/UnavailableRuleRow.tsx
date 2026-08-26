import type { AvailabilityRule } from "@part-time/scheduler-core";
import { buildRuleFromKind, ruleKind } from "@/lib/schedule-format";

export function UnavailableRuleRow({
  rule,
  disabled,
  compact,
  onChange,
  onDelete
}: {
  rule: AvailabilityRule;
  disabled: boolean;
  compact?: boolean;
  onChange: (next: AvailabilityRule) => void;
  onDelete: () => void;
}) {
  return (
    <div className={compact ? "ruleRow periodRuleRow" : "ruleRow"}>
      <input
        disabled={disabled}
        type="date"
        value={rule.date}
        onChange={(event) => onChange({ ...rule, date: event.target.value })}
      />
      <select
        disabled={disabled}
        value={ruleKind(rule)}
        onChange={(event) => onChange(buildRuleFromKind(rule, event.target.value))}
      >
        <option value="all">전체 불가</option>
        <option value="block:open">오픈 불가</option>
        <option value="block:middle">미들 불가</option>
        <option value="block:close">마감 불가</option>
        <option value="block:night">야간 불가</option>
      </select>
      <input
        className={compact ? "reasonInput" : undefined}
        disabled={disabled}
        value={rule.reason ?? ""}
        placeholder="사유"
        onChange={(event) => onChange({ ...rule, reason: event.target.value })}
      />
      <button type="button" disabled={disabled} aria-label="근무 제한 삭제" onClick={onDelete}>
        삭제
      </button>
    </div>
  );
}

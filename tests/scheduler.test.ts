import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  solveSchedule,
  solveScheduleRange,
  summarize,
  buildShifts,
  blockedReason,
  buildCandidates,
  hasAssignmentConflict,
  validate,
  UNASSIGNED_ID,
  type SchedulerConfig,
  type AssistantProfile,
} from "../packages/scheduler-core/src/index.ts";
import {
  remapConfigMonth,
  parseBulkUnavailable,
  parseBulkClasses,
  ruleKind,
  buildRuleFromKind,
} from "../apps/web/src/lib/schedule-format.ts";
import {
  normalizeRoster,
  decodeClasses,
  encodeClasses,
} from "../apps/web/src/lib/roster-model.ts";
const original = JSON.parse(
  readFileSync(new URL("../data/june_2026.json", import.meta.url), "utf8"),
) as SchedulerConfig;
function assertHardConstraints(
  config: SchedulerConfig,
  result: ReturnType<typeof solveSchedule>,
) {
  const days = new Set();
  for (const shift of result.shifts) {
    const id = result.assignments[shift.id];
    if (!id || id === UNASSIGNED_ID) continue;
    assert.ok(result.candidates[shift.id].includes(id));
    if (
      shift.dayKind !== "weekday" ||
      !["open", "middle", "close"].includes(shift.key)
    )
      continue;
    assert.ok(
      !days.has(`${shift.date}:${id}`),
      `duplicate day ${shift.date}:${id}`,
    );
    days.add(`${shift.date}:${id}`);
  }
}
test("impossible staffing leaves holes, never assigns first candidate repeatedly", () => {
  const config = structuredClone(original);
  config.assistants = [
    { ...config.assistants[0], classes: {}, unavailable_rules: [] },
  ];
  const result = solveSchedule(config, { attempts: 20 });
  assert.equal(result.summary.assignedShifts, 68); // 22 weekdays × 2 + 8 weekend days × 3
  assert.ok(result.summary.unassignedShifts > 0);
  assertHardConstraints(config, result);
});

function singleAssistantConfig(): SchedulerConfig {
  return {
    ...structuredClone(original),
    assistants: [
      {
        id: "solo",
        name: "조교",
        short_name: "조교",
        classes: {},
        classes_revision: 1,
        unavailable_rules: [],
      },
    ],
  };
}

test("weekday day-shift pairs conflict, while night can accompany any one day shift", () => {
  const config = singleAssistantConfig();
  const shifts = buildShifts(config);
  for (const date of [
    "2026-06-01",
    "2026-06-02",
    "2026-06-03",
    "2026-06-04",
    "2026-06-05",
  ]) {
    const today = shifts.filter((s) => s.date === date);
    const days = today.filter((s) => s.key !== "night");
    const night = today.find((s) => s.key === "night")!;
    for (const day of days) {
      const assigned = { [day.id]: "solo", [night.id]: "solo" };
      assert.equal(
        hasAssignmentConflict("solo", night, assigned, shifts),
        false,
      );
      assert.equal(hasAssignmentConflict("solo", day, assigned, shifts), false);
      assert.deepEqual(
        validate(
          config,
          assigned,
          [day, night],
          buildCandidates(config, [day, night]),
        ),
        [],
      );
      for (const other of days.filter((s) => s.id !== day.id)) {
        assert.equal(
          hasAssignmentConflict("solo", other, assigned, shifts),
          true,
        );
        const pair = [day, other];
        assert.ok(
          validate(
            config,
            { [day.id]: "solo", [other.id]: "solo" },
            pair,
            buildCandidates(config, pair),
          ).some((issue) => issue.includes("평일 오픈·미들·마감 중복 배정")),
        );
      }
    }
  }
});

test("both weekend days allow the same assistant in open, middle and close", () => {
  const config = singleAssistantConfig();
  const result = solveScheduleRange(config, "2026-06-06", "2026-06-07", {
    attempts: 1,
  });
  assert.equal(result.summary.assignedShifts, 6);
  assert.deepEqual(result.issues, []);
  for (const shift of result.shifts) {
    assert.equal(result.assignments[shift.id], "solo");
    assert.equal(
      hasAssignmentConflict("solo", shift, result.assignments, result.shifts),
      false,
    );
  }
});

test("assigning night first still allows one weekday day shift", () => {
  const config = singleAssistantConfig();
  config.rules.shift_templates.weekday.reverse();
  const result = solveScheduleRange(config, "2026-06-01", "2026-06-01", {
    attempts: 1,
  });
  assert.equal(result.summary.assignedShifts, 2);
  assert.equal(result.assignments["2026-06-01:night"], "solo");
  assertHardConstraints(config, result);
  assert.ok(!result.issues.some((issue) => issue.includes("중복 배정")));
});

test("a period crossing months applies weekday and weekend repeat rules", () => {
  const config = singleAssistantConfig();
  const result = solveScheduleRange(config, "2026-07-31", "2026-08-02", {
    attempts: 1,
  });
  assert.equal(result.summary.assignedShifts, 8);
  assertHardConstraints(config, result);
});

test("repeat permission never bypasses classes or personal unavailability", () => {
  const config = singleAssistantConfig();
  config.assistants[0].classes = { sat: [["09:00", "15:00"]] };
  config.assistants[0].unavailable_rules = [
    { date: "2026-06-05", unavailable_shifts: ["night"] },
    { date: "2026-06-07", mode: "all" },
  ];
  const result = solveScheduleRange(config, "2026-06-05", "2026-06-07", {
    attempts: 1,
  });
  assert.equal(result.assignments["2026-06-05:night"], UNASSIGNED_ID);
  assert.equal(result.assignments["2026-06-06:open"], UNASSIGNED_ID);
  assert.equal(result.assignments["2026-06-06:middle"], "solo");
  assert.equal(result.assignments["2026-06-06:close"], "solo");
  for (const key of ["open", "middle", "close"])
    assert.equal(result.assignments[`2026-06-07:${key}`], UNASSIGNED_ID);
  assertHardConstraints(config, result);
});
test("every month retains original dated restrictions and weekly classes", () => {
  let current = structuredClone(original);
  for (const month of ["2026-07", "2026-09", "2027-02", "2026-06"]) {
    current = remapConfigMonth(current, month);
    assert.deepEqual(current.assistants, original.assistants);
  }
});
test("31st is never collapsed into February or duplicated on a round trip", () => {
  const config = structuredClone(original);
  config.assistants[0].unavailable_rules = [
    { date: "2026-01-31", mode: "all" },
  ];
  const feb = remapConfigMonth(config, "2026-02");
  assert.equal(feb.assistants[0].unavailable_rules[0].date, "2026-01-31");
});
test("monthly personal restrictions affect only their own month", () => {
  const config = structuredClone(original);
  config.assistants[0].classes = {};
  const shifts = buildShifts(remapConfigMonth(config, "2026-07"));
  assert.equal(
    blockedReason(
      config.assistants[0],
      shifts.find((s) => s.date === "2026-07-14")!,
      config,
    ),
    "",
  );
});
test("feasible schedules stay balanced with fewer attempts over multiple months", () => {
  for (const month of ["2026-06", "2026-07", "2026-09", "2026-10", "2027-02"]) {
    const config = remapConfigMonth(original, month);
    const result = solveSchedule(config, {
      attempts: 500,
      seed: Number(month.replace("-", "")),
    });
    assertHardConstraints(config, result);
    assert.ok(
      result.summary.hourRange <= 10,
      `${month}: range ${result.summary.hourRange}`,
    );
  }
});
test("empty roster and invalid attempts cannot produce invalid fallback assignments", () => {
  const config = { ...original, assistants: [] };
  for (const attempts of [0, -5, NaN]) {
    const result = solveSchedule(config, { attempts });
    assert.equal(result.summary.assignedShifts, 0);
    assert.equal(result.summary.unassignedShifts, result.shifts.length);
  }
});
test("summaries ignore assignments from another month and deleted assistants", () => {
  const shifts = buildShifts(original);
  const summary = summarize(
    original,
    { "2099-01-01:open": original.assistants[0].id, [shifts[0].id]: "deleted" },
    shifts,
  );
  assert.equal(summary.assignedShifts, 0);
  assert.equal(summary.assignedCreditHours, 0);
});
test("period scheduling handles multiple months without moving dates", () => {
  const result = solveScheduleRange(original, "2026-06-29", "2026-07-03", {
    attempts: 50,
  });
  assert.equal(new Set(result.shifts.map((s) => s.date)).size, 5);
  assertHardConstraints(original, result);
});
test("old classes reset once, reviewed and in-progress new classes survive reload", () => {
  const legacy = normalizeRoster(original.assistants);
  assert.deepEqual(legacy[0].classes, {});
  assert.equal(legacy[0].classes_revision, 0);
  const entered: AssistantProfile = {
    ...legacy[0],
    classes: { mon: [["09:00", "10:00"]] },
  };
  assert.deepEqual(normalizeRoster([entered])[0].classes, entered.classes);
  entered.classes_revision = 1;
  assert.deepEqual(decodeClasses(encodeClasses(entered)), {
    classes: entered.classes,
    classes_revision: 1,
  });
  assert.deepEqual(decodeClasses(original.assistants[0].classes), {
    classes: {},
    classes_revision: 0,
  });
});
test("unreviewed empty classes do not silently increase availability", () => {
  const config = {
    ...original,
    assistants: normalizeRoster(original.assistants),
  };
  const result = solveSchedule(config, { attempts: 20 });
  assert.equal(result.summary.assignedShifts, 0);
  config.assistants.forEach((a) => {
    a.classes_revision = 1;
  });
  assert.ok(solveSchedule(config, { attempts: 20 }).summary.assignedShifts > 0);
});
test("Saturday classes and only-shifts restrictions remain real restrictions", () => {
  const config = structuredClone(original);
  const person = {
    ...config.assistants[0],
    classes: { sat: [["10:00", "12:00"]] },
    unavailable_rules: [],
  } as AssistantProfile;
  const shift = buildShifts(config).find(
    (s) => s.dayIndex === 5 && s.key === "open",
  )!;
  assert.equal(blockedReason(person, shift, config), "수업 시간");
  const rule = parseBulkUnavailable("16 미들만 가능", "2026-09")[0];
  assert.deepEqual(rule.only_shifts, ["middle"]);
  assert.equal(ruleKind(rule), "only:middle");
  assert.deepEqual(buildRuleFromKind(rule, ruleKind(rule)), rule);
});
test("bulk input rejects explicit dates belonging to another month", () => {
  assert.deepEqual(
    parseBulkUnavailable(
      "2026-08-16 전체불가\n8/20 오픈 불가\n8/22-8/24 불가",
      "2026-09",
    ),
    [],
  );
  assert.equal(parseBulkUnavailable("14-17 전체불가", "2026-09").length, 4);
  assert.equal(parseBulkUnavailable("31 전체불가", "2026-02").length, 0);
});
test("invalid class ranges are not imported", () => {
  assert.deepEqual(
    parseBulkClasses("월 14:00-10:00\n화 29:00-30:00\n수 10:70-12:00"),
    {},
  );
  assert.deepEqual(parseBulkClasses("월 9:00-10:00"), {
    mon: [["09:00", "10:00"]],
  });
});

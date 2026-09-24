import { test } from "node:test";
import assert from "node:assert/strict";
import { rosterSchema } from "../apps/web/src/lib/roster-schema.ts";
const assistant = {
  id: "test",
  name: "test",
  short_name: "T",
  classes_revision: 0,
  classes: { mon: [["14:00", ""]] },
  unavailable_rules: [],
};
test("in-progress class inputs remain saveable; confirmation requires valid ranges", () => {
  assert.equal(rosterSchema.safeParse([assistant]).success, true);
  assert.equal(
    rosterSchema.safeParse([{ ...assistant, classes_revision: 1 }]).success,
    false,
  );
  assert.equal(
    rosterSchema.safeParse([
      {
        ...assistant,
        classes_revision: 1,
        classes: { mon: [["14:00", "15:00"]] },
      },
    ]).success,
    true,
  );
});
test("duplicate IDs and impossible unavailable dates are rejected before writing", () => {
  assert.equal(rosterSchema.safeParse([assistant, assistant]).success, false);
  assert.equal(
    rosterSchema.safeParse([
      {
        ...assistant,
        unavailable_rules: [{ date: "2026-02-31", mode: "all" }],
      },
    ]).success,
    false,
  );
});

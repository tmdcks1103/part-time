import { test } from "node:test";
import assert from "node:assert/strict";
import {
  writeCache,
  readCache,
  acknowledge,
} from "../apps/web/src/lib/sync-cache.ts";
import { applyStoredRoster } from "../apps/web/src/lib/schedule-store.ts";
const storage = new Map<string, string>();
Object.assign(globalThis, {
  window: {
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
    },
  },
});
test("a refresh restores unsaved roster additions and intentional deletions", () => {
  writeCache("roster", { data: [], dirty: true, revision: "r1" });
  assert.deepEqual(
    applyStoredRoster({ assistants: [{ id: "seed" }] } as never).assistants,
    [],
  );
  const data = [
    {
      id: "new",
      name: "new",
      short_name: "N",
      classes: {},
      classes_revision: 1,
      unavailable_rules: [],
    },
  ];
  writeCache("roster", { data, dirty: true, revision: "r1" });
  assert.deepEqual(
    applyStoredRoster({ assistants: [] } as never).assistants,
    data,
  );
});
test("a slow acknowledgement never clears a newer edit", () => {
  writeCache("test", { data: { name: "newer" }, dirty: true, revision: "r1" });
  acknowledge("test", { name: "older" }, "r2");
  assert.deepEqual(readCache("test"), {
    data: { name: "newer" },
    dirty: true,
    revision: "r2",
  });
  acknowledge("test", { name: "newer" }, "r3");
  assert.equal(readCache("test")?.dirty, false);
});
test("month drafts cannot overwrite another scope", () => {
  writeCache("month:2026-09", {
    data: { seed: 9 },
    dirty: true,
    revision: "sept",
  });
  writeCache("month:2026-10", {
    data: { seed: 10 },
    dirty: true,
    revision: "oct",
  });
  acknowledge("month:2026-09", { seed: 9 }, "saved");
  assert.deepEqual(readCache("month:2026-10"), {
    data: { seed: 10 },
    dirty: true,
    revision: "oct",
  });
});

test("JSONB key ordering does not turn an acknowledged save into a dirty edit", () => {
  writeCache("ordered", {
    data: { settings: { seed: 1, attempts: 500 } },
    dirty: true,
    revision: "r1",
  });
  acknowledge("ordered", { settings: { attempts: 500, seed: 1 } }, "r2");
  assert.equal(readCache("ordered")?.dirty, false);
});

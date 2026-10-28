import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
const url = process.env.TEST_URL ?? "http://localhost:3001";
const original = JSON.parse(
  readFileSync(new URL("../data/june_2026.json", import.meta.url)),
);
const fixture = original.assistants.map((a) => ({ ...a, classes_revision: 1 }));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
let roster = structuredClone(fixture),
  revision = 1,
  rosterDelay = 0,
  writeDelay = 0,
  offline = false;
const drafts = new Map();
const saves = [];
const errors = [];
// PostgreSQL JSONB returns object keys in a different order from UI construction.
drafts.set("month:2026-06", {
  revision: "1",
  draft: {
    settings: {
      seed: 202606,
      ignoreClassConflicts: false,
      fairnessToleranceHours: 10,
      attempts: 500,
    },
    manual_assignments: {},
    updated_at: "2026-09-24T00:00:00Z",
    updated_by: "테스트",
  },
});
const intercept = async (route) => {
  const request = route.request(),
    path = new URL(request.url()).pathname;
  if (offline) {
    await route.fulfill({ status: 503, json: { error: "offline test" } });
    return;
  }
  if (path === "/api/roster") {
    if (request.method() === "GET") {
      const snapshot = {
        assistants: structuredClone(roster),
        revision: String(revision),
        lastUpdatedAt: "2026-09-23T00:00:00Z",
        lastUpdatedBy: "테스트",
      };
      if (rosterDelay) await new Promise((r) => setTimeout(r, rosterDelay));
      await route.fulfill({ json: snapshot });
      return;
    }
    const body = request.postDataJSON();
    if (body.baseRevision !== String(revision)) {
      await route.fulfill({ status: 409, json: {} });
      return;
    }
    roster = body.assistants;
    revision++;
    saves.push({ path, body });
    if (writeDelay)
      await new Promise((resolve) => setTimeout(resolve, writeDelay));
    await route.fulfill({
      json: { revision: String(revision), updatedAt: new Date().toISOString() },
    });
    return;
  }
  if (path === "/api/drafts") {
    if (request.method() === "GET") {
      const scope = new URL(request.url()).searchParams.get("scope");
      await route.fulfill({
        json: {
          draft: drafts.get(scope)?.draft ?? null,
          revision: drafts.get(scope)?.revision ?? null,
        },
      });
      return;
    }
    const body = request.postDataJSON();
    const current = drafts.get(body.scopeKey);
    if ((current?.revision ?? null) !== body.baseRevision) {
      await route.fulfill({ status: 409, json: {} });
      return;
    }
    const rev = String(Number(current?.revision ?? 0) + 1);
    drafts.set(body.scopeKey, {
      revision: rev,
      draft: {
        settings: body.settings,
        manual_assignments: body.manualAssignments,
        updated_at: new Date().toISOString(),
        updated_by: body.actorName,
      },
    });
    saves.push({ path, body });
    await route.fulfill({
      json: { revision: rev, updatedAt: new Date().toISOString() },
    });
    return;
  }
  await route.fulfill({ json: { versions: [], online: [], entries: [] } });
};
await context.route("**/api/**", intercept);
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
let workerCount = 0;
page.on("worker", () => {
  workerCount++;
});
await page.goto(url);
await page
  .getByRole("button", { name: "다시 자동 배정", exact: true })
  .waitFor({ state: "visible" });
await page.waitForFunction(() => !document.querySelector(".loadingState"));
assert.equal(await page.locator(".assistantItem").count(), 12);
assert.equal(
  saves.length,
  0,
  "loading must not auto-save or overwrite server state",
);
assert.equal(
  await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("part-time:sync:v2:month:2026-06")).dirty,
  ),
  false,
);
mkdirSync("/tmp/part-time-verification", { recursive: true });
await page.screenshot({
  path: "/tmp/part-time-verification/desktop.png",
  fullPage: true,
});
await page.setViewportSize({ width: 390, height: 844 });
assert.ok(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
);
await page.screenshot({
  path: "/tmp/part-time-verification/mobile.png",
  fullPage: true,
});
await page.setViewportSize({ width: 1440, height: 1000 });
const workersBeforeRename = workerCount;
await page.getByText("이름 수정", { exact: true }).click();
await page.getByLabel("이름", { exact: true }).fill("김성훈 검증");
await page.getByLabel("이름", { exact: true }).fill("김성훈");
await page.waitForTimeout(300);
assert.equal(
  workerCount,
  workersBeforeRename,
  "name changes must not rerun solver",
);
console.log("PASS: JSONB hydration is clean; naming edits do not rerun solver");
await page.getByLabel("편집자").selectOption("근무표 담당자");
await page.getByRole("button", { name: "+ 추가", exact: true }).click();
await page.getByText("이름 수정", { exact: true }).click();
await page.getByLabel("이름", { exact: true }).fill("새로고침 검증");
await page.reload();
await page.waitForFunction(() => !document.querySelector(".loadingState"));
assert.equal(await page.locator(".assistantItem").count(), 13);
assert.ok(
  (await page.locator(".assistantList").innerText()).includes("새로고침 검증"),
);
console.log("PASS: add and immediate refresh preserve roster");

await page
  .getByRole("button", { name: /김성훈/ })
  .first()
  .click();
await page.getByRole("button", { name: "다음 달" }).click();
await page.waitForFunction(() => !document.querySelector(".loadingState"));
assert.equal(await page.locator(".ruleRow").count(), 0);
await page.getByRole("button", { name: "+ 날짜 추가" }).click();
await page.getByLabel("근무 불가 날짜", { exact: true }).fill("2026-07-22");
await page.getByRole("button", { name: "이전 달" }).click();
await page.waitForFunction(() => !document.querySelector(".loadingState"));
assert.equal(await page.locator(".ruleRow").count(), 4);
await page.getByRole("button", { name: "다음 달" }).click();
await page.waitForFunction(() => !document.querySelector(".loadingState"));
assert.equal(
  await page.getByLabel("근무 불가 날짜", { exact: true }).inputValue(),
  "2026-07-22",
);
console.log("PASS: month round-trip preserves independent restrictions");

await page.getByRole("tab", { name: "고정 수업 시간" }).click();
assert.ok((await page.locator(".classRow").count()) > 0);
await page.getByRole("button", { name: "+ 수업 추가" }).click();
await page.reload();
await page.waitForFunction(() => !document.querySelector(".loadingState"));
await page.getByRole("tab", { name: "고정 수업 시간" }).click();
assert.ok(
  (await page.locator(".classRow").count()) > 0,
  "unconfirmed edits must survive reload",
);
console.log("PASS: fixed classes and unconfirmed edits persist");

// A settings change just before switching scopes must save under its original scope.
await page.getByText("배정 설정", { exact: true }).click();
await page.getByLabel("시간 편차 허용 (시간)").fill("7");
await page.getByRole("button", { name: "다음 달" }).click();
await page.waitForFunction(() => !document.querySelector(".loadingState"));
await page.getByRole("button", { name: "이전 달" }).click();
await page.waitForFunction(() => !document.querySelector(".loadingState"));
assert.equal(await page.getByLabel("시간 편차 허용 (시간)").inputValue(), "7");
console.log(
  "PASS: rapid scope switch retains settings in their original month",
);

// All edits still survive when the API fails.
offline = true;
await page.getByRole("button", { name: "+ 추가", exact: true }).click();
await page.getByText("이름 수정", { exact: true }).click();
await page.getByLabel("이름", { exact: true }).fill("오프라인 검증");
await page.reload();
await page.waitForFunction(() => !document.querySelector(".loadingState"));
assert.ok(
  (await page.locator(".assistantList").innerText()).includes("오프라인 검증"),
);
console.log("PASS: offline edits survive reload");
offline = false;

// Reconnect retries pending edits without discarding them.
await page
  .getByRole("button", { name: "다시 연결", exact: true })
  .first()
  .click();
await page.waitForFunction(() =>
  document
    .querySelector(".syncStrip .syncStatus")
    ?.textContent.includes("동기화 완료"),
);
assert.ok(roster.some((a) => a.name === "오프라인 검증"));
console.log("PASS: reconnect saves pending changes");

// Cached roster must be usable even during a slow read, whose stale response cannot undo an edit.
rosterDelay = 1400;
await page.reload();
await page.getByText("이름 수정", { exact: true }).click();
await page.getByLabel("이름", { exact: true }).fill("느린 응답 검증");
await page.waitForTimeout(1700);
assert.equal(
  await page.getByLabel("이름", { exact: true }).inputValue(),
  "느린 응답 검증",
);
assert.equal(roster[0].name, "느린 응답 검증");
rosterDelay = 0;
console.log("PASS: delayed GET cannot overwrite an intervening edit and save");

writeDelay = 900;
const firstPut = page.waitForRequest(
  (request) =>
    request.url().endsWith("/api/roster") &&
    request.method() === "PUT" &&
    request.postDataJSON().assistants[0].name === "저장 중 편집 1",
);
await page.getByLabel("이름", { exact: true }).fill("저장 중 편집 1");
await firstPut;
const latestPut = page.waitForResponse(
  (response) =>
    response.url().endsWith("/api/roster") &&
    response.request().method() === "PUT" &&
    response.request().postDataJSON().assistants[0].name === "저장 중 편집 2",
);
await page.getByLabel("이름", { exact: true }).fill("저장 중 편집 2");
assert.equal((await latestPut).status(), 200);
await page.waitForFunction(
  () => !JSON.parse(localStorage.getItem("part-time:sync:v2:roster")).dirty,
);
assert.equal(roster[0].name, "저장 중 편집 2");
writeDelay = 0;
console.log(
  "PASS: edits during an in-flight save are drained immediately in order",
);

// Confirm the newly entered classes (including deliberate 'no classes').
const pendingNames = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("part-time:sync:v2:roster"))
    .data.filter((a) => a.classes_revision !== 1)
    .map((a) => a.name),
);
for (const name of pendingNames) {
  await page
    .locator(".assistantItem")
    .filter({ hasText: name })
    .getByRole("button")
    .click();
  await page.getByRole("tab", { name: "고정 수업 시간" }).click();
  await page
    .getByRole("button", { name: /^(수업 시간 확인 완료|수업 없음 확인)$/ })
    .click();
}
await page.waitForSelector(".shiftCard");
await page.locator(".shiftCard").first().click();
await page.getByRole("button", { name: "미배정", exact: true }).click();
await page.reload();
await page.waitForSelector(".shiftCard");
assert.ok(
  (await page.locator(".shiftCard").first().innerText()).includes("미배정"),
);
console.log("PASS: explicit manual assignments survive refresh");

// Delete one newly added assistant; it must not be remerged from seed or stale cache.
await page
  .locator(".assistantItem")
  .filter({ hasText: "새로고침 검증" })
  .getByRole("button")
  .click();
page.once("dialog", (dialog) => dialog.accept());
await page.getByRole("button", { name: "이 조교 삭제" }).click();
await page.reload();
await page.waitForFunction(() => !document.querySelector(".loadingState"));
assert.ok(
  !(await page.locator(".assistantList").innerText()).includes("새로고침 검증"),
);
console.log("PASS: deleted assistants stay deleted on refresh");

// Cross-month period editing uses the same fixed roster and actual dates.
await page.getByRole("link", { name: "기간 편성", exact: true }).click();
await page.getByLabel("종료일", { exact: true }).fill("2026-07-03");
await page.getByLabel("시작일", { exact: true }).fill("2026-06-29");
await page.waitForSelector(".shiftCard");
await page.waitForFunction(
  () => document.querySelectorAll(".scheduleTable tbody tr").length === 5,
);
await page.getByLabel("근무 불가 입력 월").selectOption("2026-07");
await page.getByRole("tab", { name: /월별 근무 불가/ }).click();
assert.equal(
  await page.getByLabel("근무 불가 날짜", { exact: true }).inputValue(),
  "2026-07-22",
);
console.log(
  "PASS: period spanning months preserves roster and monthly restrictions",
);
await context.close();

// A different browser changes the server after our GET; stale writes must be blocked.
roster = structuredClone(fixture);
revision++;
const conflictContext = await browser.newContext();
await conflictContext.route("**/api/**", intercept);
const conflictPage = await conflictContext.newPage();
await conflictPage.goto(url);
await conflictPage.waitForSelector(".shiftCard");
await conflictPage.getByLabel("편집자").selectOption("근무표 담당자");
roster[0].name = "다른 사용자 편집";
revision++;
await conflictPage.getByText("이름 수정", { exact: true }).click();
await conflictPage.getByLabel("이름", { exact: true }).fill("내 미전송 편집");
await conflictPage.waitForSelector(".syncStatus-conflict");
assert.equal(roster[0].name, "다른 사용자 편집");
await conflictPage.reload();
await conflictPage.waitForSelector(".syncStatus-conflict");
assert.ok(
  (await conflictPage.locator(".assistantList").innerText()).includes(
    "내 미전송 편집",
  ),
);
await conflictContext.close();
console.log("PASS: conflicting writes cannot overwrite another user's roster");

roster = [];
revision++;
const emptyContext = await browser.newContext();
await emptyContext.route("**/api/**", intercept);
const emptyPage = await emptyContext.newPage();
await emptyPage.goto(url);
await emptyPage.waitForFunction(() => !document.querySelector(".loadingState"));
assert.equal(await emptyPage.locator(".assistantItem").count(), 0);
await emptyPage.reload();
await emptyPage.waitForFunction(() => !document.querySelector(".loadingState"));
assert.equal(await emptyPage.locator(".assistantItem").count(), 0);
console.log(
  "PASS: an intentionally empty server roster does not restore seed assistants",
);
await emptyContext.close();

// The manual picker must enforce the same repeat rules as the worker.
roster = [
  { ...structuredClone(fixture[0]), classes: {}, unavailable_rules: [] },
];
revision++;
drafts.clear();
const repeatContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
await repeatContext.route("**/api/**", intercept);
const repeatPage = await repeatContext.newPage();
repeatPage.on("pageerror", (error) => errors.push(error.message));
await repeatPage.goto(url);
await repeatPage.waitForSelector(".shiftCard");
await repeatPage.getByLabel("편집자").selectOption("근무표 담당자");
assert.ok(
  await repeatPage.evaluate(
    () => document.documentElement.scrollWidth <= innerWidth,
  ),
);
const selectShift = async (date, name) =>
  repeatPage
    .getByRole("button", { name: new RegExp(`^${date} ${name} ·`) })
    .click();
const candidate = repeatPage
  .locator(".shiftInspector")
  .getByRole("button", { name: new RegExp(roster[0].name) });
await selectShift("2026-06-01", "야간");
assert.equal(await candidate.isEnabled(), true);
await repeatPage.getByRole("button", { name: "미배정", exact: true }).click();
assert.equal(await candidate.isEnabled(), true);
await candidate.click();
const assignedDay = repeatPage
  .locator(".scheduleTable tbody tr")
  .first()
  .locator(".shiftCard:not(.unassigned)")
  .first();
await assignedDay.click();
await repeatPage.getByRole("button", { name: "미배정", exact: true }).click();
await selectShift("2026-06-01", "미들");
assert.equal(
  await candidate.isEnabled(),
  true,
  "night must not block a weekday day shift",
);
await candidate.click();
await selectShift("2026-06-01", "마감");
assert.equal(
  await candidate.isDisabled(),
  true,
  "weekday middle must block close",
);
assert.ok(
  (await candidate.innerText()).includes("평일 오픈·미들·마감 중복 불가"),
);
for (const date of ["2026-06-06", "2026-06-07"]) {
  for (const name of ["오픈", "미들", "마감"]) {
    await selectShift(date, name);
    assert.equal(await candidate.isEnabled(), true);
    await candidate.click();
  }
}
console.log(
  "PASS: manual assignment allows nights and weekends, but blocks repeated weekday day shifts",
);
await repeatContext.close();
assert.deepEqual(errors, []);
await browser.close();

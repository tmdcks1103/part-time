import type { AssistantProfile, SchedulerConfig } from "@part-time/scheduler-core";
import juneConfig from "@/data/june_2026.json";

export interface ScheduleWorkspace {
  config: SchedulerConfig;
}

// 조교 명단과 마찬가지로 근무표 버전 기록도 이제 서버(schedule_versions 테이블)가
// 진짜 소스다. 여기서는 초기 시드 설정(config)만 내려준다.
export function getInitialWorkspace(): ScheduleWorkspace {
  return {
    config: juneConfig as SchedulerConfig
  };
}

// 조교 명단(이름/표시명/수업시간/근무 불가 규칙)은 서버(roster_assistants 테이블)가
// 우선 소스이며, 여러 사용자 간에 공유된다. 이 localStorage 캐시는 서버 연결이
// 안 될 때를 대비한 오프라인 폴백 및 최초 렌더링용 캐시로만 쓰인다.
type RosterProfile = Pick<AssistantProfile, "id" | "name" | "short_name" | "classes" | "unavailable_rules">;

const ROSTER_STORAGE_KEY = "part-time:roster:v1";

function loadStoredRoster(): RosterProfile[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ROSTER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveStoredRoster(assistants: AssistantProfile[]) {
  if (typeof window === "undefined") return;
  const roster: RosterProfile[] = assistants.map(({ id, name, short_name, classes, unavailable_rules }) => ({
    id,
    name,
    short_name,
    classes,
    unavailable_rules
  }));
  try {
    window.localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(roster));
  } catch {
    // localStorage를 쓸 수 없어도 화면 내 편집은 계속 동작해야 하므로 조용히 무시한다.
  }
}

// 이 브라우저에서 마지막으로 로컬 편집을 시작한 시각을 (대상별로) 기록해둔다. 화면을
// 옮기거나 다시 불러올 때, 서버에서 방금 읽어온 값이 이 시각보다 오래됐다면(=아직 저장이
// 서버에 도달하지 못한 상태라면) 그 응답으로 로컬 상태를 덮어쓰지 않기 위한 기준이다.
// key는 "roster" 또는 근무표 스코프(예: "month:2026-06")처럼 편집 대상을 구분한다.
function localEditAtKey(key: string) {
  return `part-time:local-edit-at:${key}`;
}

export function markEditedNow(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(localEditAtKey(key), new Date().toISOString());
  } catch {
    // localStorage를 쓸 수 없어도 화면 내 편집은 계속 동작해야 하므로 조용히 무시한다.
  }
}

export function loadLocalEditAt(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(localEditAtKey(key));
  } catch {
    return null;
  }
}

export function markRosterEditedNow() {
  markEditedNow("roster");
}

export function loadRosterLocalEditAt(): string | null {
  return loadLocalEditAt("roster");
}

// 마지막으로 보던 근무월/기간을 기억해둔다. 이게 없으면 근무표 설정·배정을
// 자동저장해도 새로고침할 때마다 항상 시드 데이터의 월(2026-06)이나 기간 화면의
// 기본값(2026-07-15~07-31)으로 되돌아가 버려서, 자동저장된 내용이 있는 스코프를
// 다시 찾아가지 못한다.
const LAST_MONTH_KEY = "part-time:last-month";
const LAST_PERIOD_KEY = "part-time:last-period";

export function saveLastMonth(month: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_MONTH_KEY, month);
  } catch {
    // ignore
  }
}

export function loadLastMonth(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_MONTH_KEY);
  } catch {
    return null;
  }
}

export function saveLastPeriod(startDate: string, endDate: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_PERIOD_KEY, JSON.stringify({ startDate, endDate }));
  } catch {
    // ignore
  }
}

export function loadLastPeriod(): { startDate: string; endDate: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_PERIOD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.startDate === "string" && typeof parsed?.endDate === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

export function applyStoredRoster(config: SchedulerConfig): SchedulerConfig {
  const roster = loadStoredRoster();
  if (!roster || !roster.length) return config;
  const rosterById = new Map(roster.map((entry) => [entry.id, entry]));
  const next = structuredClone(config);

  next.assistants = next.assistants.map((assistant) => {
    const stored = rosterById.get(assistant.id);
    return stored
      ? { ...assistant, name: stored.name, short_name: stored.short_name, classes: stored.classes, unavailable_rules: stored.unavailable_rules }
      : assistant;
  });

  for (const entry of roster) {
    if (!next.assistants.some((assistant) => assistant.id === entry.id)) {
      next.assistants.push({ id: entry.id, name: entry.name, short_name: entry.short_name, classes: entry.classes, unavailable_rules: entry.unavailable_rules ?? [] });
    }
  }

  return next;
}

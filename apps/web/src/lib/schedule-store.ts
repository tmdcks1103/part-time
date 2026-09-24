import type {
  AssistantProfile,
  SchedulerConfig,
} from "@part-time/scheduler-core";
import { normalizeRoster } from "./roster-model";
import { readCache } from "./sync-cache";
import juneConfig from "@/data/june_2026.json";

export interface ScheduleWorkspace {
  config: SchedulerConfig;
}

// 조교 명단과 마찬가지로 근무표 버전 기록도 이제 서버(schedule_versions 테이블)가
// 진짜 소스다. 여기서는 초기 시드 설정(config)만 내려준다.
export function getInitialWorkspace(): ScheduleWorkspace {
  return {
    config: {
      ...juneConfig,
      assistants: normalizeRoster(juneConfig.assistants as AssistantProfile[]),
    } as SchedulerConfig,
  };
}

// 조교 명단(이름/표시명/수업시간/근무 불가 규칙)은 서버(roster_assistants 테이블)가
// 우선 소스이며, 여러 사용자 간에 공유된다. 이 localStorage 캐시는 서버 연결이
// 안 될 때를 대비한 오프라인 폴백 및 최초 렌더링용 캐시로만 쓰인다.
type RosterProfile = Pick<
  AssistantProfile,
  | "id"
  | "name"
  | "short_name"
  | "classes"
  | "classes_revision"
  | "unavailable_rules"
>;

const ROSTER_STORAGE_KEY = "part-time:roster:v1";

function loadStoredRoster(): RosterProfile[] | null {
  if (typeof window === "undefined") return null;
  try {
    const cache = readCache<AssistantProfile[]>("roster");
    if (cache) return normalizeRoster(cache.data);
    const raw = window.localStorage.getItem(ROSTER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

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
    window.localStorage.setItem(
      LAST_PERIOD_KEY,
      JSON.stringify({ startDate, endDate }),
    );
  } catch {
    // ignore
  }
}

export function loadLastPeriod(): {
  startDate: string;
  endDate: string;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_PERIOD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.startDate === "string" &&
      typeof parsed?.endDate === "string"
    )
      return parsed;
    return null;
  } catch {
    return null;
  }
}

export function applyStoredRoster(config: SchedulerConfig): SchedulerConfig {
  const roster = loadStoredRoster();
  // An empty list is intentional; merging seeds resurrects deleted assistants.
  return roster
    ? { ...config, assistants: normalizeRoster(roster as AssistantProfile[]) }
    : config;
}

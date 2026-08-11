import type { AssistantProfile, SchedulerConfig } from "@part-time/scheduler-core";
import juneConfig from "@/data/june_2026.json";

export interface ScheduleVersion {
  id: string;
  label: string;
  createdAt: string;
  createdBy: string;
}

export interface ScheduleWorkspace {
  config: SchedulerConfig;
  versions: ScheduleVersion[];
}

export function getInitialWorkspace(): ScheduleWorkspace {
  return {
    config: juneConfig as SchedulerConfig,
    versions: [
      {
        id: "v_initial",
        label: "PDF 기반 초기 데이터",
        createdAt: "2026-06-05T14:58:00+09:00",
        createdBy: "Codex"
      }
    ]
  };
}

// 조교 이름/표시명/수업시간은 월간 편성 화면과 기간 편성 화면이 공유하는 정보라
// 브라우저 localStorage에 저장해두고, 화면을 옮기거나 새로고침해도 유지되게 한다.
// 근무 불가 규칙(unavailable_rules)은 화면마다 대상 기간이 달라 로컬 상태로만 둔다.
type RosterProfile = Pick<AssistantProfile, "id" | "name" | "short_name" | "classes">;

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
  const roster: RosterProfile[] = assistants.map(({ id, name, short_name, classes }) => ({ id, name, short_name, classes }));
  try {
    window.localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(roster));
  } catch {
    // localStorage를 쓸 수 없어도 화면 내 편집은 계속 동작해야 하므로 조용히 무시한다.
  }
}

export function applyStoredRoster(config: SchedulerConfig): SchedulerConfig {
  const roster = loadStoredRoster();
  if (!roster || !roster.length) return config;
  const rosterById = new Map(roster.map((entry) => [entry.id, entry]));
  const next = structuredClone(config);

  next.assistants = next.assistants.map((assistant) => {
    const stored = rosterById.get(assistant.id);
    return stored ? { ...assistant, name: stored.name, short_name: stored.short_name, classes: stored.classes } : assistant;
  });

  for (const entry of roster) {
    if (!next.assistants.some((assistant) => assistant.id === entry.id)) {
      next.assistants.push({ id: entry.id, name: entry.name, short_name: entry.short_name, classes: entry.classes, unavailable_rules: [] });
    }
  }

  return next;
}

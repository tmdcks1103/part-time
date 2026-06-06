import type { SchedulerConfig } from "@part-time/scheduler-core";
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

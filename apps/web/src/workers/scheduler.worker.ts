import { solveSchedule, solveScheduleRange } from "@part-time/scheduler-core";
import type { SchedulerConfig } from "@part-time/scheduler-core";

self.onmessage = (
  event: MessageEvent<{
    config: SchedulerConfig;
    attempts: number;
    seed: number;
    startDate?: string;
    endDate?: string;
  }>,
) => {
  try {
    const { config, attempts, seed, startDate, endDate } = event.data;
    const started = performance.now();
    const result =
      startDate && endDate
        ? solveScheduleRange(config, startDate, endDate, { attempts, seed })
        : solveSchedule(config, { attempts, seed });
    self.postMessage({
      result,
      durationMs: Math.round(performance.now() - started),
    });
  } catch {
    self.postMessage({
      error: "근무표를 계산하지 못했습니다. 입력 날짜와 시간을 확인해 주세요.",
    });
  }
};

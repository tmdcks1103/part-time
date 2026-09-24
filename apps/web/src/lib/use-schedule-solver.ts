"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildShifts,
  buildCandidates,
  summarize,
  type SchedulerConfig,
  type SolveResult,
} from "@part-time/scheduler-core";

export function useScheduleSolver(
  config: SchedulerConfig,
  attempts: number,
  seed: number,
  enabled: boolean,
  startDate?: string,
  endDate?: string,
) {
  const inputKey = JSON.stringify({
    config: {
      ...config,
      assistants: config.assistants.map((a) => ({
        ...a,
        name: "",
        short_name: "",
      })),
    },
    attempts,
    seed,
    startDate,
    endDate,
  });
  const [completed, setCompleted] = useState<{
    key: string;
    result?: SolveResult;
    error?: string;
    durationMs?: number;
  } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let worker: Worker | undefined;
    const timer = setTimeout(() => {
      try {
        worker = new Worker(
          new URL("../workers/scheduler.worker.ts", import.meta.url),
        );
        worker.onmessage = (event) =>
          setCompleted({ key: inputKey, ...event.data });
        worker.onerror = () =>
          setCompleted({
            key: inputKey,
            error:
              "계산을 시작하지 못했습니다. 새로고침 후 다시 시도해 주세요.",
          });
        worker.postMessage(JSON.parse(inputKey));
      } catch {
        setCompleted({
          key: inputKey,
          error: "이 브라우저에서 근무표 계산을 시작하지 못했습니다.",
        });
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      worker?.terminate();
    };
  }, [inputKey, enabled]);
  const empty = useMemo<SolveResult>(() => {
    const shifts = buildShifts(config).filter(
      (shift) =>
        !startDate ||
        !endDate ||
        (shift.date >= startDate && shift.date <= endDate),
    );
    return {
      assignments: {},
      shifts,
      candidates: buildCandidates(config, shifts),
      summary: summarize(config, {}, shifts),
      issues: [],
    };
  }, [config, startDate, endDate]);
  const current = completed?.key === inputKey;
  return {
    result: current && completed.result ? completed.result : empty,
    calculating: enabled && !current,
    error: current ? completed.error : undefined,
    durationMs: current ? completed.durationMs : undefined,
  };
}

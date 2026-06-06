export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type DayKind = "weekday" | "weekend";
export type ShiftKey = "open" | "middle" | "close" | "night" | string;
export type AvailabilityMode = "all";

export interface TimeRange {
  start: string;
  end: string;
}

export interface ShiftTemplate {
  key: ShiftKey;
  name: string;
  start: string;
  end: string;
  credit_hours: number;
}

export interface AvailabilityRule {
  date: string;
  mode?: AvailabilityMode;
  unavailable_shifts?: ShiftKey[];
  only_shifts?: ShiftKey[];
  reason?: string;
}

export interface AssistantProfile {
  id: string;
  name: string;
  short_name: string;
  classes: Partial<Record<DayKey, [string, string][]>>;
  unavailable_rules: AvailabilityRule[];
}

export interface SchedulerConfig {
  month: string;
  timezone?: string;
  title: string;
  notes?: string[];
  rules: {
    fairness_tolerance_hours: number;
    max_shifts_per_day: number;
    shift_templates: Record<DayKind, ShiftTemplate[]>;
  };
  assistants: AssistantProfile[];
}

export interface ShiftInstance {
  id: string;
  date: string;
  dayIndex: number;
  dayName: string;
  dayKind: DayKind;
  key: ShiftKey;
  name: string;
  start: number;
  end: number;
  creditHours: number;
  order: number;
}

export type AssignmentMap = Record<string, string>;
export type CandidateMap = Record<string, string[]>;

export interface AssistantSummary {
  id: string;
  name: string;
  shortName: string;
  hours: number;
  shiftCount: number;
  weekendCount: number;
  shiftTypes: Record<string, number>;
}

export interface ScheduleSummary {
  month: string;
  totalShifts: number;
  assignedShifts: number;
  unassignedShifts: number;
  requiredCreditHours: number;
  assignedCreditHours: number;
  minHours: number;
  maxHours: number;
  hourRange: number;
  assistantHours: AssistantSummary[];
}

export interface SolveOptions {
  attempts?: number;
  seed?: number;
  allowUnassigned?: boolean;
}

export interface SolveResult {
  assignments: AssignmentMap;
  shifts: ShiftInstance[];
  candidates: CandidateMap;
  summary: ScheduleSummary;
  issues: string[];
}

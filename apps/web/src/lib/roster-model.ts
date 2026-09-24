import type { AssistantProfile } from "@part-time/scheduler-core";

// A one-time reset: legacy schedules have no revision. A reviewed empty schedule is
// different from a schedule that has not been entered yet.
export function normalizeRoster(
  assistants: AssistantProfile[],
): AssistantProfile[] {
  return assistants.map((assistant) => ({
    ...assistant,
    classes:
      assistant.classes_revision !== undefined ? (assistant.classes ?? {}) : {},
    classes_revision: assistant.classes_revision === 1 ? 1 : 0,
    unavailable_rules: assistant.unavailable_rules ?? [],
  }));
}

export function decodeClasses(
  value: unknown,
): Pick<AssistantProfile, "classes" | "classes_revision"> {
  const stored = value as {
    version?: number;
    confirmed?: boolean;
    days?: AssistantProfile["classes"];
  } | null;
  return stored?.version === 1
    ? { classes: stored.days ?? {}, classes_revision: stored.confirmed ? 1 : 0 }
    : { classes: {}, classes_revision: 0 };
}

export function encodeClasses(assistant: AssistantProfile) {
  return {
    version: 1,
    confirmed: assistant.classes_revision === 1,
    days: assistant.classes,
  };
}

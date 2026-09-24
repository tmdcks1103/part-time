import { fingerprint } from "./resource-fingerprint";
import { normalizeRoster } from "./roster-model";

export interface CachedResource<T> {
  data: T;
  dirty: boolean;
  revision: string | null;
}

export function readCache<T>(key: string): CachedResource<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`part-time:sync:v2:${key}`);
    if (!raw) {
      if (key === "roster") {
        const legacy = window.localStorage.getItem("part-time:roster:v1");
        const data = legacy ? JSON.parse(legacy) : null;
        if (Array.isArray(data))
          return {
            data: normalizeRoster(data) as T,
            dirty: Boolean(
              window.localStorage.getItem("part-time:local-edit-at:roster"),
            ),
            revision: null,
          };
      }
      return null;
    }
    const entry = JSON.parse(raw);
    return entry && "data" in entry && typeof entry.dirty === "boolean"
      ? entry
      : null;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, entry: CachedResource<T>): boolean {
  try {
    window.localStorage.setItem(
      `part-time:sync:v2:${key}`,
      JSON.stringify(entry),
    );
    return true;
  } catch {
    return false;
  }
}

// Never let an acknowledgement for an earlier request discard a newer edit.
export function acknowledge<T>(
  key: string,
  sent: T,
  revision: string,
): CachedResource<T> | null {
  const current = readCache<T>(key);
  if (!current) return null;
  const next = {
    ...current,
    revision,
    dirty: fingerprint(current.data) !== fingerprint(sent),
  };
  writeCache(key, next);
  return next;
}

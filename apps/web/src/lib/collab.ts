"use client";

import { useEffect, useState } from "react";
import type {
  AssignmentMap,
  AssistantProfile,
} from "@part-time/scheduler-core";
import type { Identity } from "@/lib/identity";
import { normalizeRoster } from "./roster-model";
import { useResourceSync, type RemoteResource } from "./use-resource-sync";
export type { SyncStatus } from "./use-resource-sync";

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 409 || response.status === 428)
    throw new Error("conflict");
  if (!response.ok) throw new Error("network");
  return response.json();
}

export function useRosterSync(
  assistants: AssistantProfile[],
  applyRemote: (assistants: AssistantProfile[]) => void,
  identity: Identity | null,
) {
  return useResourceSync({
    resourceKey: "roster",
    value: assistants,
    apply: (value) => applyRemote(normalizeRoster(value)),
    identity,
    read: async (): Promise<RemoteResource<AssistantProfile[]>> => {
      const data = await request("/api/roster");
      return {
        data: normalizeRoster(data.assistants),
        revision: data.revision,
        updatedAt: data.lastUpdatedAt,
        updatedBy: data.lastUpdatedBy,
      };
    },
    write: (entry, actor) =>
      request("/api/roster", {
        method: "PUT",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistants: entry.data,
          baseRevision: entry.revision,
          actorName: actor.name,
          actorRole: actor.role,
        }),
      }),
  });
}

export interface DraftPayload {
  settings: Record<string, unknown>;
  manualAssignments: AssignmentMap;
  summary: Record<string, unknown>;
}

export function useDraftSync(
  scopeKey: string,
  kind: "month" | "period",
  payload: DraftPayload,
  applyRemote: (
    settings: Record<string, unknown>,
    manualAssignments: AssignmentMap,
  ) => void,
  identity: Identity | null,
) {
  // Summary is derived. Recomputing a preview must never schedule a write.
  const value = {
    settings: payload.settings,
    manualAssignments: payload.manualAssignments,
  };
  return useResourceSync({
    resourceKey: scopeKey,
    value,
    identity,
    apply: (data) => applyRemote(data.settings, data.manualAssignments),
    read: async () => {
      const data = await request(
        `/api/drafts?scope=${encodeURIComponent(scopeKey)}`,
      );
      const draft = data.draft;
      return {
        data: draft
          ? {
              settings: draft.settings,
              manualAssignments: draft.manual_assignments,
            }
          : null,
        revision: data.revision,
        updatedAt: draft?.updated_at ?? null,
        updatedBy: draft?.updated_by ?? null,
      };
    },
    write: (entry, actor) =>
      request("/api/drafts", {
        method: "PUT",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeKey,
          kind,
          ...entry.data,
          baseRevision: entry.revision,
          actorName: actor.name,
          actorRole: actor.role,
        }),
      }),
  });
}

export function createVersion(
  scopeKey: string,
  kind: "month" | "period",
  label: string,
  payload: DraftPayload,
  identity: Identity,
) {
  return fetch("/api/versions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scopeKey,
      kind,
      label,
      settings: payload.settings,
      manualAssignments: payload.manualAssignments,
      summary: payload.summary,
      actorName: identity.name,
      actorRole: identity.role,
    }),
  })
    .then((res) => res.ok)
    .catch(() => false);
}

export interface ScheduleVersionRow {
  id: number;
  scope_key: string;
  kind: string;
  label: string;
  settings: Record<string, unknown>;
  manual_assignments: AssignmentMap;
  summary: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
}

/**
 * Lists the append-only version history for one scope, for the "버전" panel.
 */
export function useVersionHistory(scopeKey: string, limit = 20) {
  const [history, setHistory] = useState<{
    scopeKey: string;
    versions: ScheduleVersionRow[];
  }>({ scopeKey, versions: [] });
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/versions?scope=${encodeURIComponent(scopeKey)}&limit=${limit}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setHistory({ scopeKey, versions: data.versions ?? [] });
      } catch {
        // ignore
      }
    }
    load();
    const timer = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [scopeKey, limit, refreshToken]);

  function refresh() {
    setRefreshToken((value) => value + 1);
  }

  return {
    versions: history.scopeKey === scopeKey ? history.versions : [],
    refresh,
  };
}

export interface PresenceRow {
  actor_name: string;
  actor_role: string | null;
  page: string;
  scope_key: string | null;
  last_seen_at: string;
}

export function usePresence(
  page: "month" | "period",
  scopeKey: string,
  identity: Identity | null,
) {
  const [online, setOnline] = useState<PresenceRow[]>([]);

  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    async function beat() {
      try {
        await fetch("/api/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actorName: identity!.name,
            actorRole: identity!.role,
            page,
            scopeKey,
          }),
        });
      } catch {
        // 접속 표시는 부가 기능이므로 실패해도 조용히 무시한다.
      }
    }
    beat();
    const beatTimer = setInterval(beat, 20000);

    async function poll() {
      try {
        const res = await fetch("/api/presence", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setOnline(data.online ?? []);
      } catch {
        // ignore
      }
    }
    poll();
    const pollTimer = setInterval(poll, 15000);

    return () => {
      cancelled = true;
      clearInterval(beatTimer);
      clearInterval(pollTimer);
    };
  }, [page, scopeKey, identity?.name, identity?.role]);

  return { online: online.filter((row) => row.actor_name !== identity?.name) };
}

export interface ActivityEntry {
  id: number;
  actor_name: string;
  actor_role: string | null;
  action: string;
  detail: string | null;
  scope_key: string | null;
  created_at: string;
}

export function useActivityFeed(limit = 20) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/activity?limit=${limit}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setEntries(data.entries ?? []);
      } catch {
        // ignore
      }
    }
    load();
    const timer = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [limit]);

  return entries;
}

export function postActivity(
  identity: Identity,
  action: string,
  detail?: string,
  scopeKey?: string,
) {
  fetch("/api/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      actorName: identity.name,
      actorRole: identity.role,
      action,
      detail,
      scopeKey,
    }),
  }).catch(() => {
    // 활동 기록 실패는 화면 동작에 영향을 주지 않는다.
  });
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 45) return "방금 전";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}일 전`;
}

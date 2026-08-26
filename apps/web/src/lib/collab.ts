"use client";

import { useEffect, useRef, useState } from "react";
import type { AssignmentMap, AssistantProfile } from "@part-time/scheduler-core";
import type { Identity } from "@/lib/identity";
import { loadRosterLocalEditAt, markRosterEditedNow, saveStoredRoster } from "@/lib/schedule-store";

export type SyncStatus = "idle" | "saving" | "saved" | "error";

interface RosterResponse {
  assistants: AssistantProfile[];
  lastUpdatedAt: string | null;
  lastUpdatedBy: string | null;
}

async function fetchRoster(): Promise<RosterResponse | null> {
  try {
    const res = await fetch("/api/roster", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as RosterResponse;
  } catch {
    return null;
  }
}

async function saveRosterRequest(assistants: AssistantProfile[], identity: Identity): Promise<{ updatedAt: string } | null> {
  try {
    const res = await fetch("/api/roster", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assistants, actorName: identity.name, actorRole: identity.role })
    });
    if (!res.ok) return null;
    return (await res.json()) as { updatedAt: string };
  } catch {
    return null;
  }
}

/**
 * Keeps the assistant roster (names, class times, unavailable-work rules) in sync with
 * the shared server copy so every browser and every user sees the same list, instead of
 * each browser keeping its own localStorage-only snapshot.
 */
export function useRosterSync(
  assistants: AssistantProfile[],
  applyRemote: (assistants: AssistantProfile[]) => void,
  identity: Identity | null
) {
  const hydrated = useRef(false);
  const skipNextSave = useRef(false);
  const remoteUpdatedAt = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const pending = useRef<{ assistants: AssistantProfile[]; identity: Identity } | null>(null);
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [updateAvailable, setUpdateAvailable] = useState<{ updatedBy: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const remote = await fetchRoster();
      if (cancelled) return;
      const localEditAt = loadRosterLocalEditAt();
      // 이 브라우저가 아직 서버에 반영되지 않은(=진행 중인) 편집을 갖고 있는 동안, 그보다
      // 오래된 서버 응답으로 되돌리지 않는다. 화면 전환 직후처럼 저장이 아직 끝나기 전에
      // 새로 마운트되는 경우를 방어한다. 이 경우 이미 localStorage 기반 낙관적 상태(별도
      // effect)가 반영돼 있으므로 그대로 둔다.
      const remoteIsStale = Boolean(localEditAt) && (!remote?.lastUpdatedAt || remote.lastUpdatedAt < localEditAt!);
      if (remote && remote.assistants.length && !remoteIsStale) {
        skipNextSave.current = true;
        applyRemote(remote.assistants);
        remoteUpdatedAt.current = remote.lastUpdatedAt;
      } else if (remote) {
        remoteUpdatedAt.current = remote.lastUpdatedAt;
      }
      hydrated.current = true;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    saveStoredRoster(assistants);
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (!identity) return;
    dirty.current = true;
    pending.current = { assistants, identity };
    markRosterEditedNow();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      saveTimer.current = null;
      dirty.current = false;
      setStatus("saving");
      const result = await saveRosterRequest(assistants, identity);
      if (result) {
        remoteUpdatedAt.current = result.updatedAt;
        setStatus("saved");
      } else {
        setStatus("error");
      }
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistants, identity]);

  // 아직 디바운스 대기 중인 저장이 있는 상태에서 창/탭을 전환하거나(visibilitychange),
  // 실제로 페이지를 벗어나거나(pagehide), "월간 편성 ↔ 기간 편성" 링크를 눌러 이 컴포넌트가
  // 언마운트되는 경우 모두 setTimeout이 취소되며 방금 입력한 내용이 저장되지 못하고 사라질
  // 수 있다. 세 경우 모두 즉시(keepalive) 강제로 흘려보낸다.
  useEffect(() => {
    function flush() {
      if (!dirty.current || !pending.current) return;
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      const { assistants: pendingAssistants, identity: pendingIdentity } = pending.current;
      dirty.current = false;
      fetch("/api/roster", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ assistants: pendingAssistants, actorName: pendingIdentity.name, actorRole: pendingIdentity.role })
      }).catch(() => {
        // 페이지 이탈 중 발생하는 실패는 표시할 화면이 이미 없으므로 조용히 무시한다.
      });
    }
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") flush();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flush);
      // Next.js <Link> 클라이언트 사이드 전환은 pagehide/visibilitychange 없이
      // 이 컴포넌트만 조용히 언마운트하므로, 언마운트 시에도 한 번 더 흘려보낸다.
      flush();
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(async () => {
      const remote = await fetchRoster();
      if (!remote?.lastUpdatedAt || !remote.lastUpdatedBy) return;
      if (remote.lastUpdatedAt !== remoteUpdatedAt.current && remote.lastUpdatedBy !== identity?.name) {
        setUpdateAvailable({ updatedBy: remote.lastUpdatedBy });
      }
    }, 20000);
    return () => clearInterval(timer);
  }, [identity?.name]);

  async function reloadFromServer() {
    const remote = await fetchRoster();
    if (remote) {
      skipNextSave.current = true;
      applyRemote(remote.assistants);
      remoteUpdatedAt.current = remote.lastUpdatedAt;
    }
    setUpdateAvailable(null);
  }

  return { status, updateAvailable, reloadFromServer };
}

export interface DraftPayload {
  settings: Record<string, unknown>;
  manualAssignments: AssignmentMap;
  summary: Record<string, unknown>;
}

export interface DraftInfo {
  settings: Record<string, unknown>;
  manualAssignments: AssignmentMap;
  summary: Record<string, unknown> | null;
  updatedBy: string;
  updatedAt: string;
}

async function fetchDraft(scopeKey: string): Promise<DraftInfo | null> {
  try {
    const res = await fetch(`/api/drafts?scope=${encodeURIComponent(scopeKey)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.draft) return null;
    return {
      settings: data.draft.settings ?? {},
      manualAssignments: data.draft.manual_assignments ?? {},
      summary: data.draft.summary ?? null,
      updatedBy: data.draft.updated_by,
      updatedAt: data.draft.updated_at
    };
  } catch {
    return null;
  }
}

async function saveDraftRequest(scopeKey: string, kind: "month" | "period", payload: DraftPayload, identity: Identity) {
  try {
    const res = await fetch("/api/drafts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scopeKey,
        kind,
        settings: payload.settings,
        manualAssignments: payload.manualAssignments,
        summary: payload.summary,
        actorName: identity.name,
        actorRole: identity.role
      })
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Tracks the latest server-saved draft for one scope (a month or a date range) so the
 * UI can show "who last saved this and what it looked like" without silently overwriting
 * whatever the current user is actively editing.
 */
export function useDraftPeek(scopeKey: string) {
  const [draft, setDraft] = useState<DraftInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const result = await fetchDraft(scopeKey);
      if (!cancelled) {
        setDraft(result);
        setLoading(false);
      }
    })();
    const timer = setInterval(async () => {
      const result = await fetchDraft(scopeKey);
      if (!cancelled) setDraft(result);
    }, 25000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [scopeKey]);

  return { draft, loading };
}

export function useDraftSave(scopeKey: string, kind: "month" | "period") {
  const [status, setStatus] = useState<SyncStatus>("idle");

  async function save(payload: DraftPayload, identity: Identity) {
    setStatus("saving");
    const ok = await saveDraftRequest(scopeKey, kind, payload, identity);
    setStatus(ok ? "saved" : "error");
    return ok;
  }

  return { status, save };
}

export interface PresenceRow {
  actor_name: string;
  actor_role: string | null;
  page: string;
  scope_key: string | null;
  last_seen_at: string;
}

export function usePresence(page: "month" | "period", scopeKey: string, identity: Identity | null) {
  const [online, setOnline] = useState<PresenceRow[]>([]);

  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    async function beat() {
      try {
        await fetch("/api/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actorName: identity!.name, actorRole: identity!.role, page, scopeKey })
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
        const res = await fetch(`/api/activity?limit=${limit}`, { cache: "no-store" });
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

export function postActivity(identity: Identity, action: string, detail?: string, scopeKey?: string) {
  fetch("/api/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actorName: identity.name, actorRole: identity.role, action, detail, scopeKey })
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

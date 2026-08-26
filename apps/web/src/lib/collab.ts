"use client";

import { useEffect, useRef, useState } from "react";
import type { AssignmentMap, AssistantProfile } from "@part-time/scheduler-core";
import type { Identity } from "@/lib/identity";
import { loadLocalEditAt, loadRosterLocalEditAt, markEditedNow, markRosterEditedNow, saveStoredRoster } from "@/lib/schedule-store";

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
  updatedBy: string | null;
  updatedAt: string | null;
}

async function fetchDraft(scopeKey: string): Promise<DraftInfo | null> {
  try {
    const res = await fetch(`/api/drafts?scope=${encodeURIComponent(scopeKey)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.draft) return { settings: {}, manualAssignments: {}, summary: null, updatedBy: null, updatedAt: null };
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

async function saveDraftRequest(scopeKey: string, kind: "month" | "period", payload: DraftPayload, identity: Identity): Promise<{ updatedAt: string } | null> {
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
    if (!res.ok) return null;
    return (await res.json()) as { updatedAt: string };
  } catch {
    return null;
  }
}

const AUTO_VERSION_INTERVAL_MS = 10 * 60 * 1000; // 활동 중인 스코프마다 최소 10분 간격으로만 자동 체크포인트를 남긴다.

function lastAutoVersionKey(scopeKey: string) {
  return `part-time:last-auto-version:${scopeKey}`;
}

/**
 * Creates an append-only checkpoint in schedule_versions so the "버전" list has real
 * history to show and restore, distinct from schedule_drafts (the single continuously
 * autosaved "current" row).
 */
export function createVersion(scopeKey: string, kind: "month" | "period", label: string, payload: DraftPayload, identity: Identity) {
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
      actorRole: identity.role
    })
  })
    .then((res) => res.ok)
    .catch(() => false);
}

function maybeAutoCheckpoint(scopeKey: string, kind: "month" | "period", payload: DraftPayload, identity: Identity) {
  if (typeof window === "undefined") return;
  try {
    const lastAt = window.localStorage.getItem(lastAutoVersionKey(scopeKey));
    if (lastAt && Date.now() - new Date(lastAt).getTime() < AUTO_VERSION_INTERVAL_MS) return;
    window.localStorage.setItem(lastAutoVersionKey(scopeKey), new Date().toISOString());
  } catch {
    // 자동 체크포인트 주기 기록에 실패해도 자동저장 자체는 계속 동작해야 하므로 무시한다.
  }
  createVersion(scopeKey, kind, "자동 저장", payload, identity);
}

/**
 * Keeps solver settings (attempts/seed/fairness rules) and manual shift overrides for one
 * scope (a month or a date range) in sync with the shared server copy — the same
 * hydrate → debounced autosave → flush-on-navigate-away pattern as useRosterSync, so a
 * schedule someone is actively shaping survives a reload or a screen switch instead of
 * always resetting to hardcoded defaults.
 */
export function useDraftSync(
  scopeKey: string,
  kind: "month" | "period",
  payload: DraftPayload,
  applyRemote: (settings: Record<string, unknown>, manualAssignments: AssignmentMap) => void,
  identity: Identity | null
) {
  const hydrated = useRef(false);
  const hydratedScope = useRef<string | null>(null);
  const skipNextSave = useRef(false);
  const remoteMeta = useRef<{ updatedAt: string | null; updatedBy: string | null }>({ updatedAt: null, updatedBy: null });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const pending = useRef<{ payload: DraftPayload; identity: Identity } | null>(null);
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [updateAvailable, setUpdateAvailable] = useState<{ updatedBy: string } | null>(null);
  // 하이드레이션이 끝난 시점을 렌더에 반영하기 위한 값. ref만 갱신하면(hydrated.current 등)
  // 리렌더가 일어나지 않아 아래 저장 effect가 다시 평가되지 않는다. 예를 들어 기간 화면의
  // 시작일을 바꾸면 scopeKey 자체가 바뀌는데, 그 직후 추가 편집 없이는 새 스코프에 대한
  // 하이드레이션 완료가 저장 effect를 다시 트리거하지 못해 방금 바꾼 값이 저장되지 않는다.
  const [hydrationTick, setHydrationTick] = useState(0);
  const payloadKey = JSON.stringify(payload);

  useEffect(() => {
    let cancelled = false;
    hydrated.current = false;
    setUpdateAvailable(null);
    (async () => {
      const remote = await fetchDraft(scopeKey);
      if (cancelled) return;
      const localEditAt = loadLocalEditAt(scopeKey);
      const remoteIsStale = Boolean(localEditAt) && (!remote?.updatedAt || remote.updatedAt < localEditAt!);
      if (remote && remote.updatedAt && !remoteIsStale) {
        skipNextSave.current = true;
        applyRemote(remote.settings, remote.manualAssignments);
        remoteMeta.current = { updatedAt: remote.updatedAt, updatedBy: remote.updatedBy };
      } else if (remote) {
        remoteMeta.current = { updatedAt: remote.updatedAt, updatedBy: remote.updatedBy };
      }
      hydrated.current = true;
      hydratedScope.current = scopeKey;
      setHydrationTick((tick) => tick + 1);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  useEffect(() => {
    if (!hydrated.current || hydratedScope.current !== scopeKey) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (!identity) return;
    dirty.current = true;
    pending.current = { payload, identity };
    markEditedNow(scopeKey);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      saveTimer.current = null;
      dirty.current = false;
      setStatus("saving");
      const result = await saveDraftRequest(scopeKey, kind, payload, identity);
      if (result) {
        remoteMeta.current = { updatedAt: result.updatedAt, updatedBy: identity.name };
        setStatus("saved");
        maybeAutoCheckpoint(scopeKey, kind, payload, identity);
      } else {
        setStatus("error");
      }
    }, 1000);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey, scopeKey, identity, hydrationTick]);

  useEffect(() => {
    function flush() {
      if (!dirty.current || !pending.current) return;
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      const { payload: pendingPayload, identity: pendingIdentity } = pending.current;
      dirty.current = false;
      fetch("/api/drafts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          scopeKey,
          kind,
          settings: pendingPayload.settings,
          manualAssignments: pendingPayload.manualAssignments,
          summary: pendingPayload.summary,
          actorName: pendingIdentity.name,
          actorRole: pendingIdentity.role
        })
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
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  useEffect(() => {
    const timer = setInterval(async () => {
      const remote = await fetchDraft(scopeKey);
      if (!remote?.updatedAt || !remote.updatedBy) return;
      if (remote.updatedAt !== remoteMeta.current.updatedAt && remote.updatedBy !== identity?.name) {
        setUpdateAvailable({ updatedBy: remote.updatedBy });
      }
    }, 25000);
    return () => clearInterval(timer);
  }, [scopeKey, identity?.name]);

  async function reloadFromServer() {
    const remote = await fetchDraft(scopeKey);
    if (remote) {
      skipNextSave.current = true;
      applyRemote(remote.settings, remote.manualAssignments);
      remoteMeta.current = { updatedAt: remote.updatedAt, updatedBy: remote.updatedBy };
    }
    setUpdateAvailable(null);
  }

  return { status, updateAvailable, reloadFromServer, remoteMeta: remoteMeta.current };
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
  const [versions, setVersions] = useState<ScheduleVersionRow[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/versions?scope=${encodeURIComponent(scopeKey)}&limit=${limit}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setVersions(data.versions ?? []);
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

  return { versions, refresh };
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

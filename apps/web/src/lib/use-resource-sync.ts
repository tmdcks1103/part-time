"use client";

import { fingerprint } from "./resource-fingerprint";
import { useEffect, useRef, useState } from "react";
import type { Identity } from "./identity";
import {
  acknowledge,
  readCache,
  writeCache,
  type CachedResource,
} from "./sync-cache";

export type SyncStatus =
  | "idle"
  | "loading"
  | "local"
  | "saving"
  | "saved"
  | "error"
  | "conflict";
export interface RemoteResource<T> {
  data: T | null;
  revision: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}
export interface SaveResult {
  revision: string;
  updatedAt: string;
}
// Share the queue across route unmounts so an old PUT cannot overtake a newer one.
const queues = new Map<string, Promise<unknown>>();

export function useResourceSync<T>({
  resourceKey,
  value,
  apply,
  read,
  write,
  identity,
}: {
  resourceKey: string;
  value: T;
  apply: (value: T) => void;
  read: () => Promise<RemoteResource<T>>;
  write: (entry: CachedResource<T>, identity: Identity) => Promise<SaveResult>;
  identity: Identity | null;
}) {
  const latest = useRef({ value, apply, read, write, identity });
  latest.current = { value, apply, read, write, identity };
  const sessionRef = useRef<{
    key: string;
    observed: string;
    entry: CachedResource<T>;
    ready: boolean;
    conflict: boolean;
    saving: boolean;
    flush: () => Promise<void>;
  } | null>(null);
  const [readyKey, setReadyKey] = useState("");
  const [status, setStatus] = useState<SyncStatus>("loading");
  const [updateAvailable, setUpdateAvailable] = useState<{
    updatedBy: string;
  } | null>(null);
  const [remoteMeta, setRemoteMeta] = useState<{
    updatedAt: string | null;
    updatedBy: string | null;
  }>({ updatedAt: null, updatedBy: null });
  const valueKey = fingerprint(value);

  useEffect(() => {
    let active = true;
    const scopedRead = latest.current.read;
    const scopedWrite = latest.current.write;
    const cached = readCache<T>(resourceKey);
    const session = {
      key: resourceKey,
      observed: fingerprint(cached?.data ?? latest.current.value),
      entry: cached ?? {
        data: latest.current.value,
        dirty: false,
        revision: null,
      },
      ready: false,
      conflict: false,
      saving: false,
      flush: async () => {},
    };
    sessionRef.current = session;
    setReadyKey("");
    setStatus("loading");
    setUpdateAvailable(null);
    setRemoteMeta({ updatedAt: null, updatedBy: null });
    if (cached) {
      latest.current.apply(cached.data);
      session.ready = true;
      setReadyKey(resourceKey);
      setStatus(cached.dirty ? "local" : "saved");
    }

    session.flush = async () => {
      const actor = latest.current.identity;
      if (
        !session.ready ||
        !session.entry.dirty ||
        !actor ||
        session.conflict ||
        session.saving
      )
        return;
      session.saving = true;
      if (active) setStatus("saving");
      const writeRequest = scopedWrite;
      let saved = false;
      const queued = (queues.get(resourceKey) ?? Promise.resolve())
        .catch(() => {})
        .then(async () => {
          // An earlier mount may have just acknowledged the same resource.
          const disk = readCache<T>(resourceKey);
          if (
            disk &&
            fingerprint(disk.data) !== fingerprint(session.entry.data)
          ) {
            session.conflict = true;
            if (active) {
              setStatus("conflict");
              setUpdateAvailable({ updatedBy: "다른 탭" });
            }
            return;
          }
          if (disk?.revision && disk.revision !== session.entry.revision)
            session.entry.revision = disk.revision;
          const sent = { ...session.entry };
          try {
            const result = await writeRequest(sent, actor);
            saved = true;
            acknowledge(resourceKey, sent.data, result.revision);
            session.entry = {
              ...session.entry,
              revision: result.revision,
              dirty: fingerprint(session.entry.data) !== fingerprint(sent.data),
            };
            // A newer mounted page owns its own cache; only acknowledge the sent data.
            if (active) {
              setRemoteMeta({
                updatedAt: result.updatedAt,
                updatedBy: actor.name,
              });
              setStatus(session.entry.dirty ? "local" : "saved");
            }
          } catch (error) {
            session.conflict =
              error instanceof Error && error.message === "conflict";
            if (active) {
              setStatus(session.conflict ? "conflict" : "error");
              if (session.conflict)
                setUpdateAvailable({ updatedBy: "다른 사용자" });
            }
          }
        });
      queues.set(resourceKey, queued);
      await queued;
      session.saving = false;
      if (queues.get(resourceKey) === queued) queues.delete(resourceKey);
      // Edits made while a PUT was in flight should not wait for the poll timer.
      if (saved && active && session.entry.dirty && !session.conflict) {
        void session.flush();
      }
    };

    async function hydrate() {
      try {
        await queues.get(resourceKey);
        const recovered = readCache<T>(resourceKey);
        if (
          recovered &&
          fingerprint(recovered.data) === fingerprint(session.entry.data)
        ) {
          session.entry = recovered;
        }
        const startedObserved = session.observed;
        const startedRevision = session.entry.revision;
        const remote = await scopedRead();
        if (!active) return;
        // Cached data can already be edited while GET is pending. Its response is
        // no longer authoritative once either a local edit or save has happened.
        if (
          session.observed !== startedObserved ||
          session.entry.revision !== startedRevision
        )
          return;
        setRemoteMeta({
          updatedAt: remote.updatedAt,
          updatedBy: remote.updatedBy,
        });
        // Dirty cache is a durable outbox, not a timestamp guess. Never discard it.
        if (session.entry.dirty) {
          if (session.entry.revision !== remote.revision) {
            // A response may have been lost after the server committed a save.
            if (fingerprint(remote.data) === fingerprint(session.entry.data)) {
              session.entry = {
                ...session.entry,
                dirty: false,
                revision: remote.revision,
              };
            } else {
              session.conflict = true;
              setUpdateAvailable({
                updatedBy: remote.updatedBy ?? "다른 사용자",
              });
            }
          }
        } else {
          const data = remote.data ?? session.entry.data;
          session.entry = { data, dirty: false, revision: remote.revision };
          session.observed = fingerprint(data);
          latest.current.apply(data);
        }
        writeCache(resourceKey, session.entry);
        setStatus(
          session.conflict
            ? "conflict"
            : session.entry.dirty
              ? "local"
              : "saved",
        );
      } catch {
        if (active) setStatus("error");
      } finally {
        if (active) {
          session.ready = true;
          setReadyKey(resourceKey);
        }
      }
    }
    void hydrate();
    const flush = () => {
      void session.flush();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", visibility);
    const timer = setInterval(async () => {
      if (document.visibilityState === "hidden" || !session.ready) return;
      if (session.entry.dirty) {
        await session.flush();
        return;
      }
      try {
        const remote = await scopedRead();
        if (active && remote.revision !== session.entry.revision) {
          setUpdateAvailable({ updatedBy: remote.updatedBy ?? "다른 사용자" });
        }
      } catch {
        /* Keep the current data when polling fails. */
      }
    }, 30000);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", visibility);
      flush();
    };
  }, [resourceKey]);

  useEffect(() => {
    const session = sessionRef.current;
    if (
      readyKey !== resourceKey ||
      !session?.ready ||
      session.key !== resourceKey
    )
      return;
    if (valueKey !== session.observed) {
      session.observed = valueKey;
      session.entry = { ...session.entry, data: value, dirty: true };
      const persisted = writeCache(resourceKey, session.entry);
      setStatus(persisted ? "local" : "error");
    }
    if (!session.entry.dirty || !identity) return;
    const timer = setTimeout(() => {
      void session.flush();
    }, 500);
    return () => clearTimeout(timer);
  }, [valueKey, resourceKey, readyKey, identity?.name]);

  async function reloadFromServer() {
    const session = sessionRef.current;
    if (!session || session.key !== resourceKey) return;
    if (
      session.entry.dirty &&
      !window.confirm(
        "이 기기의 미전송 편집 대신 서버 저장본을 불러올까요? 현재 편집은 복구용으로 보관됩니다.",
      )
    )
      return;
    try {
      const remote = await latest.current.read();
      if (sessionRef.current !== session) return;
      if (session.entry.dirty)
        writeCache(`${resourceKey}:recovery:${Date.now()}`, session.entry);
      const data = remote.data ?? value;
      session.entry = { data, dirty: false, revision: remote.revision };
      session.observed = fingerprint(data);
      session.conflict = false;
      writeCache(resourceKey, session.entry);
      latest.current.apply(data);
      setRemoteMeta({
        updatedAt: remote.updatedAt,
        updatedBy: remote.updatedBy,
      });
      setUpdateAvailable(null);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }
  async function retry() {
    const session = sessionRef.current;
    if (!session || session.key !== resourceKey) return;
    try {
      const remote = await latest.current.read();
      if (sessionRef.current !== session) return;
      if (!session.entry.dirty) {
        await reloadFromServer();
        return;
      }
      if (fingerprint(remote.data) === fingerprint(session.entry.data)) {
        session.entry = {
          ...session.entry,
          dirty: false,
          revision: remote.revision,
        };
        writeCache(resourceKey, session.entry);
        session.conflict = false;
        setStatus("saved");
        setUpdateAvailable(null);
      } else if (session.entry.revision === remote.revision) {
        session.conflict = false;
        await session.flush();
      } else {
        session.conflict = true;
        setStatus("conflict");
        setUpdateAvailable({ updatedBy: remote.updatedBy ?? "다른 사용자" });
      }
    } catch {
      setStatus("error");
    }
  }
  return {
    status,
    ready: readyKey === resourceKey,
    updateAvailable,
    reloadFromServer,
    retry,
    remoteMeta,
  };
}

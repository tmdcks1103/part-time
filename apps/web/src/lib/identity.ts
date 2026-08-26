"use client";

import { useEffect, useState } from "react";
import type { UserRole } from "@/lib/auth";

export interface Identity {
  name: string;
  role: UserRole;
}

export const suggestedIdentities: Identity[] = [
  { name: "근무표 담당자", role: "scheduler" },
  { name: "관리자", role: "admin" },
  { name: "김성훈", role: "assistant" }
];

const IDENTITY_STORAGE_KEY = "part-time:identity:v1";

function loadStoredIdentity(): Identity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.name === "string" && parsed.name.trim()) return parsed as Identity;
    return null;
  } catch {
    return null;
  }
}

function saveStoredIdentity(identity: Identity) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // localStorage 사용 불가 시에도 화면 동작은 계속되어야 하므로 조용히 무시한다.
  }
}

export function useIdentity() {
  const [identity, setIdentityState] = useState<Identity | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setIdentityState(loadStoredIdentity());
    setHydrated(true);
  }, []);

  function setIdentity(next: Identity) {
    setIdentityState(next);
    saveStoredIdentity(next);
  }

  return { identity, setIdentity, hydrated };
}

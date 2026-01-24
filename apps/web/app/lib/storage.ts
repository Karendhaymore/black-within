import type { Profile } from "./sampleProfiles";

//
// IMPORTANT:
// Set this in Render (web service env vars):
// NEXT_PUBLIC_API_BASE_URL = https://black-within-api.onrender.com
//
const API_BASE =
  (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");

function requireApiBase() {
  if (!API_BASE) throw new Error("NEXT_PUBLIC_API_BASE_URL is not set");
  return API_BASE;
}

function qs(params: Record<string, string>) {
  const usp = new URLSearchParams(params);
  return usp.toString();
}

export type Notification = {
  id: string;
  type: "like";
  message: string;
  createdAt: string;
};

// Notifications can stay local for now (not cross-device yet)
const NOTIFS_KEY = "bw_notifications";

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function getNotifications(): Notification[] {
  return safeParse<Notification[]>(localStorage.getItem(NOTIFS_KEY)) || [];
}

export function addNotification(n: Notification) {
  const current = getNotifications();
  localStorage.setItem(NOTIFS_KEY, JSON.stringify([n, ...current]));
}

// -------------------------------
// Helpers for current user in localStorage
// -------------------------------
const USER_ID_KEY = "bw_user_id";
const EMAIL_KEY = "bw_email";

export function getCurrentUserId(): string | null {
  return localStorage.getItem(USER_ID_KEY);
}

export function setCurrentUser(userId: string, email?: string) {
  localStorage.setItem(USER_ID_KEY, userId);
  if (email) localStorage.setItem(EMAIL_KEY, email);
}

export function clearCurrentUser() {
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(EMAIL_KEY);
}

// -------------------------------
// DB-backed Saved + Likes
// -------------------------------
type IdListResponse = { ids: string[] };

export async function getSavedIds(userId: string): Promise<string[]> {
  try {
    const url = `${requireApiBase()}/saved?${qs({ user_id: userId })}`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return [];
    const data = (await res.json()) as IdListResponse;
    return Array.isArray(data?.ids) ? data.ids : [];
  } catch {
    return [];
  }
}

export async function saveProfileId(userId: string, profileId: string) {
  await fetch(`${requireApiBase()}/saved`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, profile_id: profileId }),
  }).catch(() => {});
}

export async function removeSavedId(userId: string, profileId: string) {
  const url = `${requireApiBase()}/saved?${qs({ user_id: userId, profile_id: profileId })}`;
  await fetch(url, { method: "DELETE" }).catch(() => {});
}

export async function getLikes(userId: string): Promise<string[]> {
  try {
    const url = `${requireApiBase()}/likes?${qs({ user_id: userId })}`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return [];
    const data = (await res.json()) as IdListResponse;
    return Array.isArray(data?.ids) ? data.ids : [];
  } catch {
    return [];
  }
}

export async function likeProfile(userId: string, profileId: string) {
  await fetch(`${requireApiBase()}/likes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, profile_id: profileId }),
  }).catch(() => {});
}

// Still useful: remove saved profiles if they became unavailable
export function cleanupSavedIds(availableProfiles: Profile[], currentSavedIds: string[]) {
  const availableIds = new Set(availableProfiles.filter((p) => p.isAvailable).map((p) => p.id));
  return currentSavedIds.filter((id) => availableIds.has(id));
}

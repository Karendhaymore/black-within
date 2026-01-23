import type { Profile } from "./sampleProfiles";

const API = process.env.NEXT_PUBLIC_API_URL;

function requireApi() {
  if (!API) throw new Error("NEXT_PUBLIC_API_URL is not set");
  return API;
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

// DB-backed Saved + Likes
export async function getSavedIds(userId: string): Promise<string[]> {
  const res = await fetch(`${requireApi()}/saved?user_id=${encodeURIComponent(userId)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.ids || [];
}

export async function saveProfileId(userId: string, profileId: string) {
  await fetch(`${requireApi()}/saved`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, profile_id: profileId }),
  });
}

export async function removeSavedId(userId: string, profileId: string) {
  await fetch(
    `${requireApi()}/saved?user_id=${encodeURIComponent(userId)}&profile_id=${encodeURIComponent(profileId)}`,
    { method: "DELETE" }
  );
}

export async function getLikes(userId: string): Promise<string[]> {
  const res = await fetch(`${requireApi()}/likes?user_id=${encodeURIComponent(userId)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.ids || [];
}

export async function likeProfile(userId: string, profileId: string) {
  await fetch(`${requireApi()}/likes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, profile_id: profileId }),
  });
}

// Still useful: remove saved profiles if they became unavailable
export function cleanupSavedIds(availableProfiles: Profile[], currentSavedIds: string[]) {
  const availableIds = new Set(availableProfiles.filter((p) => p.isAvailable).map((p) => p.id));
  return currentSavedIds.filter((id) => availableIds.has(id));
}

import type { Profile } from "./sampleProfiles";

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const SAVED_KEY = "bw_saved_profiles";
const LIKES_KEY = "bw_likes";
const NOTIFS_KEY = "bw_notifications";

export function getSavedIds(): string[] {
  return safeParse<string[]>(localStorage.getItem(SAVED_KEY)) || [];
}

export function saveProfileId(id: string) {
  const ids = new Set(getSavedIds());
  ids.add(id);
  localStorage.setItem(SAVED_KEY, JSON.stringify(Array.from(ids)));
}

export function removeSavedId(id: string) {
  const ids = getSavedIds().filter((x) => x !== id);
  localStorage.setItem(SAVED_KEY, JSON.stringify(ids));
}

export function getLikes(): string[] {
  return safeParse<string[]>(localStorage.getItem(LIKES_KEY)) || [];
}

export function likeProfile(id: string) {
  const ids = new Set(getLikes());
  ids.add(id);
  localStorage.setItem(LIKES_KEY, JSON.stringify(Array.from(ids)));
}

export type Notification = {
  id: string;
  type: "like";
  message: string;
  createdAt: string;
};

export function getNotifications(): Notification[] {
  return safeParse<Notification[]>(localStorage.getItem(NOTIFS_KEY)) || [];
}

export function addNotification(n: Notification) {
  const current = getNotifications();
  localStorage.setItem(NOTIFS_KEY, JSON.stringify([n, ...current]));
}

// Auto-clean saved list if a profile is no longer available
export function cleanupSavedIds(availableProfiles: Profile[]) {
  const availableIds = new Set(availableProfiles.filter((p) => p.isAvailable).map((p) => p.id));
  const cleaned = getSavedIds().filter((id) => availableIds.has(id));
  localStorage.setItem(SAVED_KEY, JSON.stringify(cleaned));
}

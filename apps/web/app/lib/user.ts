export function getOrCreateUserId(): string {
  const key = "bw_user_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;

  const newId =
    (globalThis.crypto?.randomUUID?.() as string | undefined) ||
    `bw_${Math.random().toString(16).slice(2)}_${Date.now()}`;

  localStorage.setItem(key, newId);
  return newId;
}

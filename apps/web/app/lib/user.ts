const KEY = "bw_user_id";
const ANON_KEY = "bw_anon_user_id";
const EMAIL_KEY = "bw_email";

function uuid() {
  return crypto.randomUUID();
}

/**
 * Returns the best available user id:
 * - If logged in: bw_user_id (stable)
 * - If not: bw_anon_user_id (device-only)
 */
export function getOrCreateUserId(): string {
  const loggedIn = localStorage.getItem(KEY);
  if (loggedIn) return loggedIn;

  let anon = localStorage.getItem(ANON_KEY);
  if (!anon) {
    anon = uuid();
    localStorage.setItem(ANON_KEY, anon);
  }
  return anon;
}

/** True only when the person has completed the email code login */
export function isLoggedIn(): boolean {
  return !!localStorage.getItem(KEY);
}

/**
 * Log out = remove login identity AND the anonymous identity.
 * This prevents “ghost accounts” where old likes/saved keep appearing.
 */
export function logout() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(EMAIL_KEY);
  localStorage.removeItem(ANON_KEY);
}

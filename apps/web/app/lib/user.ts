const KEY = "bw_user_id";
const ANON_KEY = "bw_anon_user_id";

function uuid() {
  return crypto.randomUUID();
}

export function getOrCreateUserId(): string {
  // If logged in, this is the cross-device ID
  const loggedIn = localStorage.getItem(KEY);
  if (loggedIn) return loggedIn;

  // Otherwise use anonymous device-only ID
  let anon = localStorage.getItem(ANON_KEY);
  if (!anon) {
    anon = uuid();
    localStorage.setItem(ANON_KEY, anon);
  }
  return anon;
}

export function logout() {
  localStorage.removeItem(KEY);
}

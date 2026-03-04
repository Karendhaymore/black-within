// /lib/api.ts

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

/**
 * Convert API errors into clean, user-friendly messages.
 * This prevents showing raw JSON / trace details on screen.
 */
export async function getFriendlyApiError(res: Response): Promise<string> {
  // Handle the most common "real app" messages first:
  if (res.status === 401) return "Email or password is incorrect.";
  if (res.status === 403) return "Your account has been suspended.";
  if (res.status === 402) return "Messaging is currently locked.";
  if (res.status === 404) return "That item was not found.";
  if (res.status === 429) return "You’re doing that too fast. Please wait a moment and try again.";

  // Try reading API error response, but DON'T show it to users.
  // We only use it to recognize known backend detail codes.
  let detail = "";
  try {
    const data = await res.json();
    detail = typeof data?.detail === "string" ? data.detail : "";
  } catch {
    // ignore
  }

  // Optional: map backend "detail" codes to nicer user text
  if (detail === "banned") return "Your account has been suspended.";
  if (detail === "photo_required") return "Please add a profile photo before messaging.";

  // Default safe message
  return "Something went wrong. Please try again.";
}

/**
 * One wrapper to call your API.
 * Use this instead of fetch() directly.
 */
export async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const msg = await getFriendlyApiError(res);
    throw new Error(msg);
  }
  return res;
}

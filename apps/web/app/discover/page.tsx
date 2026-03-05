"use client";

import React, { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * IMPORTANT:
 * Your API returns profiles in this shape (camelCase fields):
 *   displayName, stateUS, identityPreview, isAvailable, tags (array)
 */

type ApiProfile = {
  id: string; // profile id
  owner_user_id: string; // user id of the owner (may exist, but not required for thread create)
  displayName: string;
  age: number;
  city: string;
  stateUS: string;
  photo?: string | null;
  identityPreview: string;
  intention: string;
  tags: string[];
  isAvailable: boolean;
};

type IdListResponse = { ids: string[] };
type ProfilesResponse = { items: ApiProfile[] };

// Matches /likes/status
type LikesStatusResponse = {
  likesLeft: number;
  limit: number;
  windowType: "daily_utc" | "test_seconds";
  resetsAtUTC: string; // ISO datetime string
};

// Threads/get-or-create response (support a few possible shapes)
type ThreadGetOrCreateResponse = {
  threadId?: string;
  thread_id?: string;
  id?: string;
};

// Messaging access response
type MessagingAccessResponse = {
  canMessage: boolean;
  isPremium: boolean;
  unlockedUntilUTC?: string | null;
  reason?: string | null;
};

// ✅ Profile gate response
type ProfileGateResponse = {
  hasPhoto?: boolean;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

function getLoggedInUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const uid = window.localStorage.getItem("bw_user_id");
    const loggedIn = window.localStorage.getItem("bw_logged_in") === "1";
    if (!loggedIn) return null;
    return uid && uid.trim() ? uid.trim() : null;
  } catch {
    return null;
  }
}

function toNiceString(x: any): string {
  if (x == null) return "";
  if (typeof x === "string") return x;
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}

/**
 * ✅ Friendly error messages (no ugly API dumps)
 */
async function getFriendlyApiError(res: Response): Promise<string> {
  const status = res.status;

  if (status === 401) return "Please log in again.";
  if (status === 403) return "Your account has been suspended.";
  if (status === 404) return "That item was not found.";
  if (status === 429) return "You are doing that too quickly. Please wait a moment and try again.";
  if (status === 402) return "Messaging is locked right now.";
  if (status >= 500) return "The server is having trouble right now. Please try again shortly.";

  // Try to extract a short detail, but avoid raw dumps
  try {
    const data = await res.json().catch(() => null);
    const detail = data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
  } catch {}

  return "Something went wrong. Please try again.";
}

async function apiGetSavedIds(userId: string): Promise<string[]> {
  const res = await fetch(`${API_BASE}/saved?user_id=${encodeURIComponent(userId)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await getFriendlyApiError(res));
  const json = (await res.json()) as IdListResponse;
  return Array.isArray(json?.ids) ? json.ids : [];
}

async function apiGetLikes(userId: string): Promise<string[]> {
  const res = await fetch(`${API_BASE}/likes?user_id=${encodeURIComponent(userId)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await getFriendlyApiError(res));
  const json = (await res.json()) as IdListResponse;
  return Array.isArray(json?.ids) ? json.ids : [];
}

async function apiGetLikesStatus(userId: string): Promise<LikesStatusResponse> {
  const res = await fetch(`${API_BASE}/likes/status?user_id=${encodeURIComponent(userId)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await getFriendlyApiError(res));
  return (await res.json()) as LikesStatusResponse;
}

async function apiSaveProfile(userId: string, profileId: string) {
  const res = await fetch(`${API_BASE}/saved`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, profile_id: profileId }),
  });
  if (!res.ok) throw new Error(await getFriendlyApiError(res));
}

async function apiUnsaveProfile(userId: string, profileId: string) {
  const url = `${API_BASE}/saved?user_id=${encodeURIComponent(userId)}&profile_id=${encodeURIComponent(profileId)}`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(await getFriendlyApiError(res));
}

async function apiLikeProfile(userId: string, profileId: string) {
  const res = await fetch(`${API_BASE}/likes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, profile_id: profileId }),
  });
  if (!res.ok) throw new Error(await getFriendlyApiError(res));
}

async function apiListProfiles(excludeOwnerUserId?: string): Promise<ApiProfile[]> {
  const url =
    `${API_BASE}/profiles?limit=50` +
    (excludeOwnerUserId ? `&exclude_owner_user_id=${encodeURIComponent(excludeOwnerUserId)}` : "");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(await getFriendlyApiError(res));

  const json = (await res.json()) as ProfilesResponse;
  return Array.isArray(json?.items) ? json.items : [];
}

type ThreadListItem = {
  thread_id: string;
  other_user_id: string;
  other_profile_id?: string | null;
  other_display_name?: string | null;
  other_photo?: string | null;
  last_message_text?: string | null;
  last_message_at?: string | null;
  updated_at?: string | null;
  unread_count?: number;
};

type ThreadsResponse = { items: ThreadListItem[] };

async function apiGetThreads(userId: string): Promise<ThreadListItem[]> {
  const res = await fetch(`${API_BASE}/threads?user_id=${encodeURIComponent(userId)}&limit=100`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await getFriendlyApiError(res));
  const json = (await res.json()) as ThreadsResponse;
  return Array.isArray(json?.items) ? json.items : [];
}

async function apiGetUnreadTotal(userId: string): Promise<number> {
  const items = await apiGetThreads(userId);
  return items.reduce((sum, t) => sum + (Number(t.unread_count) || 0), 0);
}

function startUnreadAutoRefresh(refreshFn: () => void) {
  const onFocus = () => refreshFn();
  const onVis = () => {
    if (document.visibilityState === "visible") refreshFn();
  };

  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVis);

  return () => {
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVis);
  };
}

async function apiGetOrCreateThread(userId: string, withProfileId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/threads/get-or-create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      with_profile_id: withProfileId,
    }),
  });

  if (!res.ok) throw new Error(await getFriendlyApiError(res));

  const data = (await res.json()) as ThreadGetOrCreateResponse;
  const threadId = data.threadId || data.thread_id || data.id || "";
  if (!threadId) throw new Error("Conversation could not be started. Please try again.");
  return threadId;
}

async function apiMessagingAccess(userId: string, threadId: string): Promise<MessagingAccessResponse> {
  const url =
    `${API_BASE}/messaging/access` +
    `?user_id=${encodeURIComponent(userId)}` +
    `&thread_id=${encodeURIComponent(threadId)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(await getFriendlyApiError(res));
  return (await res.json()) as MessagingAccessResponse;
}

async function apiProfileGate(userId: string): Promise<ProfileGateResponse> {
  const res = await fetch(`${API_BASE}/profiles/gate?user_id=${encodeURIComponent(userId)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await getFriendlyApiError(res));
  return (await res.json()) as ProfileGateResponse;
}

function formatResetHint(status: LikesStatusResponse | null) {
  if (!status?.resetsAtUTC) return "";
  const d = new Date(status.resetsAtUTC);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * ✅ Parse identityPreview into (culturalIdentity, spiritualFramework)
 * Expects text containing labels like:
 *  "Cultural Identity: Pan-African ... · Spiritual Framework: Hebrew Israelite"
 */
function parseIdentityPreview(preview: string): { culturalIdentity: string; spiritualFramework: string } {
  const text = (preview || "").replace(/\s+/g, " ").trim();

  const getField = (label: string) => {
    // Capture up to a separator dot, end, or next label
    const re = new RegExp(`${label}\\s*:\\s*([^·|]+?)(?=\\s*(?:·|\\||$))`, "i");
    const m = text.match(re);
    return (m?.[1] || "").trim();
  };

  const culturalIdentity = getField("Cultural Identity");
  const spiritualFramework = getField("Spiritual Framework");

  return { culturalIdentity, spiritualFramework };
}

/**
 * ✅ Tiny inline icons (no extra libraries needed)
 */
function Icon({
  name,
  size = 16,
}: {
  name: "user" | "bookmark" | "heart" | "bell" | "chat" | "logout" | "filter" | "spark";
  size?: number;
}) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 };
  switch (name) {
    case "user":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M20 21a8 8 0 0 0-16 0" />
          <circle cx="12" cy="8" r="4" />
        </svg>
      );
    case "bookmark":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "heart":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
      );
    case "chat":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        </svg>
      );
    case "logout":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
      );
    case "filter":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M22 3H2l8 9v7l4 2v-9z" />
        </svg>
      );
    case "spark":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 2l1.5 6L20 10l-6.5 2L12 18l-1.5-6L4 10l6.5-2z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function DiscoverPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string>("");

  const [gateLoading, setGateLoading] = useState(true);
  const [totalUnread, setTotalUnread] = useState(0);

  const [profiles, setProfiles] = useState<ApiProfile[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [likesStatus, setLikesStatus] = useState<LikesStatusResponse | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const [loadingProfiles, setLoadingProfiles] = useState<boolean>(true);
  const [loadingSets, setLoadingSets] = useState<boolean>(true);
  const [loadingLikesStatus, setLoadingLikesStatus] = useState<boolean>(true);

  const [intentionFilter, setIntentionFilter] = useState<string>("All");
  const [culturalIdentityFilter, setCulturalIdentityFilter] = useState<string>("All");
  const [spiritualFrameworkFilter, setSpiritualFrameworkFilter] = useState<string>("All");

  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const resetTimerRef = useRef<number | null>(null);

  const availableProfiles = useMemo(() => profiles.filter((p) => p.isAvailable), [profiles]);
  const availableProfileIds = useMemo(() => new Set(availableProfiles.map((p) => p.id)), [availableProfiles]);

  const intentionOptions = useMemo(() => {
    const set = new Set<string>();
    availableProfiles.forEach((p) => set.add(p.intention));
    return ["All", ...Array.from(set).sort()];
  }, [availableProfiles]);

  const culturalIdentityOptions = useMemo(
    () => [
      "All",
      "African-Centered",
      "Pan-African",
      "Ancestrally Rooted",
      "Culturally Sovereign",
      "Black (Conscious Use)",
      "African American",
    ],
    []
  );

  const spiritualFrameworkOptions = useMemo(
    () => [
      "All",
      "Afrocentric Spirituality",
      "Dogon",
      "Kemetic Philosophy",
      "Ubuntu",
      "Sankofa",
      "Ifa / Orisha Traditions (Yoruba)",
      "Vodun / Vodou",
      "Hoodoo / Rootwork",
      "Hebrew Israelite",
      "Candomblé",
      "Obeah",
      "Pan African Spiritual Movements",
      "African-Centered Holistic Healing",
      "Bible Based Christian",
      "Ancestral Veneration Systems",
      "Liberated Christianity",
      "Islam",
      "New Age Spirituality",
      "Afrofuturist Spirituality",
      "Metaphysical Science (African-centered variants)",
      "Quantum Spirituality",
    ],
    []
  );

  const filteredProfiles = useMemo(() => {
    return availableProfiles.filter((p) => {
      const intentionMatch = intentionFilter === "All" || p.intention === intentionFilter;

      const parsed = parseIdentityPreview(p.identityPreview || "");
      const ci = parsed.culturalIdentity;
      const sf = parsed.spiritualFramework;

      const culturalMatch = culturalIdentityFilter === "All" || ci === culturalIdentityFilter;
      const spiritualMatch = spiritualFrameworkFilter === "All" || sf === spiritualFrameworkFilter;

      return intentionMatch && culturalMatch && spiritualMatch;
    });
  }, [availableProfiles, intentionFilter, culturalIdentityFilter, spiritualFrameworkFilter]);

  function showToast(msg: any) {
    setToast(typeof msg === "string" ? msg : toNiceString(msg));
    window.setTimeout(() => setToast(null), 2400);
  }

  function getInitials(displayName: string) {
    return (displayName || "")
      .trim()
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  async function refreshSavedAndLikes(uid: string) {
    try {
      setApiError(null);
      setLoadingSets(true);

      const [saved, likes] = await Promise.all([apiGetSavedIds(uid), apiGetLikes(uid)]);

      setSavedIds(saved.filter((id) => availableProfileIds.has(id)));
      setLikedIds(likes.filter((id) => availableProfileIds.has(id)));
    } catch (e: any) {
      setApiError(toNiceString(e?.message || e));
    } finally {
      setLoadingSets(false);
    }
  }

  async function refreshLikesStatus(uid: string) {
    try {
      setLoadingLikesStatus(true);
      const status = await apiGetLikesStatus(uid);
      setLikesStatus(status);

      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }

      const resetAt = new Date(status.resetsAtUTC).getTime();
      const now = Date.now();
      const msUntilReset = resetAt - now;

      if (Number.isFinite(msUntilReset) && msUntilReset > 0 && msUntilReset < 24 * 60 * 60 * 1000) {
        resetTimerRef.current = window.setTimeout(() => {
          refreshLikesStatus(uid).catch(() => {});
        }, msUntilReset + 1200);
      }
    } catch {
      setLikesStatus(null);
    } finally {
      setLoadingLikesStatus(false);
    }
  }

  function logout() {
    try {
      window.localStorage.setItem("bw_logged_in", "0");
      try {
        window.localStorage.removeItem("bw_session_token");
      } catch {}
    } catch {}

    showToast("Logged out.");
    window.setTimeout(() => {
      window.location.href = "/auth";
    }, 400);
  }

  async function refreshUnread(uid: string) {
    try {
      const total = await apiGetUnreadTotal(uid);
      setTotalUnread(total);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    const uid = getLoggedInUserId();
    if (!uid) {
      router.replace("/auth/login");
      return;
    }

    setUserId(uid);

    (async () => {
      try {
        setGateLoading(true);
        const gate = await apiProfileGate(uid);
        if (!gate?.hasPhoto) {
          router.replace("/profile?reason=photo_required");
          return;
        }
      } catch {
        // fail-open
      } finally {
        setGateLoading(false);
      }

      try {
        setApiError(null);
        setLoadingProfiles(true);

        const items = await apiListProfiles(uid);
        setProfiles(items);
      } catch (e: any) {
        setApiError(toNiceString(e?.message || e));
        setProfiles([]);
      } finally {
        setLoadingProfiles(false);
      }

      await Promise.all([refreshSavedAndLikes(uid), refreshLikesStatus(uid)]);
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (!userId) return;

    const cleanup = startUnreadAutoRefresh(() => refreshUnread(userId));
    refreshUnread(userId);

    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    refreshSavedAndLikes(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableProfileIds]);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };
  }, []);

  async function onToggleSave(p: ApiProfile) {
    if (!userId) return;

    const currentlySaved = savedIds.includes(p.id);
    const prev = savedIds;

    setSavedIds((curr) => (curr.includes(p.id) ? curr.filter((x) => x !== p.id) : [p.id, ...curr]));

    try {
      if (currentlySaved) {
        await apiUnsaveProfile(userId, p.id);
        showToast("Removed from Saved Profiles.");
      } else {
        await apiSaveProfile(userId, p.id);
        showToast("Saved. You can view it later in Saved Profiles.");
      }
      await refreshSavedAndLikes(userId);
    } catch (e: any) {
      setSavedIds(prev);
      const msg = toNiceString(e?.message || e) || "Could not update saved status right now.";
      setApiError(msg);
      showToast(msg);
    }
  }

  async function onLike(p: ApiProfile) {
    if (!userId) return;
    if (likedIds.includes(p.id)) return;

    if (likesStatus && likesStatus.likesLeft <= 0) {
      showToast(
        likesStatus.windowType === "test_seconds"
          ? `Daily like limit reached (${likesStatus.limit}). Resets soon.`
          : `Daily like limit reached (${likesStatus.limit}). Try again tomorrow.`
      );
      return;
    }

    const prev = likedIds;
    setLikedIds((curr) => (curr.includes(p.id) ? curr : [p.id, ...curr]));

    try {
      await apiLikeProfile(userId, p.id);
      await Promise.all([refreshSavedAndLikes(userId), refreshLikesStatus(userId)]);
      showToast("Like sent.");
    } catch (e: any) {
      setLikedIds(prev);
      const msg = toNiceString(e?.message || e) || "Like failed.";
      setApiError(msg);
      showToast(msg);
      refreshLikesStatus(userId).catch(() => {});
    }
  }

  async function onMessage(p: ApiProfile) {
    if (!userId) return;

    try {
      setApiError(null);
      showToast("Opening chat…");

      const threadId = await apiGetOrCreateThread(userId, p.id);

      let locked = false;
      try {
        const access = await apiMessagingAccess(userId, threadId);
        locked = !access.canMessage;
        if (locked && access.reason) showToast(access.reason);
      } catch {}

      window.location.href =
        `/messages?threadId=${encodeURIComponent(threadId)}` +
        `&with=${encodeURIComponent(p.displayName)}` +
        `&withProfileId=${encodeURIComponent(p.id)}` +
        (locked ? "&locked=1" : "");
    } catch (e: any) {
      const msg = toNiceString(e?.message || e) || "Could not start a chat right now.";
      setApiError(msg);
      showToast(msg);
    }
  }

  const navBtnStyle: CSSProperties = {
    padding: "0.6rem 0.9rem",
    borderRadius: 999,
    textDecoration: "none",
    color: "inherit",
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(0,0,0,0.10)",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 800,
    boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
    backdropFilter: "blur(8px)",
  };

  const pillBtn: CSSProperties = {
    padding: "0.65rem 1rem",
    border: "1px solid rgba(10,84,17,0.35)",
    borderRadius: 999,
    textDecoration: "none",
    color: "#0a5411",
    background: "rgba(255,255,255,0.92)",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 900,
    boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
    backdropFilter: "blur(8px)",
  };

  const pillBtnGlow: React.CSSProperties = {
    ...pillBtn,
    background: "linear-gradient(135deg, rgba(10,84,17,0.95), rgba(10,84,17,0.80))",
    border: "1px solid rgba(10,84,17,0.35)",
    color: "white",
    boxShadow: "0 0 10px rgba(10,85,0,0.35), 0 10px 24px rgba(0,0,0,0.14)",
  };

  const messagesStyle = totalUnread > 0 ? pillBtnGlow : pillBtn;
  const resetHint = likesStatus ? formatResetHint(likesStatus) : "";

  if (gateLoading) {
    return <div style={{ padding: 24, fontWeight: 700 }}>Loading…</div>;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "1.5rem",
        display: "grid",
        placeItems: "start center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 1100 }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h1 style={{ margin: 0 }}>Discover</h1>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.85)",
                  border: "1px solid rgba(0,0,0,0.10)",
                  boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
                  fontWeight: 900,
                  fontSize: 12,
                  color: "#2a2a2a",
                }}
              >
                <Icon name="spark" size={14} /> Curated
              </span>
            </div>

            <div style={{ fontSize: 13, color: "#444" }}>
              {loadingLikesStatus ? (
                <span>Likes today: loading…</span>
              ) : likesStatus ? (
                <span>
                  Likes left: <strong>{likesStatus.likesLeft}</strong> / <strong>{likesStatus.limit}</strong>
                  {resetHint ? (
                    <span style={{ color: "#666" }}>
                      {" "}
                      · resets {likesStatus.windowType === "test_seconds" ? "at" : "after"} <strong>{resetHint}</strong>
                    </span>
                  ) : null}
                </span>
              ) : (
                <span>Likes today: unavailable</span>
              )}
            </div>
          </div>

          {/* ✅ Modern pill buttons w/ icons */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Link href="/profile" style={navBtnStyle}>
              <Icon name="user" /> My Profile
            </Link>
            <Link href="/saved" style={navBtnStyle}>
              <Icon name="bookmark" /> Saved
            </Link>
            <Link href="/liked" style={navBtnStyle}>
              <Icon name="heart" /> Liked
            </Link>
            <Link href="/notifications" style={navBtnStyle}>
              <Icon name="bell" /> Notifications
            </Link>

            <Link href="/inbox" style={messagesStyle}>
              <Icon name="chat" /> Messages
              {totalUnread > 0 && (
                <span
                  style={{
                    marginLeft: 2,
                    fontSize: 12,
                    fontWeight: 900,
                    background: "white",
                    color: "#0a5411",
                    borderRadius: 999,
                    padding: "2px 7px",
                    lineHeight: "18px",
                    boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
                  }}
                >
                  {totalUnread}
                </span>
              )}
            </Link>

            <button onClick={logout} style={{ ...navBtnStyle, cursor: "pointer" }}>
              <Icon name="logout" /> Log out
            </button>
          </div>
        </div>

        {/* Error */}
        {apiError && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 14,
              border: "1px solid rgba(180, 30, 30, 0.25)",
              background: "rgba(255, 246, 246, 0.92)",
              color: "#7a1b1b",
              whiteSpace: "pre-wrap",
              boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
              backdropFilter: "blur(10px)",
            }}
          >
            <strong>Message:</strong> {apiError}
          </div>
        )}

        {/* Filters */}
        <div
          style={{
            marginTop: 14,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
            padding: 12,
            borderRadius: 16,
            border: "1px solid rgba(0,0,0,0.10)",
            background: "rgba(255,255,255,0.86)",
            boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
            backdropFilter: "blur(10px)",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 900, color: "#2a2a2a" }}>
            <Icon name="filter" /> Filters
          </span>

          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            Intention:
            <select value={intentionFilter} onChange={(e) => setIntentionFilter(e.target.value)}>
              {intentionOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            Cultural Identity:
            <select value={culturalIdentityFilter} onChange={(e) => setCulturalIdentityFilter(e.target.value)}>
              {culturalIdentityOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            Spiritual Framework:
            <select value={spiritualFrameworkFilter} onChange={(e) => setSpiritualFrameworkFilter(e.target.value)}>
              {spiritualFrameworkOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={() => {
              if (!userId) return;
              refreshLikesStatus(userId).catch(() => {});
              showToast("Refreshed likes status.");
            }}
            style={{
              padding: "0.55rem 0.85rem",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 999,
              background: "white",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 900,
              boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
            }}
          >
            Refresh likes
          </button>
        </div>

        {/* Grid */}
        <div style={{ marginTop: 18 }}>
          {loadingProfiles ? (
            <div
              style={{
                padding: 14,
                border: "1px solid rgba(0,0,0,0.10)",
                borderRadius: 16,
                background: "rgba(255,255,255,0.86)",
                boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
                backdropFilter: "blur(10px)",
              }}
            >
              Loading profiles…
            </div>
          ) : filteredProfiles.length === 0 ? (
            <div
              style={{
                padding: 14,
                border: "1px solid rgba(0,0,0,0.10)",
                borderRadius: 16,
                background: "rgba(255,255,255,0.86)",
                boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
                backdropFilter: "blur(10px)",
              }}
            >
              No profiles match your filters yet.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 16 }}>
              {filteredProfiles.map((p) => {
                const isSaved = savedIds.includes(p.id);
                const isLiked = likedIds.includes(p.id);

                const isLimitReached = !loadingLikesStatus && !!likesStatus && likesStatus.likesLeft <= 0;
                const likeDisabled = isLiked || loadingLikesStatus || isLimitReached;
                const likeLabel = isLiked ? "Liked" : isLimitReached ? "Limit reached" : "Like";

                return (
                  <div
                    key={p.id}
                    className="card"
                    style={{
                      borderRadius: 18,
                      overflow: "hidden",
                      border: "1px solid rgba(0,0,0,0.10)",
                      background: "rgba(255,255,255,0.90)",
                      boxShadow: "0 14px 34px rgba(0,0,0,0.12)",
                      backdropFilter: "blur(10px)",
                    }}
                  >
                    {/* BIG PHOTO */}
                    <Link href={`/profiles/${p.id}`} style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                      {p.photo && !brokenImages[p.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.photo}
                          alt={p.displayName}
                          style={{
                            width: "100%",
                            height: 320,
                            objectFit: "cover",
                            display: "block",
                            background: "#f2f2f2",
                          }}
                          onError={() => setBrokenImages((curr) => ({ ...curr, [p.id]: true }))}
                        />
                      ) : (
                        <div
                          style={{
                            width: "100%",
                            height: 320,
                            background: "#f2f2f2",
                            display: "grid",
                            placeItems: "center",
                            fontSize: 44,
                            fontWeight: 900,
                            color: "#444",
                          }}
                        >
                          {getInitials(p.displayName)}
                        </div>
                      )}
                    </Link>

                    {/* NAME + LOCATION UNDER PHOTO */}
                    <div style={{ padding: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                        <div style={{ fontWeight: 900, fontSize: 18, lineHeight: 1.1 }}>{p.displayName}</div>
                        <div style={{ color: "#666", fontWeight: 800 }}>{p.age}</div>
                      </div>

                      <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
                        {p.city}, {p.stateUS}
                      </div>

                      <div style={{ marginTop: 10, fontSize: 13 }}>
                        <strong>Identity:</strong> {p.identityPreview}
                      </div>

                      <div style={{ marginTop: 8, fontSize: 13 }}>
                        <strong>Intention:</strong> {p.intention}
                      </div>

                      {Array.isArray(p.tags) && p.tags.length > 0 && (
                        <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {p.tags.slice(0, 10).map((t, idx) => (
                            <span
                              key={`${p.id}-tag-${idx}`}
                              style={{
                                fontSize: 12,
                                padding: "4px 8px",
                                border: "1px solid rgba(0,0,0,0.12)",
                                borderRadius: 999,
                                background: "rgba(250,250,250,0.9)",
                              }}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* ACTIONS (kept here, upgraded to pill buttons w/ icons) */}
                      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <Link href={`/profiles/${p.id}`} style={pillBtn}>
                          <Icon name="user" /> View
                        </Link>

                        <button
                          onClick={() => onToggleSave(p)}
                          disabled={loadingSets}
                          style={{
                            ...pillBtn,
                            cursor: loadingSets ? "not-allowed" : "pointer",
                            opacity: loadingSets ? 0.8 : 1,
                          }}
                        >
                          <Icon name="bookmark" /> {isSaved ? "Unsave" : "Save"}
                        </button>

                        <button
                          onClick={() => onLike(p)}
                          disabled={likeDisabled}
                          style={{
                            ...pillBtn,
                            cursor: likeDisabled ? "not-allowed" : "pointer",
                            opacity: likeDisabled ? 0.7 : 1,
                          }}
                        >
                          <Icon name="heart" /> {likeLabel}
                        </button>

                        <button
                          onClick={() => onMessage(p)}
                          disabled={loadingSets}
                          style={{
                            ...pillBtn,
                            cursor: loadingSets ? "not-allowed" : "pointer",
                            opacity: loadingSets ? 0.8 : 1,
                          }}
                        >
                          <Icon name="chat" /> Message
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div
            style={{
              position: "fixed",
              bottom: 18,
              left: "50%",
              transform: "translateX(-50%)",
              padding: "10px 14px",
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "rgba(255,255,255,0.95)",
              boxShadow: "0 10px 28px rgba(0,0,0,0.18)",
              zIndex: 9999,
              whiteSpace: "pre-wrap",
              maxWidth: 900,
              backdropFilter: "blur(10px)",
            }}
          >
            {toast}
          </div>
        )}
      </div>
    </main>
  );
}

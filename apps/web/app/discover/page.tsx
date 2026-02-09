"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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

async function safeReadErrorDetail(res: Response): Promise<string> {
  // FastAPI often returns: { detail: [...] } where detail is an array of objects
  try {
    const data = await res.json();
    if (data?.detail != null) {
      if (typeof data.detail === "string") return data.detail;
      return toNiceString(data.detail);
    }
    return toNiceString(data);
  } catch {}
  try {
    const text = await res.text();
    if (text) return text;
  } catch {}
  return `Request failed (${res.status}).`;
}

async function apiGetSavedIds(userId: string): Promise<string[]> {
  const res = await fetch(`${API_BASE}/saved?user_id=${encodeURIComponent(userId)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await safeReadErrorDetail(res));
  const json = (await res.json()) as IdListResponse;
  return Array.isArray(json?.ids) ? json.ids : [];
}

async function apiGetLikes(userId: string): Promise<string[]> {
  const res = await fetch(`${API_BASE}/likes?user_id=${encodeURIComponent(userId)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await safeReadErrorDetail(res));
  const json = (await res.json()) as IdListResponse;
  return Array.isArray(json?.ids) ? json.ids : [];
}

async function apiGetLikesStatus(userId: string): Promise<LikesStatusResponse> {
  const res = await fetch(`${API_BASE}/likes/status?user_id=${encodeURIComponent(userId)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await safeReadErrorDetail(res));
  return (await res.json()) as LikesStatusResponse;
}

async function apiSaveProfile(userId: string, profileId: string) {
  const res = await fetch(`${API_BASE}/saved`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, profile_id: profileId }),
  });
  if (!res.ok) throw new Error(await safeReadErrorDetail(res));
}

async function apiUnsaveProfile(userId: string, profileId: string) {
  const url = `${API_BASE}/saved?user_id=${encodeURIComponent(
    userId
  )}&profile_id=${encodeURIComponent(profileId)}`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(await safeReadErrorDetail(res));
}

async function apiLikeProfile(userId: string, profileId: string) {
  const res = await fetch(`${API_BASE}/likes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, profile_id: profileId }),
  });
  if (!res.ok) throw new Error(await safeReadErrorDetail(res));
}

async function apiListProfiles(excludeOwnerUserId?: string): Promise<ApiProfile[]> {
  const url =
    `${API_BASE}/profiles?limit=50` +
    (excludeOwnerUserId
      ? `&exclude_owner_user_id=${encodeURIComponent(excludeOwnerUserId)}`
      : "");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(await safeReadErrorDetail(res));

  const json = (await res.json()) as ProfilesResponse;
  return Array.isArray(json?.items) ? json.items : [];
}

/**
 * ✅ Threads API: POST /threads/get-or-create
 * Your backend error showed it expects: { user_id, with_profile_id }
 */
async function apiGetOrCreateThread(userId: string, withProfileId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/threads/get-or-create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      with_profile_id: withProfileId,
    }),
  });

  if (!res.ok) throw new Error(await safeReadErrorDetail(res));

  const data = (await res.json()) as ThreadGetOrCreateResponse;
  const threadId = data.threadId || data.thread_id || data.id || "";
  if (!threadId) throw new Error("Thread created, but no thread id returned.");
  return threadId;
}

/**
 * ✅ Messaging paywall check:
 * GET /messaging/access?user_id=...&thread_id=...
 */
async function apiMessagingAccess(userId: string, threadId: string): Promise<MessagingAccessResponse> {
  const url =
    `${API_BASE}/messaging/access` +
    `?user_id=${encodeURIComponent(userId)}` +
    `&thread_id=${encodeURIComponent(threadId)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(await safeReadErrorDetail(res));
  return (await res.json()) as MessagingAccessResponse;
}

function formatResetHint(status: LikesStatusResponse | null) {
  if (!status?.resetsAtUTC) return "";
  const d = new Date(status.resetsAtUTC);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function DiscoverPage() {
  const router = useRouter();

  useEffect(() => {
    const loggedIn = localStorage.getItem("bw_logged_in");
    if (!loggedIn) {
      router.replace("/auth/login");
    }
  }, [router]);

  const [userId, setUserId] = useState<string>("");

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
  const [tagFilter, setTagFilter] = useState<string>("All");
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const resetTimerRef = useRef<number | null>(null);

  const availableProfiles = useMemo(() => profiles.filter((p) => p.isAvailable), [profiles]);

  const availableProfileIds = useMemo(
    () => new Set(availableProfiles.map((p) => p.id)),
    [availableProfiles]
  );

  const intentionOptions = useMemo(() => {
    const set = new Set<string>();
    availableProfiles.forEach((p) => set.add(p.intention));
    return ["All", ...Array.from(set).sort()];
  }, [availableProfiles]);

  const tagOptions = useMemo(() => {
    const set = new Set<string>();
    availableProfiles.forEach((p) => (p.tags || []).forEach((t) => set.add(t)));
    return ["All", ...Array.from(set).sort()];
  }, [availableProfiles]);

  const filteredProfiles = useMemo(() => {
    return availableProfiles.filter((p) => {
      const intentionMatch = intentionFilter === "All" || p.intention === intentionFilter;
      const tags = Array.isArray(p.tags) ? p.tags : [];
      const tagMatch = tagFilter === "All" || tags.includes(tagFilter);
      return intentionMatch && tagMatch;
    });
  }, [availableProfiles, intentionFilter, tagFilter]);

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

  // ✅ REPLACED: the first "load profiles on page load" useEffect
  useEffect(() => {
    const uid = getLoggedInUserId();

    // If not logged in, send them to login (avoid loops with /auth redirecting to /discover)
    if (!uid) {
      window.location.href = "/auth/login";
      return;
    }

    setUserId(uid);

    (async () => {
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

    // no deps: run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setApiError(toNiceString(e?.message || e));
      showToast("Could not update saved status right now.");
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

  // ✅ Message button handler (correct: uses profile id for with_profile_id)
  async function onMessage(p: ApiProfile) {
    if (!userId) return;

    try {
      setApiError(null);
      showToast("Opening chat…");

      // 1) Create thread based on PROFILE id (backend expects with_profile_id)
      const threadId = await apiGetOrCreateThread(userId, p.id);

      // 2) Optional access check (if it throws, we still navigate)
      let locked = false;
      try {
        const access = await apiMessagingAccess(userId, threadId);
        locked = !access.canMessage;
        if (locked && access.reason) showToast(access.reason);
      } catch {
        // ignore access check errors for now
      }

      // 3) Navigate to chat
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
    padding: "0.65rem 1rem",
    border: "1px solid #ccc",
    borderRadius: 10,
    textDecoration: "none",
    color: "inherit",
    background: "white",
    display: "inline-block",
  };

  const resetHint = likesStatus ? formatResetHint(likesStatus) : "";

  return (
    <main style={{ minHeight: "100vh", padding: "2rem", display: "grid", placeItems: "start center" }}>
      <div style={{ width: "100%", maxWidth: 1100 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h1 style={{ margin: 0 }}>Discover</h1>

            <div style={{ fontSize: 13, color: "#555" }}>
              {loadingLikesStatus ? (
                <span>Likes today: loading…</span>
              ) : likesStatus ? (
                <span>
                  Likes left: <strong>{likesStatus.likesLeft}</strong> / <strong>{likesStatus.limit}</strong>
                  {resetHint ? (
                    <span style={{ color: "#777" }}>
                      {" "}
                      · resets {likesStatus.windowType === "test_seconds" ? "at" : "after"}{" "}
                      <strong>{resetHint}</strong>
                    </span>
                  ) : null}
                </span>
              ) : (
                <span>Likes today: unavailable</span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Link href="/profile" style={navBtnStyle}>
              My Profile
            </Link>
            <Link href="/saved" style={navBtnStyle}>
              Saved
            </Link>
            <Link href="/liked" style={navBtnStyle}>
              Liked
            </Link>
            <Link href="/notifications" style={navBtnStyle}>
              Notifications
            </Link>

            {/* Note: /messages without a threadId will show the "Missing threadId" screen (expected for now). */}
            <Link href="/inbox" style={pillBtn}>Messages</Link>

            <button onClick={logout} style={{ ...navBtnStyle, cursor: "pointer" }}>
              Log out
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 13, color: "#666" }}>
          <div>
            <strong>API:</strong> {API_BASE}
          </div>
          <div>
            <strong>Profiles loaded:</strong> {profiles.length} {loadingProfiles ? "(loading…)" : ""}
          </div>
          <div>
            <strong>Saved/likes loading:</strong> {loadingSets ? "yes" : "no"}
          </div>
        </div>

        {apiError && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 12,
              border: "1px solid #f2c7c7",
              background: "#fff7f7",
              color: "#7a1b1b",
              whiteSpace: "pre-wrap",
            }}
          >
            <strong>Message:</strong> {apiError}
          </div>
        )}

        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
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
            Tag:
            <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
              {tagOptions.map((opt) => (
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
              padding: "0.5rem 0.8rem",
              border: "1px solid #ccc",
              borderRadius: 10,
              background: "white",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Refresh likes
          </button>
        </div>

        <div style={{ marginTop: 18 }}>
          {loadingProfiles ? (
            <div style={{ padding: 14, border: "1px solid #eee", borderRadius: 12 }}>Loading profiles…</div>
          ) : filteredProfiles.length === 0 ? (
            <div style={{ padding: 14, border: "1px solid #eee", borderRadius: 12 }}>
              No profiles match your filters yet.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
              {filteredProfiles.map((p) => {
                const isSaved = savedIds.includes(p.id);
                const isLiked = likedIds.includes(p.id);

                const isLimitReached = !loadingLikesStatus && !!likesStatus && likesStatus.likesLeft <= 0;
                const likeDisabled = isLiked || loadingLikesStatus || isLimitReached;
                const likeLabel = isLiked ? "Liked" : isLimitReached ? "Limit reached" : "Like";

                return (
                  <div key={p.id} style={{ border: "1px solid #eee", borderRadius: 14, padding: 14, background: "white" }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      {p.photo && !brokenImages[p.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.photo}
                          alt={p.displayName}
                          width={56}
                          height={56}
                          style={{ borderRadius: 14, objectFit: "cover" }}
                          onError={() => setBrokenImages((curr) => ({ ...curr, [p.id]: true }))}
                        />
                      ) : (
                        <div
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: 14,
                            border: "1px solid #ddd",
                            display: "grid",
                            placeItems: "center",
                            fontWeight: 700,
                          }}
                        >
                          {getInitials(p.displayName)}
                        </div>
                      )}

                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ fontWeight: 800, fontSize: 18 }}>{p.displayName}</div>
                          <div style={{ color: "#666" }}>{p.age}</div>
                        </div>
                        <div style={{ marginTop: 4, color: "#666", fontSize: 13 }}>
                          {p.city}, {p.stateUS}
                        </div>
                      </div>
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
                              border: "1px solid #ddd",
                              borderRadius: 999,
                              background: "#fafafa",
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}

                    <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <Link
                        href={`/profiles/${p.id}`}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #ccc",
                          textDecoration: "none",
                          color: "inherit",
                          display: "inline-block",
                        }}
                      >
                        View
                      </Link>

                      <button
                        onClick={() => onToggleSave(p)}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #ccc",
                          background: "white",
                          cursor: "pointer",
                        }}
                      >
                        {isSaved ? "Unsave" : "Save"}
                      </button>

                      <button
                        onClick={() => onLike(p)}
                        disabled={likeDisabled}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #ccc",
                          background: likeDisabled ? "#f5f5f5" : "white",
                          cursor: likeDisabled ? "not-allowed" : "pointer",
                          opacity: likeDisabled ? 0.85 : 1,
                        }}
                      >
                        {likeLabel}
                      </button>

                      <button
                        onClick={() => onMessage(p)}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #ccc",
                          background: "white",
                          cursor: "pointer",
                        }}
                      >
                        Message
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {toast && (
          <div
            style={{
              position: "fixed",
              bottom: 18,
              left: "50%",
              transform: "translateX(-50%)",
              padding: "10px 14px",
              borderRadius: 999,
              border: "1px solid #ddd",
              background: "white",
              boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
              zIndex: 9999,
              whiteSpace: "pre-wrap",
              maxWidth: 900,
            }}
          >
            {toast}
          </div>
        )}
      </div>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { DEMO_PROFILES, type Profile } from "../lib/sampleProfiles";
import { getOrCreateUserId } from "../lib/user";

// -----------------------------
// API base
// -----------------------------
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  "https://black-within-api.onrender.com";

// -----------------------------
// Local notification helper (client-only)
// -----------------------------
function addNotificationLocal(message: string) {
  try {
    const key = "bw_notifications";
    const existing = JSON.parse(localStorage.getItem(key) || "[]") as any[];
    existing.unshift({
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : String(Date.now()),
      type: "like",
      message,
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem(key, JSON.stringify(existing.slice(0, 200)));
  } catch {
    // ignore
  }
}

// -----------------------------
// API helpers
// -----------------------------
async function apiGetSavedIds(userId: string): Promise<string[]> {
  const res = await fetch(
    `${API_BASE}/saved?user_id=${encodeURIComponent(userId)}`,
    { method: "GET" }
  );
  if (!res.ok) throw new Error("Failed to load saved profiles.");
  const json = await res.json();
  return Array.isArray(json?.ids) ? json.ids : [];
}

async function apiGetLikes(userId: string): Promise<string[]> {
  const res = await fetch(
    `${API_BASE}/likes?user_id=${encodeURIComponent(userId)}`,
    { method: "GET" }
  );
  if (!res.ok) throw new Error("Failed to load likes.");
  const json = await res.json();
  return Array.isArray(json?.ids) ? json.ids : [];
}

async function apiSaveProfile(userId: string, profileId: string) {
  const res = await fetch(`${API_BASE}/saved`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, profile_id: profileId }),
  });
  if (!res.ok) throw new Error("Save failed.");
}

async function apiUnsaveProfile(userId: string, profileId: string) {
  const url = `${API_BASE}/saved?user_id=${encodeURIComponent(
    userId
  )}&profile_id=${encodeURIComponent(profileId)}`;

  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error("Unsave failed.");
}

async function apiLikeProfile(userId: string, profileId: string) {
  const res = await fetch(`${API_BASE}/likes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, profile_id: profileId }),
  });
  if (!res.ok) throw new Error("Like failed.");
}

export default function DiscoverPage() {
  const [userId, setUserId] = useState<string>("");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [loadingSets, setLoadingSets] = useState<boolean>(true);

  // Filters
  const [intentionFilter, setIntentionFilter] = useState<string>("All");
  const [tagFilter, setTagFilter] = useState<string>("All");

  // For broken images → fallback to initials
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const availableProfiles = useMemo(
    () => DEMO_PROFILES.filter((p) => p.isAvailable),
    []
  );

  const availableProfileIds = useMemo(
    () => new Set(availableProfiles.map((p) => p.id)),
    [availableProfiles]
  );

  // Build dropdown options
  const intentionOptions = useMemo(() => {
    const set = new Set<string>();
    availableProfiles.forEach((p) => set.add(p.intention));
    return ["All", ...Array.from(set).sort()];
  }, [availableProfiles]);

  const tagOptions = useMemo(() => {
    const set = new Set<string>();
    availableProfiles.forEach((p) => p.tags.forEach((t) => set.add(t)));
    return ["All", ...Array.from(set).sort()];
  }, [availableProfiles]);

  // Apply filters
  const filteredProfiles = useMemo(() => {
    return availableProfiles.filter((p) => {
      const intentionMatch =
        intentionFilter === "All" || p.intention === intentionFilter;
      const tagMatch = tagFilter === "All" || p.tags.includes(tagFilter);
      return intentionMatch && tagMatch;
    });
  }, [availableProfiles, intentionFilter, tagFilter]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }

  function getInitials(displayName: string) {
    return displayName
      .trim()
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  async function refreshSavedAndLikes(uid: string) {
    try {
      setApiError(null);
      setLoadingSets(true);

      const [saved, likes] = await Promise.all([
        apiGetSavedIds(uid),
        apiGetLikes(uid),
      ]);

      // Keep only IDs that still exist in demo profiles
      const savedStillValid = saved.filter((id) => availableProfileIds.has(id));
      const likesStillValid = likes.filter((id) => availableProfileIds.has(id));

      setSavedIds(savedStillValid);
      setLikedIds(likesStillValid);
    } catch (e: any) {
      setApiError(e?.message || "Could not refresh Saved/Likes from the API.");
    } finally {
      setLoadingSets(false);
    }
  }

  useEffect(() => {
    const uid = getOrCreateUserId();
    setUserId(uid);

    (async () => {
      await refreshSavedAndLikes(uid);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableProfileIds]);

  async function onToggleSave(p: Profile) {
    if (!userId) return;

    const currentlySaved = savedIds.includes(p.id);
    const prev = savedIds;

    // Optimistic UI update
    setSavedIds((curr) =>
      curr.includes(p.id) ? curr.filter((x) => x !== p.id) : [p.id, ...curr]
    );

    try {
      if (currentlySaved) {
        await apiUnsaveProfile(userId, p.id);
        showToast("Removed from Saved Profiles.");
      } else {
        await apiSaveProfile(userId, p.id);
        showToast("Saved. You can view it later in Saved Profiles.");
      }

      // Re-sync from server to confirm
      await refreshSavedAndLikes(userId);
    } catch (e: any) {
      // Revert
      setSavedIds(prev);
      showToast("Could not update saved status right now. Please try again.");
      setApiError(e?.message || "Save/Unsave failed.");
    }
  }

  async function onLike(p: Profile) {
    if (!userId) return;
    if (likedIds.includes(p.id)) return;

    const prev = likedIds;

    // Optimistic UI update
    setLikedIds((curr) => (curr.includes(p.id) ? curr : [p.id, ...curr]));

    try {
      await apiLikeProfile(userId, p.id);

      await refreshSavedAndLikes(userId);

      addNotificationLocal("Someone liked your profile.");
      showToast("Like sent. They’ll be notified.");
    } catch (e: any) {
      // Revert
      setLikedIds(prev);
      showToast("Could not like right now. Please try again.");
      setApiError(e?.message || "Like failed.");
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "2rem",
        display: "grid",
        placeItems: "start center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 1100 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ fontSize: "2.2rem", marginBottom: "0.25rem" }}>
              Discover
            </h1>
            <p style={{ color: "#555" }}>
              Browse intentionally. Save what resonates. Alignment over volume.
            </p>

            <div
              style={{
                marginTop: "1rem",
                padding: "0.85rem",
                borderRadius: 12,
                border: "1px solid #eee",
                color: "#555",
              }}
            >
              You’re viewing preview profiles while Black Within opens
              intentionally.
            </div>

            {apiError && (
              <div
                style={{
                  marginTop: "0.75rem",
                  padding: "0.85rem",
                  borderRadius: 12,
                  border: "1px solid #f0c9c9",
                  background: "#fff7f7",
                  color: "#7a2d2d",
                  maxWidth: 720,
                }}
              >
                <b>API notice:</b> {apiError}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <a
              href="/saved"
              style={{
                padding: "0.65rem 1rem",
                border: "1px solid #ccc",
                borderRadius: 10,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              Saved Profiles ({savedIds.length})
            </a>

            <a
              href="/notifications"
              style={{
                padding: "0.65rem 1rem",
                border: "1px solid #ccc",
                borderRadius: 10,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              Notifications
            </a>
          </div>
        </div>

        {/* Filter bar */}
        <div
          style={{
            marginTop: "1.25rem",
            padding: "1rem",
            borderRadius: 12,
            border: "1px solid #eee",
            display: "flex",
            gap: "1rem",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ display: "grid", gap: "0.35rem" }}>
            <label style={{ fontSize: "0.9rem", color: "#555" }}>
              Relationship Intention
            </label>
            <select
              value={intentionFilter}
              onChange={(e) => setIntentionFilter(e.target.value)}
              style={{
                padding: "0.6rem 0.75rem",
                borderRadius: 10,
                border: "1px solid #ccc",
                minWidth: 240,
              }}
            >
              {intentionOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gap: "0.35rem" }}>
            <label style={{ fontSize: "0.9rem", color: "#555" }}>
              Cultural & Spiritual Grounding
              <div
                style={{
                  fontSize: "0.85rem",
                  color: "#777",
                  marginTop: "0.15rem",
                }}
              >
                Select your spiritual identity...
              </div>
            </label>

            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              style={{
                padding: "0.6rem 0.75rem",
                borderRadius: 10,
                border: "1px solid #ccc",
                minWidth: 280,
              }}
            >
              {tagOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              setIntentionFilter("All");
              setTagFilter("All");
            }}
            style={{
              padding: "0.65rem 1rem",
              borderRadius: 10,
              border: "1px solid #ccc",
              background: "white",
              cursor: "pointer",
              height: "fit-content",
              marginTop: "1.35rem",
            }}
          >
            Clear Filters
          </button>

          <div style={{ marginLeft: "auto", color: "#666", marginTop: "1.35rem" }}>
            Showing <b>{filteredProfiles.length}</b> profiles
          </div>
        </div>

        {toast && (
          <div
            style={{
              marginTop: "1rem",
              padding: "0.75rem",
              borderRadius: 10,
              border: "1px solid #cfe7cf",
              background: "#f6fff6",
            }}
          >
            {toast}
          </div>
        )}

        <div
          style={{
            marginTop: "1.5rem",
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "1rem",
          }}
        >
          {filteredProfiles.map((p) => {
            const isSaved = savedIds.includes(p.id);
            const isLiked = likedIds.includes(p.id);
            const showFallback = !p.photo || brokenImages[p.id];

            return (
              <div
                key={p.id}
                style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: 14,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "4 / 3",
                    background: "#f3f3f3",
                  }}
                >
                  {showFallback ? (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "grid",
                        placeItems: "center",
                        background: "#f2f2f2",
                        color: "#555",
                        fontSize: "1.5rem",
                        fontWeight: 600,
                      }}
                    >
                      {getInitials(p.displayName)}
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.photo}
                      alt={p.displayName}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                      onError={() =>
                        setBrokenImages((prev) => ({ ...prev, [p.id]: true }))
                      }
                    />
                  )}
                </div>

                <div style={{ padding: "1rem" }}>
                  <div style={{ fontSize: "1.15rem", fontWeight: 600 }}>
                    {p.displayName}
                  </div>

                  <div style={{ color: "#666", marginTop: "0.4rem" }}>
                    {p.age} • {p.city}, {p.stateUS}
                  </div>

                  <div style={{ marginTop: "0.75rem", color: "#555" }}>
                    {p.identityPreview}
                  </div>

                  <div
                    style={{
                      marginTop: "0.75rem",
                      display: "flex",
                      gap: "0.4rem",
                      flexWrap: "wrap",
                    }}
                  >
                    {p.tags.slice(0, 3).map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: "0.85rem",
                          padding: "0.25rem 0.5rem",
                          border: "1px solid #ddd",
                          borderRadius: 999,
                          color: "#444",
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>

                  <div
                    style={{
                      marginTop: "1rem",
                      display: "flex",
                      gap: "0.6rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <a
                      href={`/profiles/${p.id}`}
                      style={{
                        padding: "0.6rem 0.9rem",
                        borderRadius: 10,
                        border: "1px solid #ccc",
                        textDecoration: "none",
                        color: "inherit",
                      }}
                    >
                      View
                    </a>

                    <button
                      onClick={() => onToggleSave(p)}
                      disabled={loadingSets}
                      style={{
                        padding: "0.6rem 0.9rem",
                        borderRadius: 10,
                        border: "1px solid #ccc",
                        cursor: loadingSets ? "not-allowed" : "pointer",
                        opacity: loadingSets ? 0.75 : 1,
                      }}
                    >
                      {isSaved ? "Unsave" : "Save"}
                    </button>

                    <button
                      onClick={() => onLike(p)}
                      disabled={isLiked || loadingSets}
                      style={{
                        padding: "0.6rem 0.9rem",
                        borderRadius: 10,
                        border: "1px solid #ccc",
                        cursor: isLiked || loadingSets ? "not-allowed" : "pointer",
                        opacity: isLiked || loadingSets ? 0.6 : 1,
                      }}
                    >
                      {isLiked ? "Liked" : "Like"}
                    </button>
                  </div>

                  <div
                    style={{
                      marginTop: "0.75rem",
                      color: "#777",
                      fontSize: "0.9rem",
                    }}
                  >
                    Messaging opens later. Likes notify, but conversations remain
                    locked.
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: "2rem", color: "#777", fontSize: "0.95rem" }}>
          Launch note: these are preview profiles used to demonstrate the
          experience while Black Within opens intentionally.
        </div>
      </div>
    </main>
  );
}

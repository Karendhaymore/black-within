"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DEMO_PROFILES, type Profile } from "../../lib/sampleProfiles";
import { getOrCreateUserId } from "../../lib/user";

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

export default function ProfileDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const profileId = (params?.id || "").toString();

  const [userId, setUserId] = useState<string>("");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [loadingSets, setLoadingSets] = useState<boolean>(true);

  // Broken image fallback
  const [brokenImage, setBrokenImage] = useState<boolean>(false);

  const profile = useMemo<Profile | null>(() => {
    const p = DEMO_PROFILES.find((x) => x.id === profileId) || null;
    // If you only want available profiles visible:
    if (p && !p.isAvailable) return null;
    return p;
  }, [profileId]);

  const availableProfileIds = useMemo(() => {
    return new Set(DEMO_PROFILES.filter((p) => p.isAvailable).map((p) => p.id));
  }, []);

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

  async function onToggleSave() {
    if (!profile) return;
    if (!userId) return;

    const currentlySaved = savedIds.includes(profile.id);
    const prev = savedIds;

    // Optimistic update
    setSavedIds((curr) =>
      curr.includes(profile.id)
        ? curr.filter((x) => x !== profile.id)
        : [profile.id, ...curr]
    );

    try {
      if (currentlySaved) {
        await apiUnsaveProfile(userId, profile.id);
        showToast("Removed from Saved Profiles.");
      } else {
        await apiSaveProfile(userId, profile.id);
        showToast("Saved. You can view it later in Saved Profiles.");
      }

      await refreshSavedAndLikes(userId);
    } catch (e: any) {
      setSavedIds(prev);
      showToast("Could not update saved status right now. Please try again.");
      setApiError(e?.message || "Save/Unsave failed.");
    }
  }

  async function onLike() {
    if (!profile) return;
    if (!userId) return;
    if (likedIds.includes(profile.id)) return;

    const prev = likedIds;

    // Optimistic update
    setLikedIds((curr) => (curr.includes(profile.id) ? curr : [profile.id, ...curr]));

    try {
      await apiLikeProfile(userId, profile.id);

      await refreshSavedAndLikes(userId);

      addNotificationLocal("Someone liked your profile.");
      showToast("Like sent. They’ll be notified.");
    } catch (e: any) {
      setLikedIds(prev);
      showToast("Could not like right now. Please try again.");
      setApiError(e?.message || "Like failed.");
    }
  }

  if (!profile) {
    return (
      <main
        style={{
          minHeight: "100vh",
          padding: "2rem",
          display: "grid",
          placeItems: "start center",
        }}
      >
        <div style={{ width: "100%", maxWidth: 900 }}>
          <h1 style={{ fontSize: "2rem", marginBottom: "0.35rem" }}>
            Profile not found
          </h1>
          <p style={{ color: "#666" }}>
            This profile may be unavailable in preview mode.
          </p>

          <div style={{ marginTop: "1rem" }}>
            <a
              href="/discover"
              style={{
                padding: "0.65rem 1rem",
                border: "1px solid #ccc",
                borderRadius: 10,
                textDecoration: "none",
                color: "inherit",
                display: "inline-block",
              }}
            >
              Back to Discover
            </a>
          </div>
        </div>
      </main>
    );
  }

  const isSaved = savedIds.includes(profile.id);
  const isLiked = likedIds.includes(profile.id);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "2rem",
        display: "grid",
        placeItems: "start center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 900 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <div>
            <h1 style={{ fontSize: "2.2rem", marginBottom: "0.25rem" }}>
              {profile.displayName}
            </h1>
            <p style={{ color: "#555" }}>
              {profile.age} • {profile.city}, {profile.stateUS}
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <button
              onClick={() => router.back()}
              style={{
                padding: "0.65rem 1rem",
                border: "1px solid #ccc",
                borderRadius: 10,
                background: "white",
                cursor: "pointer",
              }}
            >
              Back
            </button>

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
              Saved ({savedIds.length})
            </a>
          </div>
        </div>

        {apiError && (
          <div
            style={{
              marginTop: "0.9rem",
              padding: "0.85rem",
              borderRadius: 12,
              border: "1px solid #f0c9c9",
              background: "#fff7f7",
              color: "#7a2d2d",
            }}
          >
            <b>API notice:</b> {apiError}
          </div>
        )}

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

        {/* Main card */}
        <div
          style={{
            marginTop: "1.25rem",
            border: isSaved ? "1px solid #cfe7cf" : "1px solid #e5e5e5",
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: isSaved ? "0 0 0 2px rgba(207,231,207,0.35) inset" : "none",
            background: "white",
          }}
        >
          {/* Photo */}
          <div
            style={{
              width: "100%",
              aspectRatio: "16 / 9",
              background: "#f3f3f3",
              position: "relative",
            }}
          >
            {/* Saved badge (only when saved) */}
            {isSaved && (
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  zIndex: 2,
                  padding: "0.25rem 0.55rem",
                  borderRadius: 999,
                  border: "1px solid #cfe7cf",
                  background: "rgba(246, 255, 246, 0.95)",
                  color: "#256b36",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                }}
              >
                Saved
              </div>
            )}

            {!profile.photo || brokenImage ? (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "grid",
                  placeItems: "center",
                  background: "#f2f2f2",
                  color: "#555",
                  fontSize: "2rem",
                  fontWeight: 700,
                }}
              >
                {getInitials(profile.displayName)}
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.photo}
                alt={profile.displayName}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onError={() => setBrokenImage(true)}
              />
            )}
          </div>

          {/* Body */}
          <div style={{ padding: "1.25rem" }}>
            <div style={{ color: "#555", fontSize: "1.05rem" }}>
              {profile.identityPreview}
            </div>

            <div style={{ marginTop: "0.85rem", color: "#666" }}>
              <b>Intention:</b> {profile.intention}
            </div>

            <div
              style={{
                marginTop: "0.85rem",
                display: "flex",
                gap: "0.4rem",
                flexWrap: "wrap",
              }}
            >
              {profile.tags.slice(0, 6).map((t) => (
                <span
                  key={t}
                  style={{
                    fontSize: "0.85rem",
                    padding: "0.25rem 0.55rem",
                    border: "1px solid #ddd",
                    borderRadius: 999,
                    color: "#444",
                  }}
                >
                  {t}
                </span>
              ))}
            </div>

            {/* Actions */}
            <div
              style={{
                marginTop: "1.1rem",
                display: "flex",
                gap: "0.6rem",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={onToggleSave}
                disabled={loadingSets}
                style={{
                  padding: "0.7rem 1rem",
                  borderRadius: 10,
                  border: isSaved ? "1px solid #cfe7cf" : "1px solid #ccc",
                  background: "white",
                  cursor: loadingSets ? "not-allowed" : "pointer",
                  opacity: loadingSets ? 0.75 : 1,
                }}
              >
                {isSaved ? "Unsave" : "Save"}
              </button>

              <button
                onClick={onLike}
                disabled={isLiked || loadingSets}
                style={{
                  padding: "0.7rem 1rem",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  background: "white",
                  cursor: isLiked || loadingSets ? "not-allowed" : "pointer",
                  opacity: isLiked || loadingSets ? 0.6 : 1,
                }}
              >
                {isLiked ? "Liked" : "Like"}
              </button>

              <a
                href="/discover"
                style={{
                  padding: "0.7rem 1rem",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  textDecoration: "none",
                  color: "inherit",
                  display: "inline-block",
                }}
              >
                Back to Discover
              </a>
            </div>

            <div style={{ marginTop: "0.9rem", color: "#777", fontSize: "0.92rem" }}>
              Messaging opens later. Likes notify, but conversations remain locked.
            </div>
          </div>
        </div>

        <div style={{ marginTop: "1.5rem", color: "#777", fontSize: "0.95rem" }}>
          Launch note: this is a preview profile used to demonstrate the experience
          while Black Within opens intentionally.
        </div>
      </div>
    </main>
  );
}

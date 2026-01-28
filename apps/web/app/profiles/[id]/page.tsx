"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getOrCreateUserId } from "../../lib/user";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

/**
 * IMPORTANT:
 * This type matches what your API returns (camelCase fields).
 * Do NOT import Profile from sampleProfiles here.
 */
type ApiProfile = {
  id: string;
  owner_user_id: string;
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

type ProfilesResponse = { items: ApiProfile[] };
type IdListResponse = { ids: string[] };

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
async function apiListProfiles(): Promise<ApiProfile[]> {
  const res = await fetch(`${API_BASE}/profiles?limit=200`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to load profiles (${res.status}). ${text}`);
  }
  const json = (await res.json()) as ProfilesResponse;
  return Array.isArray(json?.items) ? json.items : [];
}

async function apiGetSavedIds(userId: string): Promise<string[]> {
  const res = await fetch(
    `${API_BASE}/saved?user_id=${encodeURIComponent(userId)}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Failed to load saved profiles (${res.status}).`);
  const json = (await res.json()) as IdListResponse;
  return Array.isArray(json?.ids) ? json.ids : [];
}

async function apiGetLikes(userId: string): Promise<string[]> {
  const res = await fetch(
    `${API_BASE}/likes?user_id=${encodeURIComponent(userId)}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Failed to load likes (${res.status}).`);
  const json = (await res.json()) as IdListResponse;
  return Array.isArray(json?.ids) ? json.ids : [];
}

async function apiSaveProfile(userId: string, profileId: string) {
  const res = await fetch(`${API_BASE}/saved`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, profile_id: profileId }),
  });
  if (!res.ok) throw new Error(`Save failed (${res.status}).`);
}

async function apiUnsaveProfile(userId: string, profileId: string) {
  const url = `${API_BASE}/saved?user_id=${encodeURIComponent(
    userId
  )}&profile_id=${encodeURIComponent(profileId)}`;

  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(`Unsave failed (${res.status}).`);
}

// NOTE: backend currently ignores recipient_user_id, but passing it is future-proof.
async function apiLikeProfile(
  userId: string,
  profileId: string,
  recipientUserId?: string
) {
  const res = await fetch(`${API_BASE}/likes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      profile_id: profileId,
      recipient_user_id: recipientUserId || null,
    }),
  });
  if (!res.ok) throw new Error(`Like failed (${res.status}).`);
}

// -----------------------------
// Identity Preview formatting
// -----------------------------
function normalizeHeading(label: string) {
  const x = (label || "").trim().toLowerCase();
  if (x.startsWith("cultural identity")) return "Cultural Identity";
  if (x.startsWith("spiritual framework")) return "Spiritual Framework";
  if (x.startsWith("biggest dating challenge")) return "Biggest Dating Challenge";
  if (x.startsWith("one thing you need to know")) return "One Thing You Need to Know";
  return (label || "").trim();
}

function parseIdentityPreview(raw: string): { title: string; body: string }[] {
  const text = (raw || "").trim();
  if (!text) return [];

  // Expect blocks separated by blank lines
  const blocks = text
    .split(/\n\s*\n/g)
    .map((b) => b.trim())
    .filter(Boolean);

  return blocks.map((b) => {
    // If it looks like "Label: content" on the first line, split once
    const idx = b.indexOf(":");
    if (idx > 0 && idx < 60) {
      const label = b.slice(0, idx).trim();
      const content = b.slice(idx + 1).trim();
      return {
        title: normalizeHeading(label),
        body: content || b,
      };
    }
    return { title: "About", body: b };
  });
}

export default function ProfileDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const profileId = (params?.id || "").toString();

  const [userId, setUserId] = useState<string>("");

  const [profiles, setProfiles] = useState<ApiProfile[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingSets, setLoadingSets] = useState<boolean>(true);

  const [brokenImage, setBrokenImage] = useState<boolean>(false);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
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

  const availableProfileIds = useMemo(() => {
    return new Set(profiles.filter((p) => p.isAvailable).map((p) => p.id));
  }, [profiles]);

  const profile = useMemo<ApiProfile | null>(() => {
    const p = profiles.find((x) => x.id === profileId) || null;
    if (p && !p.isAvailable) return null;
    return p;
  }, [profiles, profileId]);

  const identitySections = useMemo(() => {
    return parseIdentityPreview(profile?.identityPreview || "");
  }, [profile?.identityPreview]);

  async function refreshSavedAndLikes(uid: string) {
    try {
      setApiError(null);
      setLoadingSets(true);

      const [saved, likes] = await Promise.all([
        apiGetSavedIds(uid),
        apiGetLikes(uid),
      ]);

      setSavedIds(saved.filter((id) => availableProfileIds.has(id)));
      setLikedIds(likes.filter((id) => availableProfileIds.has(id)));
    } catch (e: any) {
      setApiError(e?.message || "Could not refresh Saved/Likes from the API.");
    } finally {
      setLoadingSets(false);
    }
  }

  // Load user id + profiles
  useEffect(() => {
    const uid = getOrCreateUserId();
    setUserId(uid);

    (async () => {
      try {
        setApiError(null);
        setLoading(true);

        const items = await apiListProfiles();
        setProfiles(items);
      } catch (e: any) {
        console.error("Profile detail load error:", e);
        setApiError(e?.message || `Could not reach API at ${API_BASE}`);
        setProfiles([]);
      } finally {
        setLoading(false);
      }

      await refreshSavedAndLikes(uid);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When profiles load and availableProfileIds changes, re-filter saved/likes
  useEffect(() => {
    if (!userId) return;
    refreshSavedAndLikes(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableProfileIds]);

  async function onToggleSave() {
    if (!profile) return;
    if (!userId) return;

    const currentlySaved = savedIds.includes(profile.id);
    const prev = savedIds;

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

    setLikedIds((curr) =>
      curr.includes(profile.id) ? curr : [profile.id, ...curr]
    );

    try {
      await apiLikeProfile(userId, profile.id, profile.owner_user_id);

      await refreshSavedAndLikes(userId);

      addNotificationLocal("Someone liked your profile.");
      showToast("Like sent.");
    } catch (e: any) {
      setLikedIds(prev);
      showToast("Could not like right now. Please try again.");
      setApiError(e?.message || "Like failed.");
    }
  }

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", padding: "2rem" }}>
        <p>Loading profile…</p>
        <p style={{ color: "#666", fontSize: 13, marginTop: 8 }}>
          API: {API_BASE}
        </p>
      </main>
    );
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
            This profile ID was not found in the API list.
          </p>

          <div style={{ marginTop: 10, fontSize: 13, color: "#666" }}>
            <div>
              <strong>API:</strong> {API_BASE}
            </div>
            <div>
              <strong>Profiles loaded:</strong> {profiles.length}
            </div>
            <div>
              <strong>Profile ID:</strong> {profileId}
            </div>
          </div>

          {apiError && (
            <div style={{ marginTop: "1rem", color: "crimson" }}>
              <b>API notice:</b> {apiError}
            </div>
          )}

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
  const tags = Array.isArray(profile.tags) ? profile.tags : [];

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

        <div
          style={{
            marginTop: "1.25rem",
            border: isSaved ? "1px solid #cfe7cf" : "1px solid #e5e5e5",
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: isSaved
              ? "0 0 0 2px rgba(207,231,207,0.35) inset"
              : "none",
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
            {/* Identity sections */}
            {identitySections.length > 0 ? (
              <div style={{ display: "grid", gap: "0.85rem" }}>
                {identitySections.map((sec, idx) => (
                  <div
                    key={`${profile.id}-sec-${idx}`}
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 14,
                      padding: "0.9rem",
                      background: "white",
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>
                      {sec.title}
                    </div>
                    <div style={{ color: "#555", fontSize: "1.02rem", whiteSpace: "pre-wrap" }}>
                      {sec.body}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "#555", fontSize: "1.05rem" }}>
                {profile.identityPreview}
              </div>
            )}

            <div style={{ marginTop: "0.95rem", color: "#666" }}>
              <b>Intention:</b> {profile.intention}
            </div>

            {tags.length > 0 && (
              <div
                style={{
                  marginTop: "0.85rem",
                  display: "flex",
                  gap: "0.4rem",
                  flexWrap: "wrap",
                }}
              >
                {tags.slice(0, 12).map((t, idx) => (
                  <span
                    key={`${profile.id}-tag-${idx}`}
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
            )}

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
      </div>
    </main>
  );
}

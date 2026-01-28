"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getOrCreateUserId } from "../lib/user";

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

type IdListResponse = { ids: string[] };
type ProfilesResponse = { items: ApiProfile[] };

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

async function apiGetSavedIds(userId: string): Promise<string[]> {
  const res = await fetch(
    `${API_BASE}/saved?user_id=${encodeURIComponent(userId)}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Failed to load saved profiles.");
  const json = (await res.json()) as IdListResponse;
  return Array.isArray(json?.ids) ? json.ids : [];
}

async function apiListProfiles(): Promise<ApiProfile[]> {
  const res = await fetch(`${API_BASE}/profiles?limit=200`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to load profiles.");
  const json = (await res.json()) as ProfilesResponse;
  return Array.isArray(json?.items) ? json.items : [];
}

async function apiUnsaveProfile(userId: string, profileId: string) {
  const url = `${API_BASE}/saved?user_id=${encodeURIComponent(
    userId
  )}&profile_id=${encodeURIComponent(profileId)}`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error("Unsave failed.");
}

export default function SavedPage() {
  const [userId, setUserId] = useState<string>("");

  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<ApiProfile[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // For broken images → fallback to initials
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  // Only show profiles that are available + saved
  const savedProfiles = useMemo(() => {
    const set = new Set(savedIds);
    return profiles.filter((p) => p.isAvailable && set.has(p.id));
  }, [savedIds, profiles]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  }

  function getInitials(displayName: string) {
    return (displayName || "")
      .trim()
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  async function refresh(uid: string) {
    try {
      setApiError(null);
      setLoading(true);

      const [ids, allProfiles] = await Promise.all([
        apiGetSavedIds(uid),
        apiListProfiles(),
      ]);

      setSavedIds(ids);
      setProfiles(allProfiles);
    } catch (e: any) {
      setApiError(e?.message || `Could not reach API at ${API_BASE}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const uid = getOrCreateUserId();
    setUserId(uid);
    refresh(uid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onRemove(profileId: string) {
    if (!userId) return;

    const prev = savedIds;

    // optimistic
    setSavedIds((curr) => curr.filter((id) => id !== profileId));

    try {
      await apiUnsaveProfile(userId, profileId);
      showToast("Removed from Saved Profiles.");
      await refresh(userId);
    } catch (e: any) {
      setSavedIds(prev);
      setApiError(e?.message || "Could not remove saved profile.");
      showToast("Could not remove right now. Please try again.");
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
            alignItems: "flex-start",
          }}
        >
          <div>
            <h1 style={{ fontSize: "2.2rem", marginBottom: "0.25rem" }}>
              Saved Profiles
            </h1>
            <p style={{ color: "#555" }}>
              Saved profiles stay here until you remove them (or the profile is
              no longer available).
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <Link
              href="/discover"
              style={{
                padding: "0.65rem 1rem",
                border: "1px solid #ccc",
                borderRadius: 10,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              Back to Discover
            </Link>

            <Link
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
            </Link>
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
            padding: "0.85rem",
            borderRadius: 12,
            border: "1px solid #eee",
            color: "#555",
          }}
        >
          You’re viewing saved preview profiles while Black Within opens
          intentionally.
        </div>

        {loading ? (
          <div
            style={{
              marginTop: "1.5rem",
              padding: "1.25rem",
              borderRadius: 14,
              border: "1px solid #eee",
              color: "#555",
            }}
          >
            Loading your saved profiles…
          </div>
        ) : savedProfiles.length === 0 ? (
          <div
            style={{
              marginTop: "1.5rem",
              padding: "1.25rem",
              borderRadius: 14,
              border: "1px solid #eee",
              color: "#555",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>
              No saved profiles yet.
            </div>
            <div style={{ color: "#666" }}>
              Go to Discover and save profiles you want to revisit.
            </div>

            <div style={{ marginTop: "1rem" }}>
              <Link
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
                Go to Discover
              </Link>
            </div>
          </div>
        ) : (
          <div
            style={{
              marginTop: "1.5rem",
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "1rem",
            }}
          >
            {savedProfiles.map((p) => {
              const showFallback = !p.photo || brokenImages[p.id];

              return (
                <div
                  key={p.id}
                  style={{
                    border: "1px solid #cfe7cf",
                    borderRadius: 14,
                    overflow: "hidden",
                    boxShadow: "0 0 0 2px rgba(207,231,207,0.35) inset",
                    background: "white",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "4 / 3",
                      background: "#f3f3f3",
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 10,
                        right: 10,
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
                        src={p.photo || ""}
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
                      {(p.tags || []).slice(0, 3).map((t) => (
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
                      <Link
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
                      </Link>

                      <button
                        onClick={() => onRemove(p.id)}
                        style={{
                          padding: "0.6rem 0.9rem",
                          borderRadius: 10,
                          border: "1px solid #ccc",
                          cursor: "pointer",
                          background: "white",
                        }}
                      >
                        Remove
                      </button>
                    </div>

                    <div
                      style={{
                        marginTop: "0.75rem",
                        color: "#777",
                        fontSize: "0.9rem",
                      }}
                    >
                      Saved until you remove it.
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: "2rem", color: "#777", fontSize: "0.95rem" }}>
          MVP note: Saved Profiles are stored in the database so they survive
          refresh and redeploys. Full cross-device syncing will be automatic once
          login is fully wired.
        </div>
      </div>
    </main>
  );
}

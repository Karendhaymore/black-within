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

async function apiGetLikes(userId: string): Promise<string[]> {
  const res = await fetch(
    `${API_BASE}/likes?user_id=${encodeURIComponent(userId)}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Failed to load likes (${res.status}).`);
  const json = (await res.json()) as IdListResponse;
  return Array.isArray(json?.ids) ? json.ids : [];
}

async function apiListProfiles(excludeOwnerUserId?: string): Promise<ApiProfile[]> {
  const url =
    `${API_BASE}/profiles?limit=100` +
    (excludeOwnerUserId
      ? `&exclude_owner_user_id=${encodeURIComponent(excludeOwnerUserId)}`
      : "");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to load profiles (${res.status}). ${text}`);
  }
  const json = (await res.json()) as ProfilesResponse;
  return Array.isArray(json?.items) ? json.items : [];
}

export default function LikesPage() {
  const [userId, setUserId] = useState("");
  const [profiles, setProfiles] = useState<ApiProfile[]>([]);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const likedProfiles = useMemo(() => {
    const set = new Set(likedIds);
    return profiles.filter((p) => p.isAvailable && set.has(p.id));
  }, [profiles, likedIds]);

  function getInitials(displayName: string) {
    return (displayName || "")
      .trim()
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  async function load(uid: string) {
    try {
      setApiError(null);
      setLoading(true);

      const [ids, items] = await Promise.all([
        apiGetLikes(uid),
        apiListProfiles(uid),
      ]);

      setLikedIds(ids);
      setProfiles(items);
    } catch (e: any) {
      setApiError(e?.message || "Could not load liked profiles.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const uid = getOrCreateUserId();
    setUserId(uid);
    load(uid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              Liked Profiles
            </h1>
            <p style={{ color: "#555" }}>
              These are the profiles you’ve liked.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <button
              onClick={() => userId && load(userId)}
              disabled={loading || !userId}
              style={{
                padding: "0.65rem 1rem",
                border: "1px solid #ccc",
                borderRadius: 10,
                background: "white",
                cursor: loading || !userId ? "not-allowed" : "pointer",
                opacity: loading || !userId ? 0.6 : 1,
              }}
            >
              Refresh
            </button>

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

            <a
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
              whiteSpace: "pre-wrap",
            }}
          >
            <b>API notice:</b> {apiError}
          </div>
        )}

        {loading ? (
          <div
            style={{
              marginTop: "1.5rem",
              padding: "1.25rem",
              border: "1px solid #eee",
              borderRadius: 12,
              color: "#666",
            }}
          >
            Loading liked profiles…
          </div>
        ) : likedProfiles.length === 0 ? (
          <div
            style={{
              marginTop: "1.5rem",
              padding: "1.25rem",
              border: "1px solid #eee",
              borderRadius: 12,
              color: "#666",
            }}
          >
            You haven’t liked any profiles yet. Go to Discover and tap Like.
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
                Go to Discover
              </a>
            </div>
          </div>
        ) : (
          <div
            style={{
              marginTop: "1.5rem",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: "1rem",
            }}
          >
            {likedProfiles.map((p) => {
              const showFallback = !p.photo || brokenImages[p.id];

              return (
                <div
                  key={p.id}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 14,
                    overflow: "hidden",
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
                        src={p.photo as string}
                        alt={p.displayName}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError={() =>
                          setBrokenImages((prev) => ({ ...prev, [p.id]: true }))
                        }
                      />
                    )}
                  </div>

                  <div style={{ padding: "1rem" }}>
                    <div style={{ fontSize: "1.15rem", fontWeight: 700 }}>
                      {p.displayName}
                    </div>
                    <div style={{ color: "#666", marginTop: "0.4rem" }}>
                      {p.age} • {p.city}, {p.stateUS}
                    </div>

                    <div style={{ marginTop: "0.75rem", color: "#555" }}>
                      {p.identityPreview}
                    </div>

                    <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <Link
                        href={`/profiles/${p.id}`}
                        style={{
                          padding: "0.6rem 0.9rem",
                          borderRadius: 10,
                          border: "1px solid #ccc",
                          textDecoration: "none",
                          color: "inherit",
                          display: "inline-block",
                        }}
                      >
                        View
                      </Link>

                      <a
                        href="/notifications"
                        style={{
                          padding: "0.6rem 0.9rem",
                          borderRadius: 10,
                          border: "1px solid #ccc",
                          textDecoration: "none",
                          color: "inherit",
                          display: "inline-block",
                        }}
                      >
                        Notifications
                      </a>
                    </div>

                    <div style={{ marginTop: "0.8rem", color: "#777", fontSize: "0.9rem" }}>
                      You’ve liked this profile.
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

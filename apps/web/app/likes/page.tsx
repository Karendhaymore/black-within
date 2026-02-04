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

// Matches /likes/status (we’ll treat missing fields safely)
type LikesStatusResponse = {
  likesLeft?: number;
  limit?: number;
  isPremium?: boolean;
};

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

async function apiGetLikesStatus(userId: string): Promise<LikesStatusResponse | null> {
  try {
    const res = await fetch(
      `${API_BASE}/likes/status?user_id=${encodeURIComponent(userId)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    return (await res.json()) as LikesStatusResponse;
  } catch {
    return null;
  }
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

async function apiStartPremiumCheckout(userId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/stripe/checkout/premium`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Premium checkout failed (${res.status}). ${text}`);
  }
  const json = (await res.json()) as { url?: string };
  if (!json?.url) throw new Error("Premium checkout failed (missing URL).");
  return json.url;
}

export default function LikesPage() {
  const [userId, setUserId] = useState("");
  const [profiles, setProfiles] = useState<ApiProfile[]>([]);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  // Premium/likes status
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [likesLeft, setLikesLeft] = useState<number | null>(null);
  const [likesLimit, setLikesLimit] = useState<number | null>(null);
  const [startingPremium, setStartingPremium] = useState(false);

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

      const [ids, items, status] = await Promise.all([
        apiGetLikes(uid),
        apiListProfiles(uid),
        apiGetLikesStatus(uid),
      ]);

      setLikedIds(ids);
      setProfiles(items);

      // status may be null if your backend doesn’t have /likes/status yet
      if (status) {
        setIsPremium(Boolean(status.isPremium));
        setLikesLeft(
          typeof status.likesLeft === "number" ? status.likesLeft : null
        );
        setLikesLimit(typeof status.limit === "number" ? status.limit : null);
      } else {
        setIsPremium(false);
        setLikesLeft(null);
        setLikesLimit(null);
      }
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

  async function onGoPremium() {
    if (!userId) return;
    try {
      setStartingPremium(true);
      const url = await apiStartPremiumCheckout(userId);
      window.location.href = url;
    } catch (e: any) {
      setApiError(e?.message || "Could not start premium checkout.");
    } finally {
      setStartingPremium(false);
    }
  }

  const showStatusNumbers = !isPremium && likesLimit != null && likesLeft != null;

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

        {/* Premium / Likes status banner */}
        <div
          style={{
            marginTop: "1rem",
            padding: "1rem",
            borderRadius: 14,
            border: "1px solid #eee",
            background: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 260 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>
              {isPremium ? "Premium is active ✅" : "Want unlimited likes + messages?"}
            </div>

            {isPremium ? (
              <div style={{ color: "#555" }}>
                You have <b>unlimited likes</b> and <b>unlimited messages</b>.
              </div>
            ) : showStatusNumbers ? (
              <div style={{ color: "#555" }}>
                Likes remaining today: <b>{likesLeft}</b> / {likesLimit}
                <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
                  Go Premium for <b>$11.22/month</b> to unlock unlimited likes + unlimited messages.
                </div>
              </div>
            ) : (
              <div style={{ color: "#666", fontSize: 13 }}>
                Premium is <b>$11.22/month</b> and includes unlimited likes + unlimited messages.
              </div>
            )}
          </div>

          {!isPremium && (
            <button
              onClick={onGoPremium}
              disabled={startingPremium || !userId}
              style={{
                padding: "0.75rem 1rem",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: "white",
                cursor: startingPremium || !userId ? "not-allowed" : "pointer",
                opacity: startingPremium || !userId ? 0.7 : 1,
                fontWeight: 700,
              }}
            >
              {startingPremium ? "Starting checkout…" : "Go Premium ($11.22/mo)"}
            </button>
          )}
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

                    <div
                      style={{
                        marginTop: "0.75rem",
                        display: "flex",
                        gap: "0.5rem",
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

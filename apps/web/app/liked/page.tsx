"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getOrCreateUserId } from "../lib/user";
import { useRouter } from "next/navigation";

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

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

async function apiGetLikedYou(userId: string): Promise<ApiProfile[]> {
  const res = await fetch(
    `${API_BASE}/likes/received?user_id=${encodeURIComponent(userId)}&limit=200`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Failed to load liked profiles.");
  const json = (await res.json()) as ProfilesResponse;
  return Array.isArray(json?.items) ? json.items : [];
}

export default function LikedProfilesPage() {
  const [userId, setUserId] = useState<string>("");
  const [items, setItems] = useState<ApiProfile[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
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
      const rows = await apiGetLikedYou(uid);
      setItems(rows);
    } catch (e: any) {
      setApiError(e?.message || `Could not reach API at ${API_BASE}`);
      showToast("Could not load likes right now.");
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

  const visible = useMemo(() => {
    return (items || []).filter((p) => p.isAvailable);
  }, [items]);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "1rem",
        display: "grid",
        placeItems: "start center",
        overflowX: "hidden",
      }}
    >
      <div style={{ width: "100%", maxWidth: 1100 }}>
        <div
          style={{
            display: "grid",
            gap: "1rem",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "clamp(2rem, 8vw, 3.2rem)",
                marginBottom: "0.25rem",
              }}
            >
              Liked Profiles
            </h1>
            <p style={{ color: "#555", fontSize: "1rem" }}>
              These are people who liked your profile.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => userId && refresh(userId)}
              disabled={!userId || loading}
              style={{
                padding: "0.65rem 1rem",
                border: "1px solid #ccc",
                borderRadius: 10,
                background: "white",
                cursor: !userId || loading ? "not-allowed" : "pointer",
                opacity: !userId || loading ? 0.6 : 1,
              }}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>

            <Link href="/saved" style={navStyle}>
              Saved
            </Link>

            <Link href="/notifications" style={navStyle}>
              Notifications
            </Link>

            <Link href="/discover" style={navStyle}>
              Back to Discover
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

        {loading ? (
          <div style={noticeStyle}>Loading liked profiles…</div>
        ) : visible.length === 0 ? (
          <div style={noticeStyle}>
            <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>
              No likes yet.
            </div>
            <div style={{ color: "#666" }}>
              Once someone likes your profile, they’ll show up here.
            </div>
          </div>
        ) : (
          <div
            style={{
              marginTop: "1.5rem",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "1rem",
              alignItems: "start",
            }}
          >
            {visible.map((p) => {
              const showFallback = !p.photo || brokenImages[p.id];

              return (
                <div key={p.id} style={cardStyle}>
                  <Link
                    href={`/profiles/${p.id}`}
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      display: "block",
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
                      <div style={badgeStyle}>Liked you</div>

                      {showFallback ? (
                        <div style={fallbackStyle}>{getInitials(p.displayName)}</div>
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
                            setBrokenImages((prev) => ({
                              ...prev,
                              [p.id]: true,
                            }))
                          }
                        />
                      )}
                    </div>
                  </Link>

                  <div style={{ padding: "1rem" }}>
                    <div style={{ fontSize: "1.3rem", fontWeight: 800 }}>
                      {p.displayName}
                    </div>

                    <div style={{ color: "#666", marginTop: "0.35rem" }}>
                      {p.age} • {p.city}, {p.stateUS}
                    </div>

                    <div
                      style={{
                        marginTop: "0.8rem",
                        display: "grid",
                        gridTemplateColumns: "1fr",
                        gap: "0.6rem",
                      }}
                    >
                      <Link href={`/profiles/${p.id}`} style={primaryButtonStyle}>
                        View Profile
                      </Link>

                      <Link
                        href={`/messages?withProfileId=${encodeURIComponent(
                          p.id
                        )}&with=${encodeURIComponent(p.displayName)}`}
                        style={secondaryButtonStyle}
                      >
                        Message
                      </Link>
                    </div>

                    <div
                      style={{
                        marginTop: "0.9rem",
                        color: "#555",
                        fontSize: "0.95rem",
                        lineHeight: 1.45,
                        display: "-webkit-box",
                        WebkitLineClamp: 5,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
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
                        <span key={t} style={tagStyle}>
                          {t}
                        </span>
                      ))}
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

const navStyle: React.CSSProperties = {
  padding: "0.65rem 1rem",
  border: "1px solid #ccc",
  borderRadius: 10,
  textDecoration: "none",
  color: "inherit",
  background: "white",
};

const noticeStyle: React.CSSProperties = {
  marginTop: "1.5rem",
  padding: "1.25rem",
  borderRadius: 14,
  border: "1px solid #eee",
  color: "#555",
  background: "white",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 18,
  overflow: "hidden",
  background: "white",
  boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
};

const badgeStyle: React.CSSProperties = {
  position: "absolute",
  top: 10,
  right: 10,
  zIndex: 2,
  padding: "0.35rem 0.7rem",
  borderRadius: 999,
  border: "1px solid #ddd",
  background: "rgba(255,255,255,0.92)",
  color: "#333",
  fontSize: "0.85rem",
  fontWeight: 700,
};

const fallbackStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "grid",
  placeItems: "center",
  background: "#f2f2f2",
  color: "#555",
  fontSize: "1.5rem",
  fontWeight: 700,
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "0.75rem 1rem",
  borderRadius: 12,
  border: "1px solid #0a5",
  textDecoration: "none",
  color: "#064",
  background: "white",
  display: "block",
  textAlign: "center",
  fontWeight: 800,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "0.75rem 1rem",
  borderRadius: 12,
  border: "1px solid #ccc",
  textDecoration: "none",
  color: "inherit",
  background: "white",
  display: "block",
  textAlign: "center",
  fontWeight: 700,
};

const tagStyle: React.CSSProperties = {
  fontSize: "0.85rem",
  padding: "0.25rem 0.5rem",
  border: "1px solid #ddd",
  borderRadius: 999,
  color: "#444",
};

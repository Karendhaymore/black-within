"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getOrCreateUserId } from "../lib/user";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

type ApiNotification = {
  id: string;
  user_id: string; // recipient
  type: string;
  message: string;
  created_at: string;

  // ✅ new fields (API will provide after backend update below)
  actor_user_id?: string | null;
  actor_profile_id?: string | null;
  actor_display_name?: string | null;
};

type NotificationsResponse = { items: ApiNotification[] };

async function apiGetNotifications(userId: string): Promise<ApiNotification[]> {
  const res = await fetch(
    `${API_BASE}/notifications?user_id=${encodeURIComponent(userId)}`,
    { method: "GET", cache: "no-store" }
  );
  if (!res.ok) throw new Error("Failed to load notifications.");
  const json = (await res.json()) as NotificationsResponse;
  return Array.isArray(json?.items) ? json.items : [];
}

async function apiClearNotifications(userId: string) {
  const res = await fetch(
    `${API_BASE}/notifications?user_id=${encodeURIComponent(userId)}`,
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error("Failed to clear notifications.");
}

export default function NotificationsPage() {
  const [userId, setUserId] = useState<string>("");

  const [items, setItems] = useState<ApiNotification[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [clearing, setClearing] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }

  async function refresh(uid: string, opts?: { quiet?: boolean }) {
    try {
      setApiError(null);
      if (!opts?.quiet) setLoading(true);
      else setRefreshing(true);

      const rows = await apiGetNotifications(uid);
      setItems(rows);
    } catch (e: any) {
      setApiError(e?.message || "Could not load notifications from the API.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const uid = getOrCreateUserId();
    setUserId(uid);
    refresh(uid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onClearAll() {
    if (!userId) return;

    const prev = items;
    setClearing(true);
    setItems([]); // optimistic

    try {
      await apiClearNotifications(userId);
      showToast("Cleared notifications.");
      await refresh(userId, { quiet: true });
    } catch (e: any) {
      setItems(prev);
      setApiError(e?.message || "Could not clear notifications.");
      showToast("Could not clear right now. Please try again.");
    } finally {
      setClearing(false);
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
              Notifications
            </h1>
            <p style={{ color: "#555" }}>
              Likes notify the recipient. Messaging stays locked for now.
            </p>

            <div
              style={{
                marginTop: "0.85rem",
                padding: "0.85rem",
                borderRadius: 12,
                border: "1px solid #eee",
                color: "#555",
              }}
            >
              Tip: You’ll only see a “like” notification if someone likes a
              profile you own (from a different browser/user).
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => refresh(userId, { quiet: true })}
              disabled={loading || refreshing || !userId}
              style={{
                padding: "0.65rem 1rem",
                border: "1px solid #ccc",
                borderRadius: 10,
                background: "white",
                cursor: loading || refreshing || !userId ? "not-allowed" : "pointer",
                opacity: loading || refreshing || !userId ? 0.6 : 1,
                height: "fit-content",
              }}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>

            <button
              onClick={onClearAll}
              disabled={loading || clearing || items.length === 0}
              style={{
                padding: "0.65rem 1rem",
                border: "1px solid #ccc",
                borderRadius: 10,
                background: "white",
                cursor:
                  loading || clearing || items.length === 0 ? "not-allowed" : "pointer",
                opacity: loading || clearing || items.length === 0 ? 0.6 : 1,
                height: "fit-content",
              }}
            >
              {clearing ? "Clearing..." : "Clear all"}
            </button>

            <Link
              href="/discover"
              style={{
                padding: "0.65rem 1rem",
                border: "1px solid #ccc",
                borderRadius: 10,
                textDecoration: "none",
                color: "inherit",
                height: "fit-content",
              }}
            >
              Back to Discover
            </Link>

            <Link
              href="/liked"
              style={{
                padding: "0.65rem 1rem",
                border: "1px solid #ccc",
                borderRadius: 10,
                textDecoration: "none",
                color: "inherit",
                height: "fit-content",
              }}
            >
              Liked
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
          <div
            style={{
              marginTop: "1.5rem",
              padding: "1.25rem",
              border: "1px solid #eee",
              borderRadius: 12,
              color: "#666",
            }}
          >
            Loading notifications…
          </div>
        ) : items.length === 0 ? (
          <div
            style={{
              marginTop: "1.5rem",
              padding: "1.25rem",
              border: "1px solid #eee",
              borderRadius: 12,
              color: "#666",
            }}
          >
            No notifications yet.
          </div>
        ) : (
          <div style={{ marginTop: "1.5rem", display: "grid", gap: "0.75rem" }}>
            {items.map((n) => {
              const who =
                (n.actor_display_name || "").trim() ||
                (n.actor_user_id ? "Someone" : "Someone");

              return (
                <div
                  key={n.id}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: "1rem",
                    background: "white",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "1rem",
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>
                      {/* ✅ show liker name + link to their profile if available */}
                      {n.type === "like" && n.actor_profile_id ? (
                        <>
                          <Link
                            href={`/profiles/${n.actor_profile_id}`}
                            style={{ textDecoration: "underline", color: "inherit" }}
                          >
                            {who}
                          </Link>{" "}
                          liked your profile.
                        </>
                      ) : n.type === "like" ? (
                        <>{who} liked your profile.</>
                      ) : (
                        <>{n.message}</>
                      )}
                    </div>

                    <span
                      style={{
                        fontSize: "0.8rem",
                        padding: "0.2rem 0.55rem",
                        borderRadius: 999,
                        border: "1px solid #ddd",
                        color: "#555",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {n.type || "notice"}
                    </span>
                  </div>

                  <div
                    style={{
                      color: "#777",
                      fontSize: "0.9rem",
                      marginTop: "0.35rem",
                    }}
                  >
                    {new Date(n.created_at).toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: "2rem", color: "#777", fontSize: "0.95rem" }}>
          MVP note: Notifications are stored in the database (cross-device).
        </div>
      </div>
    </main>
  );
}

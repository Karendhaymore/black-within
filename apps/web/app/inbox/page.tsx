"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

// ✅ UPDATED per your request
type ThreadItem = {
  thread_id: string;

  // UI expects these:
  with_user_id?: string | null;
  with_profile_id?: string | null;
  with_display_name?: string | null;
  with_photo?: string | null;

  last_message?: string | null;
  last_at?: string | null;
  unread_count?: number | null;

  // API may also return these (we normalize them):
  other_user_id?: string | null;
  other_profile_id?: string | null;
  other_display_name?: string | null;
  other_photo?: string | null;

  last_message_text?: string | null;
  last_message_at?: string | null;

  updated_at?: string | null;
};

// ✅ UPDATED per your request
type ThreadsResponse = { items: any[] } | { threads: any[] } | any[];

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

async function safeReadErrorDetail(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data?.detail != null)
      return typeof data.detail === "string"
        ? data.detail
        : JSON.stringify(data.detail);
    return JSON.stringify(data);
  } catch {}
  try {
    const text = await res.text();
    if (text) return text;
  } catch {}
  return `Request failed (${res.status}).`;
}

// ✅ REPLACED ENTIRE FUNCTION per your request
async function fetchThreads(userId: string): Promise<ThreadItem[]> {
  // Keep /threads first because it is the correct one now.
  const candidates = [
    `${API_BASE}/threads?user_id=${encodeURIComponent(userId)}`,
    `${API_BASE}/threads/inbox?user_id=${encodeURIComponent(userId)}`,
    `${API_BASE}/messages/threads?user_id=${encodeURIComponent(userId)}`,
    `${API_BASE}/threads/list?user_id=${encodeURIComponent(userId)}`,
    `${API_BASE}/inbox?user_id=${encodeURIComponent(userId)}`,
  ];

  let lastErr = "";

  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });

      if (!res.ok) {
        lastErr = await safeReadErrorDetail(res);
        continue;
      }

      const data = (await res.json()) as ThreadsResponse;

      // Normalize response shape -> array
      let rows: any[] = [];
      if (Array.isArray(data)) rows = data;
      else if (Array.isArray((data as any).items)) rows = (data as any).items;
      else if (Array.isArray((data as any).threads))
        rows = (data as any).threads;

      // Normalize field names from API -> UI expectations
      const normalized: ThreadItem[] = rows
        .map((r: any) => {
          const thread_id = String(r.thread_id ?? r.threadId ?? r.id ?? "").trim();
          if (!thread_id) return null;

          const with_user_id =
            r.with_user_id ??
            r.withUserId ??
            r.other_user_id ??
            r.otherUserId ??
            null;

          // Filter broken rows (like other_user_id = "undefined")
          if (!with_user_id || String(with_user_id) === "undefined") return null;

          const with_profile_id =
            r.with_profile_id ??
            r.withProfileId ??
            r.other_profile_id ??
            r.otherProfileId ??
            null;

          const with_display_name =
            r.with_display_name ??
            r.withDisplayName ??
            r.other_display_name ??
            r.otherDisplayName ??
            null;

          const with_photo =
            r.with_photo ?? r.withPhoto ?? r.other_photo ?? r.otherPhoto ?? null;

          const last_message =
            r.last_message ??
            r.lastMessage ??
            r.last_message_text ??
            r.lastMessageText ??
            null;

          const last_at =
            r.last_at ??
            r.lastAt ??
            r.last_message_at ??
            r.lastMessageAt ??
            r.updated_at ??
            r.updatedAt ??
            null;

          const unread_count = r.unread_count ?? r.unreadCount ?? 0;

          return {
            thread_id,
            with_user_id: with_user_id ? String(with_user_id) : null,
            with_profile_id: with_profile_id ? String(with_profile_id) : null,
            with_display_name: with_display_name ? String(with_display_name) : null,
            with_photo: with_photo ? String(with_photo) : null,
            last_message: last_message ? String(last_message) : null,
            last_at: last_at ? String(last_at) : null,
            unread_count: Number(unread_count || 0),
          } as ThreadItem;
        })
        .filter(Boolean) as ThreadItem[];

      return normalized;
    } catch (e: any) {
      lastErr = e?.message ? String(e.message) : String(e);
    }
  }

  throw new Error(
    `Could not load inbox threads from the API.\n\nTried:\n- ${candidates.join(
      "\n- "
    )}\n\nLast error:\n${lastErr || "(unknown)"}`
  );
}

function fmtTime(iso?: string | null): string {
  if (!iso) return "";
  // Keep it simple & stable
  return iso.slice(0, 19).replace("T", " ");
}

export default function InboxPage() {
  const userId = useMemo(() => getLoggedInUserId(), []);

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [items, setItems] = useState<ThreadItem[]>([]);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    if (!userId) {
      window.location.href = "/auth";
      return;
    }

    let cancelled = false;

    (async () => {
      setStatus("loading");
      setErr("");

      try {
        const threads = await fetchThreads(userId);
        if (cancelled) return;

        // Sort newest first (best-effort)
        const sorted = [...threads].sort((a, b) => {
          const ta = (a.last_at || "").toString();
          const tb = (b.last_at || "").toString();
          return tb.localeCompare(ta);
        });

        setItems(sorted);
        setStatus("ready");
      } catch (e: any) {
        if (cancelled) return;
        setStatus("error");
        setErr(e?.message ? String(e.message) : String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // ---- Style (matches your homepage vibe) ----
  const bg = {
    minHeight: "100vh",
    padding: "2.5rem 1rem",
    background:
      "radial-gradient(1200px 700px at 15% 10%, rgba(197,137,45,0.18), transparent 60%), radial-gradient(900px 600px at 85% 20%, rgba(10,85,0,0.14), transparent 55%), radial-gradient(900px 700px at 50% 92%, rgba(0,0,0,0.14), transparent 55%), #0b0b0b",
  } as const;

  const frame = {
    width: "100%",
    maxWidth: 980,
    margin: "0 auto",
  } as const;

  const topBarGlow = {
    margin: "0 auto 14px",
    maxWidth: 980,
    height: 10,
    borderRadius: 999,
    background:
      "linear-gradient(90deg, rgba(197,137,45,0.0), rgba(197,137,45,0.55), rgba(10,85,0,0.55), rgba(197,137,45,0.55), rgba(197,137,45,0.0))",
    opacity: 0.9,
  } as const;

  const card = {
    width: "100%",
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.92)",
    boxShadow: "0 18px 60px rgba(0,0,0,0.28)",
    padding: "1.5rem",
    backdropFilter: "blur(8px)",
  } as const;

  const pill = {
    display: "inline-block",
    padding: "0.4rem 0.75rem",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.14)",
    background: "rgba(197,137,45,0.10)",
    color: "rgba(0,0,0,0.78)",
    fontWeight: 800,
    fontSize: 12,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
  };

  const pillBtn: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.75rem 1rem",
    borderRadius: 999,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    textDecoration: "none",
    fontWeight: 900,
    letterSpacing: "0.01em",
    cursor: "pointer",
  };

  const softBtn: React.CSSProperties = {
    ...pillBtn,
    background: "transparent",
    color: "#111",
    border: "1px solid rgba(0,0,0,0.22)",
  };

  const rowCard: React.CSSProperties = {
    display: "flex",
    gap: 12,
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.9rem 0.95rem",
    borderRadius: 16,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(255,255,255,0.98)",
    textDecoration: "none",
    color: "inherit",
  };

  const avatar: React.CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(0,0,0,0.06)",
    objectFit: "cover",
    flex: "0 0 auto",
  };

  return (
    <main style={bg}>
      <div style={frame}>
        <div style={topBarGlow} />

        <section style={card}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={pill}>Black Within</div>

              <h1
                style={{
                  margin: "12px 0 6px",
                  fontSize: "2.2rem",
                  color: "#111",
                  letterSpacing: "-0.02em",
                }}
              >
                Messages
              </h1>

              <div style={{ color: "rgba(0,0,0,0.68)", lineHeight: 1.5 }}>
                Your conversations live here — safe, intentional, and protected.
              </div>

              <div style={{ marginTop: 10, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
                <strong>API:</strong> {API_BASE}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Link href="/discover" style={pillBtn}>
                Enter Community
              </Link>
              <button onClick={() => window.location.reload()} style={softBtn} title="Refresh inbox">
                Refresh
              </button>
            </div>
          </div>

          {status === "loading" ? (
            <div style={{ marginTop: 18, color: "rgba(0,0,0,0.7)" }}>Loading…</div>
          ) : null}

          {status === "error" ? (
            <div
              style={{
                marginTop: 18,
                padding: 14,
                borderRadius: 16,
                border: "1px solid rgba(176,0,32,0.25)",
                background: "rgba(176,0,32,0.06)",
                whiteSpace: "pre-wrap",
                color: "#5b0d1a",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Inbox error</div>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                {err || "Something went wrong loading your inbox."}
              </div>

              <div style={{ marginTop: 12, fontSize: 12, opacity: 0.85 }}>
                If this happens, it usually means the API doesn’t have a “list threads” endpoint yet (or it’s named
                differently). We can wire it up in the backend next.
              </div>
            </div>
          ) : null}

          {status === "ready" ? (
            <div style={{ marginTop: 18 }}>
              {items.length === 0 ? (
                <div
                  style={{
                    padding: 16,
                    borderRadius: 16,
                    border: "1px solid rgba(0,0,0,0.12)",
                    background: "rgba(255,255,255,0.98)",
                    color: "rgba(0,0,0,0.72)",
                    lineHeight: 1.6,
                  }}
                >
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>No conversations yet</div>
                  <div>Go to the community, open a profile, and start a chat.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {items.map((t, idx) => {
                    const threadId = (t.thread_id || "").trim();

                    // ✅ Name/photo (normalized fallback)
                    const name = (t.with_display_name || (t as any).other_display_name || "Member").trim();
                    const photo = (t.with_photo || (t as any).other_photo || null) as string | null;

                    // ✅ NEW: pick up profile id (normalized fallback)
                    const withProfileId = (t.with_profile_id || (t as any).other_profile_id || "").trim();

                    const last = (t.last_message || "").trim();
                    const when = fmtTime(t.last_at);

                    // ✅ REQUIRED by your new change
                    const unread = Number((t as any).unread_count || 0);

                    // ✅ Updated href:
                    // - includes withPhoto if present
                    // - includes withProfileId if present
                    const href =
                      `/messages?threadId=${encodeURIComponent(threadId)}` +
                      `&with=${encodeURIComponent(name)}` +
                      (photo ? `&withPhoto=${encodeURIComponent(photo)}` : "") +
                      (withProfileId ? `&withProfileId=${encodeURIComponent(withProfileId)}` : "");

                    return (
                      <Link key={`${threadId}-${idx}`} href={href} style={rowCard}>
                        <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                          {/* Avatar uses `photo` (fallback handles initials) */}
                          {photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={photo} alt={name} style={avatar} />
                          ) : (
                            <div
                              style={{
                                ...avatar,
                                display: "grid",
                                placeItems: "center",
                                fontWeight: 900,
                                color: "rgba(0,0,0,0.6)",
                              }}
                            >
                              {name.slice(0, 1).toUpperCase()}
                            </div>
                          )}

                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", gap: 10, alignItems: "baseline", minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: 900,
                                  color: "#111",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  maxWidth: 420,
                                }}
                              >
                                {name}
                              </div>

                              {when ? <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>{when}</div> : null}
                            </div>

                            <div
                              style={{
                                marginTop: 4,
                                fontSize: 13,
                                color: "rgba(0,0,0,0.68)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: 560,
                              }}
                            >
                              {last || "Tap to open this conversation."}
                            </div>
                          </div>
                        </div>

                        {/* Right side: unread badge + Open */}
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flex: "0 0 auto" }}>
                          {unread > 0 ? (
                            <div
                              style={{
                                minWidth: 22,
                                height: 22,
                                padding: "0 7px",
                                borderRadius: 999,
                                background: "#0a5411",
                                color: "white",
                                display: "grid",
                                placeItems: "center",
                                fontWeight: 900,
                                fontSize: 12,
                                lineHeight: "22px",
                              }}
                              aria-label={`${unread} unread messages`}
                              title="Unread messages"
                            >
                              {unread > 99 ? "99+" : unread}
                            </div>
                          ) : null}

                          <div
                            style={{
                              padding: "0.55rem 0.85rem",
                              borderRadius: 999,
                              border: "1px solid rgba(0,0,0,0.18)",
                              background: "rgba(197,137,45,0.10)",
                              fontWeight: 900,
                              color: "#111",
                              fontSize: 12,
                            }}
                          >
                            Open
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}

              <div style={{ marginTop: 18, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
                Move slow. Move honest. Move protected.
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

/**
 * Optional testing bypass:
 * - If NEXT_PUBLIC_AUTH_PREVIEW_MODE=true on the WEB app, the UI will unlock messaging.
 * - You should ALSO set AUTH_PREVIEW_MODE=true on the API so POST /messages succeeds.
 */
const PREVIEW_MODE =
  (process.env.NEXT_PUBLIC_AUTH_PREVIEW_MODE || "").trim().toLowerCase() === "true";

type MessageItem = {
  id: number | string;
  thread_id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
};

// includes otherLastReadAt
type MessagesResponse = {
  items: MessageItem[];
  otherLastReadAt?: string | null;
};

type MessagingAccessResponse = {
  canMessage: boolean;
  isPremium: boolean;
  unlockedUntilUTC?: string | null;
  reason?: string | null;
};

type CheckoutSessionResponse = { url: string };

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

function stringifyError(e: any): string {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  if (e?.message) return String(e.message);
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

async function safeReadErrorDetail(res: Response): Promise<string> {
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

async function apiMessagingAccess(userId: string, threadId: string): Promise<MessagingAccessResponse> {
  const url =
    `${API_BASE}/messaging/access` +
    `?user_id=${encodeURIComponent(userId)}` +
    `&thread_id=${encodeURIComponent(threadId)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(await safeReadErrorDetail(res));
  return (await res.json()) as MessagingAccessResponse;
}

async function apiGetMessages(userId: string, threadId: string): Promise<MessagesResponse> {
  const url =
    `${API_BASE}/messages` +
    `?user_id=${encodeURIComponent(userId)}` +
    `&thread_id=${encodeURIComponent(threadId)}` +
    `&limit=200`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(await safeReadErrorDetail(res));
  const json = (await res.json()) as MessagesResponse;
  return {
    items: Array.isArray(json?.items) ? json.items : [],
    otherLastReadAt: json?.otherLastReadAt ?? null,
  };
}

async function apiSendMessage(userId: string, threadId: string, body: string) {
  const res = await fetch(`${API_BASE}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, thread_id: threadId, body }),
  });

  if (!res.ok) throw new Error(await safeReadErrorDetail(res));
  return (await res.json()) as MessageItem;
}

async function apiCheckoutThreadUnlock(userId: string, threadId: string): Promise<CheckoutSessionResponse> {
  const res = await fetch(`${API_BASE}/stripe/checkout/thread-unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, thread_id: threadId }),
  });
  if (!res.ok) throw new Error(await safeReadErrorDetail(res));
  return (await res.json()) as CheckoutSessionResponse;
}

async function apiCheckoutPremium(userId: string): Promise<CheckoutSessionResponse> {
  const res = await fetch(`${API_BASE}/stripe/checkout/premium`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) throw new Error(await safeReadErrorDetail(res));
  return (await res.json()) as CheckoutSessionResponse;
}

// photo fetch (by profileId)
async function apiGetProfilePhoto(profileId: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/profiles/${encodeURIComponent(profileId)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.photo || null;
}

// mark thread read (best effort)
async function apiMarkThreadRead(userId: string, threadId: string) {
  try {
    await fetch(`${API_BASE}/threads/mark-read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, thread_id: threadId }),
    });
  } catch {
    // don't crash UI if it fails
  }
}

/**
 * Next.js requires useSearchParams() to be wrapped in <Suspense>.
 */
export default function MessagesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 16, color: "white" }}>Loading messages…</div>}>
      <MessagesInner />
    </Suspense>
  );
}

function MessagesInner() {
  const sp = useSearchParams();
  const threadId = sp.get("threadId") || "";

  const router = useRouter();

  useEffect(() => {
    if (!threadId) {
      router.replace("/inbox");
    }
  }, [threadId, router]);

  if (!threadId) return null;

  // Read from URL
  const withName = sp.get("with") || "";
  const withProfileId = sp.get("withProfileId") || "";

  const userId = useMemo(() => getLoggedInUserId(), []);

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [access, setAccess] = useState<MessagingAccessResponse | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string>("");

  const [withPhoto, setWithPhoto] = useState<string | null>(null);
  const [otherLastReadAt, setOtherLastReadAt] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const [photoRequired, setPhotoRequired] = useState(false);

  function stopPolling() {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function refreshAll(uid: string) {
    let a: MessagingAccessResponse | null = null;
    try {
      a = await apiMessagingAccess(uid, threadId);
    } catch (e: any) {
      if (!PREVIEW_MODE) throw e;
      a = {
        canMessage: true,
        isPremium: false,
        reason: "Preview mode: bypassed access check error.",
      };
    }

    if (PREVIEW_MODE && a && !a.canMessage) {
      a = {
        ...a,
        canMessage: true,
        isPremium: a.isPremium ?? false,
        reason: "Preview mode enabled (NEXT_PUBLIC_AUTH_PREVIEW_MODE=true). UI unlocked for testing.",
      };
    }

    setAccess(a);

    const json = await apiGetMessages(uid, threadId);
    setMessages(json.items || []);
    setOtherLastReadAt(json.otherLastReadAt || null);

    return a;
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!userId) {
        window.location.href = "/auth";
        return;
      }

      // mark read on open (best effort)
      apiMarkThreadRead(userId, threadId);

      setStatus("loading");
      setErr("");

      try {
        const a = await refreshAll(userId);
        if (cancelled) return;

        // fetch other person's photo by profile id
        if (withProfileId) {
          try {
            const photo = await apiGetProfilePhoto(withProfileId);
            if (!cancelled) setWithPhoto(photo);
          } catch {
            if (!cancelled) setWithPhoto(null);
          }
        } else {
          setWithPhoto(null);
        }

        setStatus("ready");

        stopPolling();

        // Poll only when canMessage (your current intent)
        if (a?.canMessage) {
          pollRef.current = window.setInterval(async () => {
            try {
              const latest = await apiGetMessages(userId, threadId);
              if (!cancelled) {
                setMessages(latest.items || []);
                setOtherLastReadAt(latest.otherLastReadAt || null);
              }
            } catch {
              // ignore polling errors
            }
          }, 4000);
        }
      } catch (e: any) {
        setStatus("error");
        setErr(stringifyError(e) || "Something went wrong loading this chat.");
      }
    }

    load();

    return () => {
      cancelled = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, userId, withProfileId, withName]);

  useEffect(() => {
    if (!bottomRef.current) return;
    bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const locked = !!access && !access.canMessage;

  // Find last message YOU sent
  const lastSentByMe = useMemo(() => {
    const uid = userId || "";
    return [...messages].filter((m) => (m.sender_user_id || "") === uid).slice(-1)[0];
  }, [messages, userId]);

  const seen = useMemo(() => {
    if (!lastSentByMe) return false;
    if (!otherLastReadAt) return false;
    const otherTs = new Date(otherLastReadAt).getTime();
    const sentTs = new Date(lastSentByMe.created_at).getTime();
    return Number.isFinite(otherTs) && Number.isFinite(sentTs) && otherTs >= sentTs;
  }, [lastSentByMe, otherLastReadAt]);

  async function handleSend() {
    if (!userId || !threadId) return;

    const body = text.trim();
    if (!body) return;

    setErr("");

    try {
      if (locked) throw new Error(access?.reason || "Messaging locked.");

      const tempId = `temp-${Date.now()}`;
      const temp: MessageItem = {
        id: tempId,
        thread_id: threadId,
        sender_user_id: userId,
        body,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, temp]);
      setText("");

      const saved = await apiSendMessage(userId, threadId, body);
      setMessages((prev) => prev.map((m) => (String(m.id) === tempId ? saved : m)));

      // success → clear photo-required state if it was showing
      setPhotoRequired(false);
    } catch (e: any) {
      const msg = String(e?.message || "");

      if (msg.includes("photo_required")) {
        setPhotoRequired(true);
        setErr("");
        return;
      }

      setErr(msg || "Failed to send");
    }
  }

  async function handleRefresh() {
    if (!userId || !threadId) return;

    setErr("");
    try {
      apiMarkThreadRead(userId, threadId);
      const a = await refreshAll(userId);

      stopPolling();
      if (a?.canMessage) {
        pollRef.current = window.setInterval(async () => {
          try {
            const latest = await apiGetMessages(userId, threadId);
            setMessages(latest.items || []);
            setOtherLastReadAt(latest.otherLastReadAt || null);
          } catch {}
        }, 4000);
      }
    } catch (e: any) {
      setErr(stringifyError(e) || "Refresh failed.");
    }
  }

  async function handleUnlock() {
    if (!userId) {
      window.location.href = "/auth";
      return;
    }
    if (!threadId) {
      setErr("Missing threadId. Go back and open a chat from a profile.");
      return;
    }

    setErr("");
    try {
      const data = await apiCheckoutThreadUnlock(userId, threadId);
      if (!data?.url) throw new Error("Checkout URL missing from API response.");
      window.location.href = data.url;
    } catch (e: any) {
      setErr(stringifyError(e) || "Failed to start checkout.");
    }
  }

  async function handlePremium() {
    if (!userId) {
      window.location.href = "/auth";
      return;
    }

    setErr("");
    try {
      const data = await apiCheckoutPremium(userId);
      if (!data?.url) throw new Error("Checkout URL missing from API response.");
      window.location.href = data.url;
    } catch (e: any) {
      setErr(stringifyError(e) || "Failed to start premium checkout.");
    }
  }

  // --- Style tokens (Black + Gold + Green) ---
  const bg: React.CSSProperties = {
    minHeight: "100vh",
    padding: "2.25rem 1rem",
    background:
      "radial-gradient(1200px 700px at 15% 10%, rgba(197,137,45,0.18), transparent 60%), radial-gradient(900px 600px at 85% 20%, rgba(10,85,0,0.14), transparent 55%), radial-gradient(900px 700px at 50% 92%, rgba(0,0,0,0.14), transparent 55%), #0b0b0b",
    display: "grid",
    placeItems: "start center",
  };

  const topGlow: React.CSSProperties = {
    margin: "0 auto 14px",
    maxWidth: 900,
    height: 10,
    borderRadius: 999,
    background:
      "linear-gradient(90deg, rgba(197,137,45,0.0), rgba(197,137,45,0.55), rgba(10,85,0,0.55), rgba(197,137,45,0.55), rgba(197,137,45,0.0))",
    opacity: 0.9,
  };

  const card: React.CSSProperties = {
    width: "100%",
    maxWidth: 900,
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.92)",
    boxShadow: "0 18px 60px rgba(0,0,0,0.28)",
    padding: "1.75rem",
    backdropFilter: "blur(8px)",
  };

  const pill: React.CSSProperties = {
    display: "inline-block",
    padding: "0.4rem 0.75rem",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.14)",
    background: "rgba(197,137,45,0.10)",
    color: "rgba(0,0,0,0.78)",
    fontWeight: 800,
    fontSize: 12,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };

  const pillBtn: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "0.85rem 1.05rem",
    borderRadius: 999,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    textDecoration: "none",
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  const pillBtnGhost: React.CSSProperties = {
    ...pillBtn,
    background: "rgba(255,255,255,0.85)",
    color: "#111",
    border: "1px solid rgba(0,0,0,0.18)",
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: "0.9rem 1rem",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.22)",
    background: "white",
    outline: "none",
  };

  const chatShell: React.CSSProperties = {
    marginTop: 16,
    border: "1px solid rgba(0,0,0,0.14)",
    borderRadius: 18,
    padding: 12,
    minHeight: 320,
    maxHeight: 520,
    overflowY: "auto",
    background: "rgba(255,255,255,0.75)",
  };

  const subText: React.CSSProperties = { opacity: 0.72, marginTop: 6, fontSize: 13 };

  const headerRight: React.CSSProperties = {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  };

  const lockBox: React.CSSProperties = {
    marginTop: 16,
    padding: 14,
    borderRadius: 18,
    border: locked ? "1px solid rgba(176,0,32,0.22)" : "1px solid rgba(10,85,0,0.22)",
    background: locked ? "rgba(176,0,32,0.05)" : "rgba(10,85,0,0.06)",
    color: locked ? "#7a1b1b" : "#0a5411",
    whiteSpace: "pre-wrap",
  };

  function formatTs(iso: string) {
    if (!iso) return "";
    return iso.slice(0, 19).replace("T", " ");
  }

  return (
    <main style={bg}>
      <div style={{ width: "100%", maxWidth: 980 }}>
        <div style={topGlow} />

        <section style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <div>
              <div style={pill}>Black Within • Messages</div>

              <h1 style={{ margin: "12px 0 6px", fontSize: "2.25rem", color: "#111", letterSpacing: "-0.02em" }}>
                Speak with intention.
              </h1>

              <div style={{ ...subText, display: "flex", alignItems: "center", gap: 8 }}>
                {withPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={withPhoto}
                    alt={withName}
                    style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: "rgba(0,0,0,0.1)",
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 900,
                    }}
                  >
                    {withName?.[0]?.toUpperCase()}
                  </div>
                )}
                <span>
                  With: <strong>{withName}</strong>
                </span>
              </div>

              <div style={{ ...subText, fontSize: 12 }}>
                <strong>Move slow. Move honest. Move protected.</strong>
              </div>

              {PREVIEW_MODE ? (
                <div style={{ marginTop: 8, fontSize: 12, color: "#0a5411", fontWeight: 800 }}>
                  Preview mode enabled (NEXT_PUBLIC_AUTH_PREVIEW_MODE=true)
                </div>
              ) : null}

              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>
                <strong>API:</strong> {API_BASE}
              </div>
            </div>

            <div style={headerRight}>
              <Link href="/discover" style={pillBtnGhost}>
                ← Back to Discover
              </Link>
              <button onClick={handleRefresh} style={pillBtnGhost}>
                Refresh
              </button>
            </div>
          </div>

          {status === "loading" ? <div style={{ marginTop: 18, opacity: 0.8 }}>Loading…</div> : null}

          {status === "error" ? (
            <div
              style={{
                marginTop: 18,
                padding: 14,
                borderRadius: 18,
                border: "1px solid rgba(176,0,32,0.25)",
                background: "rgba(176,0,32,0.05)",
                whiteSpace: "pre-wrap",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 6, color: "#7a1b1b" }}>Something blocked the path</div>
              <div style={{ color: "#7a1b1b" }}>{err || "Something went wrong."}</div>
            </div>
          ) : null}

          {status === "ready" ? (
            <>
              {access ? (
                <div style={lockBox}>
                  {locked ? (
                    <>
                      <div style={{ fontWeight: 1000, fontSize: 16 }}>Messaging locked</div>
                      <div style={{ marginTop: 8 }}>
                        {access.reason || "This thread is locked. Go Premium or unlock this conversation."}
                      </div>

                      {!PREVIEW_MODE ? (
                        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                          <button
                            onClick={handlePremium}
                            style={{ ...pillBtn, background: "#0a5411", border: "1px solid #0a5411" }}
                          >
                            Go Premium — $11.22/month
                          </button>

                          <button onClick={handleUnlock} style={pillBtn}>
                            Unlock Conversation — $1.99
                          </button>
                        </div>
                      ) : (
                        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.9 }}>
                          (Preview mode is ON, so checkout buttons are hidden.)
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{ fontWeight: 1000, fontSize: 16, color: "#0a5411" }}>Messaging active</div>
                      <div style={{ marginTop: 8, fontSize: 13 }}>
                        {access.isPremium ? "Premium access" : "Unlocked access"}
                        {access.unlockedUntilUTC ? (
                          <>
                            {" "}
                            • until <code>{access.unlockedUntilUTC}</code>
                          </>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              <div style={chatShell}>
                {messages.length === 0 ? (
                  <div style={{ opacity: 0.7 }}>No messages yet. Start clean. Start kind.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {messages.map((m) => {
                      const mine = (m.sender_user_id || "") === (userId || "");
                      const ts = formatTs(m.created_at || "");
                      const isLastSentByMe = mine && lastSentByMe && String(m.id) === String(lastSentByMe.id);

                      return (
                        <div key={String(m.id)} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                          <div
                            style={{
                              padding: "10px 12px",
                              borderRadius: 16,
                              border: "1px solid rgba(0,0,0,0.14)",
                              background: mine ? "rgba(10,85,0,0.06)" : "rgba(255,255,255,0.92)",
                              whiteSpace: "pre-wrap",
                              boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
                            }}
                          >
                            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6, fontWeight: 700 }}>
                              {mine ? "You" : withName || "Member"} • {ts}
                            </div>
                            <div style={{ fontSize: 15, lineHeight: 1.45 }}>{m.body}</div>
                          </div>

                          {mine && isLastSentByMe ? (
                            <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4, textAlign: "right" }}>
                              {seen ? "Seen" : "Sent"}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {/* ✅ ADD: Photo required block ABOVE the input area */}
              {photoRequired && (
                <div
                  style={{
                    marginTop: 12,
                    marginBottom: 12,
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: "rgba(255,165,0,0.15)",
                    border: "1px solid rgba(255,165,0,0.4)",
                    fontWeight: 600,
                  }}
                >
                  Upload a profile photo to message members.
                  <div style={{ marginTop: 8 }}>
                    <a
                      href="/profile"
                      style={{
                        display: "inline-block",
                        padding: "8px 12px",
                        borderRadius: 8,
                        background: "#111",
                        color: "#fff",
                        textDecoration: "none",
                        fontWeight: 700,
                      }}
                    >
                      Upload Photo
                    </a>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={locked ? "Messaging locked…" : "Type with intention…"}
                  disabled={locked}
                  style={{
                    ...inputStyle,
                    background: locked ? "rgba(0,0,0,0.04)" : "white",
                    cursor: locked ? "not-allowed" : "text",
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={locked}
                  style={{
                    ...pillBtn,
                    opacity: locked ? 0.6 : 1,
                    cursor: locked ? "not-allowed" : "pointer",
                  }}
                >
                  Send
                </button>
              </div>

              {err ? (
                <div style={{ marginTop: 12, color: "#b00020", whiteSpace: "pre-wrap", fontWeight: 700 }}>{err}</div>
              ) : null}
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}

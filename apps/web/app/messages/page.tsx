"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

/**
 * Path A (Testing Unlock)
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
  created_at: string; // ISO string
};

type MessagesResponse = { items: MessageItem[] };

type MessagingAccessResponse = {
  canMessage: boolean;
  isPremium: boolean;
  unlockedUntilUTC?: string | null;
  reason?: string | null;
};

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
  // Handles FastAPI:
  // { detail: "..." } OR { detail: [ ... ] }
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

async function apiMessagingAccess(
  userId: string,
  threadId: string
): Promise<MessagingAccessResponse> {
  const url =
    `${API_BASE}/messaging/access` +
    `?user_id=${encodeURIComponent(userId)}` +
    `&thread_id=${encodeURIComponent(threadId)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const msg = await safeReadErrorDetail(res);
    throw new Error(msg);
  }
  return (await res.json()) as MessagingAccessResponse;
}

async function apiGetMessages(userId: string, threadId: string): Promise<MessageItem[]> {
  const url =
    `${API_BASE}/messages` +
    `?user_id=${encodeURIComponent(userId)}` +
    `&thread_id=${encodeURIComponent(threadId)}` +
    `&limit=200`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const msg = await safeReadErrorDetail(res);
    throw new Error(msg);
  }

  const json = (await res.json()) as MessagesResponse;
  return Array.isArray(json?.items) ? json.items : [];
}

async function apiSendMessage(userId: string, threadId: string, body: string) {
  const res = await fetch(`${API_BASE}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, thread_id: threadId, body }),
  });

  if (!res.ok) {
    const msg = await safeReadErrorDetail(res);
    throw new Error(msg);
  }

  return (await res.json()) as MessageItem;
}

/**
 * ✅ IMPORTANT:
 * Next.js requires useSearchParams() to be wrapped in <Suspense>.
 */
export default function MessagesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading messages…</div>}>
      <MessagesInner />
    </Suspense>
  );
}

function MessagesInner() {
  const sp = useSearchParams();
  const threadId = sp.get("threadId") || "";
  const withName = sp.get("with") || "";

  const userId = useMemo(() => getLoggedInUserId(), []);

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const [access, setAccess] = useState<MessagingAccessResponse | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string>("");

  // Polling for new messages (optional)
  const pollRef = useRef<number | null>(null);

  // Auto-scroll refs
  const bottomRef = useRef<HTMLDivElement | null>(null);

  function stopPolling() {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function refreshAll(uid: string) {
    // In preview mode, we still try to read access (so you can see it),
    // but we "force unlock" the UI even if it comes back locked.
    let a: MessagingAccessResponse | null = null;
    try {
      a = await apiMessagingAccess(uid, threadId);
    } catch (e: any) {
      // If access endpoint errors, we still allow you to view messages in preview mode
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
        reason:
          "Preview mode enabled (NEXT_PUBLIC_AUTH_PREVIEW_MODE=true). UI unlocked for testing.",
      };
    }

    setAccess(a);

    const items = await apiGetMessages(uid, threadId);
    setMessages(items);

    return a;
  }

  // Load chat
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!threadId) {
        setStatus("error");
        setErr("Missing threadId in the URL. Go back and open a chat from a profile.");
        stopPolling();
        return;
      }

      if (!userId) {
        window.location.href = "/auth";
        return;
      }

      setStatus("loading");
      setErr("");

      try {
        const a = await refreshAll(userId);
        if (cancelled) return;

        setStatus("ready");

        // Poll every 4s (only if messaging is allowed)
        stopPolling();
        if (a?.canMessage) {
          pollRef.current = window.setInterval(async () => {
            try {
              const latest = await apiGetMessages(userId, threadId);
              if (!cancelled) setMessages(latest);
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
  }, [threadId, userId]);

  // ✅ Auto-scroll to newest message whenever messages change
  useEffect(() => {
    if (!bottomRef.current) return;
    bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const locked = !!access && !access.canMessage;

  async function handleSend() {
    if (!userId) return;
    if (!threadId) return;

    const body = text.trim();
    if (!body) return;

    setErr("");

    try {
      if (locked) {
        throw new Error(access?.reason || "Messaging locked.");
      }

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
    } catch (e: any) {
      setErr(stringifyError(e) || "Failed to send message.");
    }
  }

  async function handleRefresh() {
    if (!userId) return;
    if (!threadId) return;

    setErr("");
    try {
      const a = await refreshAll(userId);

      stopPolling();
      if (a?.canMessage) {
        pollRef.current = window.setInterval(async () => {
          try {
            const latest = await apiGetMessages(userId, threadId);
            setMessages(latest);
          } catch {}
        }, 4000);
      }
    } catch (e: any) {
      setErr(stringifyError(e) || "Refresh failed.");
    }
  }

  const navBtnStyle: React.CSSProperties = {
    padding: "0.65rem 1rem",
    border: "1px solid #ccc",
    borderRadius: 10,
    textDecoration: "none",
    color: "inherit",
    height: "fit-content",
    background: "white",
    display: "inline-block",
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Messages</h1>
          <div style={{ opacity: 0.75, marginTop: 4 }}>
            Thread: <code>{threadId || "(none)"}</code>{" "}
            {withName ? (
              <>
                • With: <strong>{withName}</strong>
              </>
            ) : null}
          </div>
          <div style={{ opacity: 0.75, marginTop: 6, fontSize: 12 }}>
            <strong>API:</strong> {API_BASE}
          </div>
          {PREVIEW_MODE ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#0a5" }}>
              Preview mode enabled (NEXT_PUBLIC_AUTH_PREVIEW_MODE=true)
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/discover" style={navBtnStyle}>
            Back to Discover
          </Link>

          <button onClick={handleRefresh} style={{ ...navBtnStyle, cursor: "pointer" }}>
            Refresh
          </button>
        </div>
      </div>

      {status === "loading" ? <div style={{ marginTop: 20 }}>Loading…</div> : null}

      {status === "error" ? (
        <div
          style={{
            marginTop: 20,
            padding: 12,
            border: "1px solid #f2b8b5",
            borderRadius: 12,
            whiteSpace: "pre-wrap",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Error</div>
          <div>{err || "Something went wrong."}</div>
        </div>
      ) : null}

      {status === "ready" ? (
        <>
          {access ? (
            <div
              style={{
                marginTop: 16,
                padding: 12,
                borderRadius: 12,
                border: locked ? "1px solid #f2c7c7" : "1px solid #d8e9d8",
                background: locked ? "#fff7f7" : "#f5fff5",
                color: locked ? "#7a1b1b" : "#1f5b1f",
                whiteSpace: "pre-wrap",
              }}
            >
              {locked ? (
                <>
                  <div style={{ fontWeight: 800 }}>Messaging locked</div>
                  <div style={{ marginTop: 6 }}>
                    {access.reason || "Messaging is for paid members or pay-per-message users."}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 800 }}>Messaging active</div>
                  <div style={{ marginTop: 6, fontSize: 13 }}>
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

          <div style={{ marginTop: 16 }}>
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 12,
                minHeight: 320,
                maxHeight: 520,
                overflowY: "auto",
              }}
            >
              {messages.length === 0 ? (
                <div style={{ opacity: 0.7 }}>No messages yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {messages.map((m) => {
                    const mine = (m.sender_user_id || "") === (userId || "");
                    const ts = (m.created_at || "").slice(0, 19).replace("T", " ");
                    return (
                      <div
                        key={String(m.id)}
                        style={{
                          alignSelf: mine ? "flex-end" : "flex-start",
                          maxWidth: "85%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid #ddd",
                          background: mine ? "#f5f5f5" : "#fff",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 4 }}>
                          {mine ? "You" : "Them"} • {ts}
                        </div>
                        <div>{m.body}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={locked ? "Messaging locked…" : "Type a message…"}
                disabled={locked}
                style={{
                  flex: 1,
                  padding: "0.75rem 0.9rem",
                  borderRadius: 12,
                  border: "1px solid #ccc",
                  background: locked ? "#f7f7f7" : "white",
                }}
              />
              <button
                onClick={handleSend}
                disabled={locked}
                style={{
                  padding: "0.75rem 1rem",
                  borderRadius: 12,
                  border: "1px solid #111",
                  background: locked ? "#999" : "#111",
                  color: "#fff",
                  cursor: locked ? "not-allowed" : "pointer",
                  opacity: locked ? 0.85 : 1,
                }}
              >
                Send
              </button>
            </div>

            {err ? <div style={{ marginTop: 10, color: "#b00020", whiteSpace: "pre-wrap" }}>{err}</div> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

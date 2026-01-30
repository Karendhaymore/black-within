"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

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

function toErrorMessage(e: any, fallback: string) {
  if (typeof e?.message === "string" && e.message.trim()) return e.message;
  if (typeof e === "string" && e.trim()) return e;
  try {
    const s = JSON.stringify(e);
    if (s && s !== "{}") return s;
  } catch {}
  return fallback;
}

async function safeReadErrorDetail(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data?.detail) return String(data.detail);
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
 * ADMIN/TEST ONLY (matches your backend):
 * POST /messaging/unlock?key=...
 * body: { user_id, minutes, make_premium }
 */
async function apiAdminUnlockMessaging(
  userId: string,
  minutes: number,
  key: string,
  makePremium: boolean
): Promise<MessagingAccessResponse> {
  const url = `${API_BASE}/messaging/unlock?key=${encodeURIComponent(key || "")}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, minutes, make_premium: makePremium }),
  });

  if (!res.ok) {
    const msg = await safeReadErrorDetail(res);
    throw new Error(msg);
  }

  return (await res.json()) as MessagingAccessResponse;
}

/**
 * ✅ IMPORTANT:
 * Next.js requires useSearchParams() to be wrapped in <Suspense>.
 * This wrapper component is the default export for the route.
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

  // Admin/test unlock controls (optional)
  const [adminKey, setAdminKey] = useState("");
  const [unlockMinutes, setUnlockMinutes] = useState<number>(60);
  const [makePremium, setMakePremium] = useState<boolean>(false);

  // Simple polling when unlocked (new messages)
  const pollRef = useRef<number | null>(null);

  // Auto-scroll anchor
  const bottomRef = useRef<HTMLDivElement | null>(null);

  function stopPolling() {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function refreshAll(uid: string, tid: string) {
    const a = await apiMessagingAccess(uid, tid);
    setAccess(a);

    const items = await apiGetMessages(uid, tid);
    setMessages(items);

    return a;
  }

  // Auto-scroll to newest message when list changes
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!userId) {
        window.location.href = "/auth";
        return;
      }

      // ✅ If user clicks top nav "Messages" (no threadId), show inbox screen (not error)
      if (!threadId) {
        setStatus("ready");
        setAccess(null);
        setMessages([]);
        setErr("");
        stopPolling();
        return;
      }

      setStatus("loading");
      setErr("");

      try {
        const a = await refreshAll(userId, threadId);
        if (cancelled) return;

        setStatus("ready");

        // Poll messages every 4s if messaging is allowed
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
        setErr(toErrorMessage(e, "Something went wrong loading this chat."));
      }
    }

    load();

    return () => {
      cancelled = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, userId]);

  async function handleSend() {
    if (!userId) return;
    if (!threadId) return;

    const body = text.trim();
    if (!body) return;

    setErr("");

    try {
      if (access && !access.canMessage) {
        throw new Error(access.reason || "Messaging locked.");
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
      setErr(toErrorMessage(e, "Failed to send message."));
    }
  }

  async function handleRefresh() {
    if (!userId) return;
    if (!threadId) return;

    setErr("");
    try {
      const a = await refreshAll(userId, threadId);
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
      setErr(toErrorMessage(e, "Refresh failed."));
    }
  }

  async function handleAdminUnlock() {
    if (!userId) return;
    if (!threadId) return;

    setErr("");

    try {
      if (!adminKey.trim()) throw new Error("Enter your ADMIN unlock key.");
      if (!unlockMinutes || unlockMinutes <= 0) throw new Error("Minutes must be > 0.");

      const a = await apiAdminUnlockMessaging(
        userId,
        Number(unlockMinutes),
        adminKey.trim(),
        makePremium
      );
      setAccess(a);

      const items = await apiGetMessages(userId, threadId);
      setMessages(items);

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
      setErr(toErrorMessage(e, "Unlock failed."));
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

  const locked = !!access && !access.canMessage;

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
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/discover" style={navBtnStyle}>
            Back to Discover
          </Link>

          <button
            onClick={handleRefresh}
            style={{
              ...navBtnStyle,
              cursor: threadId ? "pointer" : "not-allowed",
              opacity: threadId ? 1 : 0.6,
            }}
            disabled={!threadId}
          >
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
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Error</div>
          <div>{err || "Something went wrong."}</div>
        </div>
      ) : null}

      {status === "ready" && !threadId ? (
        <div
          style={{
            marginTop: 20,
            padding: 16,
            border: "1px solid #ddd",
            borderRadius: 12,
            background: "#fafafa",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>No chat selected yet</div>
          <div style={{ opacity: 0.85 }}>
            Go to <strong>Discover</strong> and click <strong>Message</strong> on a profile to open a
            chat.
          </div>
          <div style={{ marginTop: 12 }}>
            <Link href="/discover" style={navBtnStyle}>
              Go to Discover
            </Link>
          </div>
        </div>
      ) : null}

      {status === "ready" && threadId ? (
        <>
          {/* Paywall / access banner */}
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
                  {access.unlockedUntilUTC ? (
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
                      Unlocked until: <code>{access.unlockedUntilUTC}</code>
                    </div>
                  ) : null}
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

          {/* Admin/test unlock panel (optional) */}
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 12,
              border: "1px dashed #ddd",
              background: "#fafafa",
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Admin/Test Unlock (optional)</div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>
              Uses <code>POST /messaging/unlock</code>. Only works if your backend has
              <code> ADMIN_UNLOCK_KEY</code> set. This key is NOT stored—type it each time.
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder="ADMIN unlock key"
                style={{
                  flex: 1,
                  minWidth: 220,
                  padding: "0.65rem 0.8rem",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                }}
              />

              <input
                type="number"
                value={unlockMinutes}
                onChange={(e) => setUnlockMinutes(Number(e.target.value))}
                min={1}
                style={{
                  width: 120,
                  padding: "0.65rem 0.8rem",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                }}
              />

              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={makePremium}
                  onChange={(e) => setMakePremium(e.target.checked)}
                />
                Make premium
              </label>

              <button
                onClick={handleAdminUnlock}
                style={{
                  padding: "0.65rem 1rem",
                  borderRadius: 10,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Unlock
              </button>
            </div>
          </div>

          {/* Messages list */}
          <div style={{ marginTop: 16 }}>
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 12,
                minHeight: 320,
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
                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            {/* Composer */}
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

            {err ? <div style={{ marginTop: 10, color: "#b00020" }}>{err}</div> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

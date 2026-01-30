"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getOrCreateUserId } from "../lib/user";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  "https://black-within-api.onrender.com";

type Msg = {
  id?: number | string;
  thread_id?: string;
  sender_user_id?: string;
  body?: string;
  created_at?: string;
};

async function apiUnlockStatus(threadId: string, userId: string) {
  const res = await fetch(
    `${API_BASE}/threads/unlock-status?thread_id=${encodeURIComponent(
      threadId
    )}&user_id=${encodeURIComponent(userId)}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Failed to load unlock status");
  return (await res.json()) as { unlocked: boolean };
}

async function apiGetMessages(threadId: string, userId: string) {
  const res = await fetch(
    `${API_BASE}/messages?thread_id=${encodeURIComponent(
      threadId
    )}&user_id=${encodeURIComponent(userId)}`,
    { cache: "no-store" }
  );
  if (res.status === 402) return { locked: true, messages: [] as Msg[] };
  if (!res.ok) throw new Error("Failed to load messages");
  return { locked: false, messages: (await res.json()) as Msg[] };
}

async function apiSendMessage(
  threadId: string,
  senderUserId: string,
  body: string
) {
  const res = await fetch(`${API_BASE}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threadId, senderUserId, body }),
  });
  if (res.status === 402)
    throw new Error("Thread is locked. Please unlock to message.");
  if (!res.ok) throw new Error("Failed to send message");
  return (await res.json()) as Msg;
}

async function apiCreateCheckout(threadId: string, userId: string) {
  const res = await fetch(`${API_BASE}/stripe/create-checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threadId, userId }),
  });
  if (!res.ok) throw new Error("Failed to start checkout");
  return (await res.json()) as { url: string };
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

  const userId = useMemo(() => getOrCreateUserId(), []);

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [unlocked, setUnlocked] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string>("");

  // A small “post-checkout” poll: if Stripe redirects back before webhook finishes,
  // this will keep checking a few times.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!threadId) {
        setStatus("error");
        setErr(
          "Missing threadId in the URL. Go back and open a chat from a profile."
        );
        return;
      }

      setStatus("loading");
      setErr("");

      try {
        // First: check unlock status
        const s = await apiUnlockStatus(threadId, userId);
        if (cancelled) return;
        setUnlocked(!!s.unlocked);

        // If unlocked: load messages immediately
        if (s.unlocked) {
          const m = await apiGetMessages(threadId, userId);
          if (cancelled) return;
          setMessages(m.messages || []);
          setStatus("ready");
          return;
        }

        // If locked: we still set ready, and show the unlock screen
        setStatus("ready");

        // Optional: short poll after landing here (helps after Stripe success redirect)
        // Poll up to ~20 seconds.
        let tries = 0;
        const maxTries = 10;
        while (!cancelled && tries < maxTries) {
          await new Promise((r) => setTimeout(r, 2000));
          const s2 = await apiUnlockStatus(threadId, userId);
          if (cancelled) return;
          if (s2.unlocked) {
            setUnlocked(true);
            const m2 = await apiGetMessages(threadId, userId);
            if (cancelled) return;
            setMessages(m2.messages || []);
            break;
          }
          tries++;
        }
      } catch (e: any) {
        setStatus("error");
        setErr(e?.message || "Something went wrong loading this chat.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [threadId, userId]);

  async function handleUnlock() {
    setErr("");
    try {
      const { url } = await apiCreateCheckout(threadId, userId);
      if (!url) throw new Error("Checkout URL missing.");
      window.location.href = url; // Stripe redirect
    } catch (e: any) {
      setErr(e?.message || "Could not start checkout.");
    }
  }

  async function handleSend() {
    const body = text.trim();
    if (!body) return;
    setErr("");

    try {
      // Optimistic UI: add a temp message
      const temp: Msg = {
        id: `temp-${Date.now()}`,
        thread_id: threadId,
        sender_user_id: userId,
        body,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, temp]);
      setText("");

      const saved = await apiSendMessage(threadId, userId, body);

      // Replace temp with saved
      setMessages((prev) => prev.map((m) => (m.id === temp.id ? saved : m)));
    } catch (e: any) {
      setErr(e?.message || "Failed to send message.");
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
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
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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

      {status === "ready" ? (
        <>
          {!unlocked ? (
            <div
              style={{
                marginTop: 20,
                padding: 16,
                border: "1px solid #ddd",
                borderRadius: 12,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Chat is locked</div>
              <div style={{ opacity: 0.85, marginBottom: 12 }}>
                Unlock this chat to message. Price: <strong>$1.99</strong>
              </div>
              <button
                onClick={handleUnlock}
                style={{
                  padding: "0.75rem 1rem",
                  borderRadius: 12,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Unlock chat for $1.99
              </button>

              {err ? <div style={{ marginTop: 12, color: "#b00020" }}>{err}</div> : null}

              <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
                If you just paid and got redirected back, please wait a few seconds while we
                finalize your unlock.
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 20 }}>
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
                      const mine = (m.sender_user_id || "") === userId;
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
                            {mine ? "You" : "Them"} •{" "}
                            {(m.created_at || "").slice(0, 19).replace("T", " ")}
                          </div>
                          <div>{m.body}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type a message…"
                  style={{
                    flex: 1,
                    padding: "0.75rem 0.9rem",
                    borderRadius: 12,
                    border: "1px solid #ccc",
                  }}
                />
                <button
                  onClick={handleSend}
                  style={{
                    padding: "0.75rem 1rem",
                    borderRadius: 12,
                    border: "1px solid #111",
                    background: "#111",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Send
                </button>
              </div>

              {err ? <div style={{ marginTop: 10, color: "#b00020" }}>{err}</div> : null}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

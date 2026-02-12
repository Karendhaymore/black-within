"use client";

import React, { useMemo, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

type Props = {
  userId: string | null;
  // Optional “context” so it can report a profile/message/thread when present
  target_user_id?: string | null;
  target_profile_id?: string | null;
  target_thread_id?: string | null;
  target_message_id?: number | null;
};

export default function ReportButton(props: Props) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("other");
  const [reason, setReason] = useState("General issue");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const pageUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.href;
  }, []);

  async function submit() {
    if (!props.userId) {
      setMsg("Please sign in first.");
      return;
    }
    if (!details.trim()) {
      setMsg("Please describe what happened.");
      return;
    }

    setSending(true);
    setMsg(null);

    try {
      const res = await fetch(`${API_BASE}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reporter_user_id: props.userId,
          category,
          reason,
          details,
          target_user_id: props.target_user_id || null,
          target_profile_id: props.target_profile_id || null,
          target_thread_id: props.target_thread_id || null,
          target_message_id: props.target_message_id ?? null,
          page_url: pageUrl,
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Report failed (${res.status})`);
      }

      setDetails("");
      setMsg("✅ Report sent. Thank you.");
      // keep open for a second so they see confirmation
      setTimeout(() => setOpen(false), 900);
    } catch (e: any) {
      setMsg(e?.message || "Could not send report.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          right: 18,
          bottom: 18, // 👈 CHANGE bottom → top
          zIndex: 1000,
          padding: "10px 14px",
          borderRadius: 999,
          border: "1px solid #ddd",
          background: "white",
          fontWeight: 800,
          cursor: "pointer",
          boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
        }}
      >
        Report a problem
      </button>

      {/* Modal */}
      {open ? (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1001,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 520,
              background: "white",
              borderRadius: 16,
              border: "1px solid #eee",
              padding: 16,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>
              Report a problem
            </div>

            <label style={{ display: "block", fontWeight: 800, marginTop: 10 }}>
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            >
              <option value="profile">User/Profile</option>
              <option value="message">Message</option>
              <option value="thread">Conversation</option>
              <option value="safety">Safety concern</option>
              <option value="payment">Payment issue</option>
              <option value="bug">Bug / app problem</option>
              <option value="other">Other</option>
            </select>

            <label style={{ display: "block", fontWeight: 800, marginTop: 10 }}>
              Reason
            </label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Example: Harassment, Spam, Impersonation, App crashing..."
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            />

            <label style={{ display: "block", fontWeight: 800, marginTop: 10 }}>
              What happened?
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={5}
              placeholder="Tell us what happened. Include names, what you saw, and what you want us to do."
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            />

            {msg ? (
              <div style={{ marginTop: 10, fontWeight: 800 }}>{msg}</div>
            ) : null}

            <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "flex-end" }}>
              <button
                onClick={() => setOpen(false)}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", background: "white", fontWeight: 800 }}
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={sending}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #111",
                  background: sending ? "#f3f3f3" : "#111",
                  color: sending ? "#111" : "white",
                  fontWeight: 900,
                  cursor: sending ? "not-allowed" : "pointer",
                }}
              >
                {sending ? "Sending..." : "Send report"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

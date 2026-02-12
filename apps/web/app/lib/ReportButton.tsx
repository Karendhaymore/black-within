"use client";

import React, { useMemo, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

type ReportCategory =
  | "Safety concern"
  | "Harassment"
  | "Scam / fraud"
  | "Hate / discrimination"
  | "Explicit content"
  | "Bug / technical issue"
  | "Other";

type ReportReason =
  | "General issue"
  | "Threats"
  | "Stalking"
  | "Spam"
  | "Impersonation"
  | "Inappropriate message"
  | "Inappropriate photo"
  | "Underage concern"
  | "Other";

function getStoredUserId(): string | null {
  if (typeof window === "undefined") return null;

  // Try a few common keys (your app may store under one of these)
  const keys = ["bw_user_id", "user_id", "userId", "bwUserId"];
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v && v.trim()) return v.trim();
  }
  return null;
}

async function safeReadErrorDetail(res: Response): Promise<string> {
  try {
    const txt = await res.text();
    return txt || `${res.status} ${res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

export default function ReportButton() {
  const [open, setOpen] = useState(false);

  const [category, setCategory] = useState<ReportCategory>("Safety concern");
  const [reason, setReason] = useState<ReportReason>("General issue");
  const [details, setDetails] = useState("");

  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const userId = useMemo(() => getStoredUserId(), [open]); // refresh when opened

  async function submit() {
    setErr(null);
    setOk(null);

    if (!userId) {
      setErr("Please sign in first.");
      return;
    }
    if (!details.trim()) {
      setErr("Please describe what happened.");
      return;
    }

    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/reports/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reporter_user_id: userId,
          category,
          reason,
          details: details.trim(),

          // Optional targets (global button = none)
          target_user_id: null,
          target_profile_id: null,
          target_thread_id: null,
          target_message_id: null,
        }),
      });

      if (!res.ok) throw new Error(await safeReadErrorDetail(res));

      setOk("Report sent. Thank you.");
      setDetails("");
    } catch (e: any) {
      setErr(e?.message || "Failed to send report.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Floating button (TOP RIGHT) */}
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          right: 18,
          top: 18,
          zIndex: 9999,
          padding: "10px 14px",
          borderRadius: 999,
          border: "1px solid #ddd",
          background: "#fff",
          boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Report a problem
      </button>

      {/* Modal */}
      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{
              width: "min(680px, 96vw)",
              background: "#fff",
              borderRadius: 16,
              boxShadow: "0 18px 50px rgba(0,0,0,0.25)",
              padding: 18,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>
              Report a problem
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 700 }}>Category</div>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ReportCategory)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                >
                  <option>Safety concern</option>
                  <option>Harassment</option>
                  <option>Scam / fraud</option>
                  <option>Hate / discrimination</option>
                  <option>Explicit content</option>
                  <option>Bug / technical issue</option>
                  <option>Other</option>
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 700 }}>Reason</div>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as ReportReason)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                >
                  <option>General issue</option>
                  <option>Threats</option>
                  <option>Stalking</option>
                  <option>Spam</option>
                  <option>Impersonation</option>
                  <option>Inappropriate message</option>
                  <option>Inappropriate photo</option>
                  <option>Underage concern</option>
                  <option>Other</option>
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 700 }}>What happened?</div>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  rows={5}
                  placeholder="Tell us what happened. Include usernames and what screen you were on."
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    resize: "vertical",
                  }}
                />
              </label>

              {err && <div style={{ color: "#b00020", fontWeight: 700 }}>{err}</div>}
              {ok && <div style={{ color: "#0a7a2f", fontWeight: 700 }}>{ok}</div>}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setOpen(false)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: "#fff",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={sending}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #111",
                    background: sending ? "#333" : "#111",
                    color: "#fff",
                    fontWeight: 800,
                    cursor: sending ? "not-allowed" : "pointer",
                  }}
                >
                  {sending ? "Sending..." : "Send report"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

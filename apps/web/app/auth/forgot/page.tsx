"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

function getApiBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, "") ||
    process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, "") ||
    "https://black-within-api.onrender.com"
  );
}

export default function ForgotPasswordPage() {
  const API_BASE = useMemo(() => getApiBaseUrl(), []);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("");

    const cleanEmail = (email || "").trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setStatus("Please enter a valid email.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
        cache: "no-store",
      });

      // Backend returns ok even when email doesn't exist (by design)
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Request failed (${res.status})`);
      }

      setStatus("If that email exists, we sent a reset link. Check your inbox (and spam).");
    } catch (e: any) {
      setStatus(e?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 520,
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.92)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
    padding: "1.5rem",
    backdropFilter: "blur(6px)",
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem 1rem",
        background:
          "radial-gradient(1200px 600px at 20% 10%, rgba(197,137,45,0.18), transparent 60%), radial-gradient(900px 500px at 80% 20%, rgba(10,85,0,0.14), transparent 55%), radial-gradient(900px 700px at 50% 90%, rgba(0,0,0,0.12), transparent 55%), #0b0b0b",
      }}
    >
      <div style={{ width: "100%", maxWidth: 900 }}>
        <div
          style={{
            margin: "0 auto 14px",
            maxWidth: 520,
            height: 10,
            borderRadius: 999,
            background:
              "linear-gradient(90deg, rgba(197,137,45,0.0), rgba(197,137,45,0.55), rgba(10,85,0,0.55), rgba(197,137,45,0.55), rgba(197,137,45,0.0))",
            opacity: 0.9,
          }}
        />

        <div style={cardStyle}>
          <h1 style={{ fontSize: "2rem", margin: 0, color: "#111" }}>Reset password</h1>
          <p style={{ margin: "0.45rem 0 0", color: "rgba(0,0,0,0.72)", lineHeight: 1.4 }}>
            Enter your email and we’ll send a secure reset link.
          </p>

          <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.9rem", marginTop: 14 }}>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span style={{ fontWeight: 600, color: "#111" }}>Email</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                style={{
                  padding: "0.8rem 0.9rem",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.18)",
                  background: "white",
                  outline: "none",
                }}
              />
            </label>

            {status ? (
              <div
                style={{
                  padding: "0.85rem",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.10)",
                  background: "rgba(0,0,0,0.04)",
                  color: "rgba(0,0,0,0.78)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {status}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "0.85rem 1.1rem",
                borderRadius: 12,
                border: "1px solid #0a5",
                background: "#0a5",
                color: "#fff",
                cursor: loading ? "not-allowed" : "pointer",
                fontWeight: 700,
                opacity: loading ? 0.75 : 1,
              }}
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>

            <Link
              href="/auth"
              style={{
                color: "inherit",
                textDecoration: "none",
                borderBottom: "1px solid rgba(0,0,0,0.25)",
                paddingBottom: 1,
                width: "fit-content",
              }}
            >
              Back to login
            </Link>
          </form>
        </div>
      </div>
    </main>
  );
}

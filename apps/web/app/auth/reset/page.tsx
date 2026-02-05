"use client";

import React, { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function getApiBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, "") ||
    process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, "") ||
    "https://black-within-api.onrender.com"
  );
}

async function apiJson<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.detail || "Request failed.");
  return data as T;
}

export default function ResetPage() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
      <ResetInner />
    </Suspense>
  );
}

function ResetInner() {
  const API_BASE = useMemo(() => getApiBaseUrl(), []);
  const sp = useSearchParams();
  const token = (sp.get("token") || "").trim();

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Missing reset token. Please request a new reset link.");
      return;
    }
    if (!pw1 || pw1.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (pw1 !== pw2) {
      setError("Passwords do not match.");
      return;
    }

    setStatus("loading");
    try {
      await apiJson<{ ok: boolean }>(API_BASE, "/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password: pw1 }),
      });
      setStatus("done");
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
      setStatus("idle");
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

  const inputStyle: React.CSSProperties = {
    padding: "0.8rem 0.9rem",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.18)",
    background: "white",
    outline: "none",
  };

  const primaryBtn: React.CSSProperties = {
    padding: "0.85rem 1.1rem",
    borderRadius: 12,
    border: "1px solid #0a5",
    background: "#0a5",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
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
      <div style={cardStyle}>
        <h1 style={{ fontSize: "2rem", margin: 0, color: "#111" }}>Choose a new password</h1>
        <p style={{ margin: "0.45rem 0 0", color: "rgba(0,0,0,0.72)", lineHeight: 1.4 }}>
          Make it strong. Make it yours.
        </p>

        {!token ? (
          <div
            style={{
              marginTop: 16,
              padding: "0.85rem",
              borderRadius: 12,
              border: "1px solid rgba(176,0,32,0.25)",
              background: "rgba(176,0,32,0.06)",
              color: "#7a1b1b",
            }}
          >
            Missing reset token. Please request a new reset link.
          </div>
        ) : null}

        {status === "done" ? (
          <div
            style={{
              marginTop: 16,
              padding: "0.85rem",
              borderRadius: 12,
              border: "1px solid rgba(10,85,0,0.25)",
              background: "rgba(10,85,0,0.06)",
              color: "#1f5b1f",
            }}
          >
            Password reset successful. You can log in now.
            <div style={{ marginTop: 10 }}>
              <Link href="/auth" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>
                Go to login
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} style={{ marginTop: 16, display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 600, color: "#111" }}>New password</span>
              <input
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
                placeholder="At least 8 characters"
                type="password"
                autoComplete="new-password"
                style={inputStyle}
                disabled={status === "loading"}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 600, color: "#111" }}>Confirm password</span>
              <input
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                placeholder="Re-type password"
                type="password"
                autoComplete="new-password"
                style={inputStyle}
                disabled={status === "loading"}
              />
            </label>

            {error ? (
              <div
                style={{
                  padding: "0.85rem",
                  borderRadius: 12,
                  border: "1px solid rgba(176,0,32,0.25)",
                  background: "rgba(176,0,32,0.06)",
                  color: "#7a1b1b",
                  whiteSpace: "pre-wrap",
                }}
              >
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              style={{ ...primaryBtn, opacity: status === "loading" ? 0.75 : 1 }}
              disabled={status === "loading"}
            >
              {status === "loading" ? "Saving…" : "Reset password"}
            </button>

            <div style={{ marginTop: 6, fontSize: 13, color: "rgba(0,0,0,0.65)" }}>
              <Link href="/auth" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>
                Back to login
              </Link>
            </div>
          </form>
        )}

        <div style={{ marginTop: 16, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
          If the link expired, request a new one from “Forgot password.”
        </div>
      </div>
    </main>
  );
}

"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  let data: any = {};
  try {
    data = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    const msg = data?.detail || "Request failed.";
    throw new Error(typeof msg === "string" ? msg : "Request failed.");
  }
  return data as T;
}

function setStableUserId(stableUserId: string) {
  const cleaned = (stableUserId || "").trim();
  if (!cleaned) return;
  localStorage.setItem("bw_user_id", cleaned);
}

function setLoggedInFlag(isLoggedIn: boolean) {
  localStorage.setItem("bw_logged_in", isLoggedIn ? "1" : "0");
}

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const title = useMemo(() => (mode === "signup" ? "Create your account" : "Welcome back"), [mode]);
  const subtitle = useMemo(
    () =>
      mode === "signup"
        ? "A space built for alignment, intention, and real connection."
        : "Enter gently. This space moves at the speed of trust.",
    [mode]
  );

  useEffect(() => {
    const savedEmail = localStorage.getItem("bw_email");
    if (savedEmail && !email) setEmail(savedEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit() {
    setStatus("");

    const normalizedEmail = (email || "").trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setStatus("Please enter a valid email address.");
      return;
    }
    if (!password || password.length < 8) {
      setStatus("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const path = mode === "signup" ? "/auth/signup" : "/auth/login";
      const data = await apiJson<{ ok: boolean; userId: string; email: string }>(path, {
        method: "POST",
        body: JSON.stringify({ email: normalizedEmail, password }),
      });

      setStableUserId(data.userId);
      setLoggedInFlag(true);
      localStorage.setItem("bw_email", data.email);

      window.location.href = "/discover";
    } catch (e: any) {
      setStatus(e?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const pageBg: React.CSSProperties = {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: "2.25rem 1rem",
    background:
      "radial-gradient(1200px 600px at 20% 10%, rgba(197,137,45,0.18), transparent 60%), radial-gradient(900px 500px at 80% 20%, rgba(10,85,0,0.14), transparent 55%), radial-gradient(900px 700px at 50% 90%, rgba(0,0,0,0.12), transparent 55%), #0b0b0b",
  };

  const card: React.CSSProperties = {
    width: "100%",
    maxWidth: 560,
    borderRadius: 20,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.93)",
    boxShadow: "0 14px 44px rgba(0,0,0,0.25)",
    padding: "1.6rem",
    backdropFilter: "blur(8px)",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "0.85rem 0.95rem",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.16)",
    outline: "none",
    background: "white",
  };

  const primaryBtn: React.CSSProperties = {
    width: "100%",
    padding: "0.95rem 1.1rem",
    borderRadius: 14,
    border: "1px solid #0a5",
    background: "#0a5",
    color: "#fff",
    cursor: loading ? "not-allowed" : "pointer",
    fontWeight: 800,
    opacity: loading ? 0.8 : 1,
  };

  const secondaryBtn: React.CSSProperties = {
    width: "100%",
    padding: "0.95rem 1.1rem",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.14)",
    background: "white",
    cursor: loading ? "not-allowed" : "pointer",
    fontWeight: 700,
    opacity: loading ? 0.8 : 1,
  };

  const linkStyle: React.CSSProperties = {
    color: "inherit",
    textDecoration: "none",
    borderBottom: "1px solid rgba(0,0,0,0.25)",
    paddingBottom: 1,
  };

  return (
    <main style={pageBg}>
      <div style={{ width: "100%", maxWidth: 920 }}>
        <div
          style={{
            margin: "0 auto 14px",
            maxWidth: 560,
            height: 10,
            borderRadius: 999,
            background:
              "linear-gradient(90deg, rgba(197,137,45,0.0), rgba(197,137,45,0.55), rgba(10,85,0,0.55), rgba(197,137,45,0.55), rgba(197,137,45,0.0))",
            opacity: 0.9,
          }}
        />

        <div style={card}>
          <div style={{ marginBottom: 14 }}>
            <h1 style={{ fontSize: "2rem", margin: 0, color: "#111" }}>{title}</h1>
            <p style={{ margin: "0.5rem 0 0", color: "rgba(0,0,0,0.72)", lineHeight: 1.45 }}>
              {subtitle}
            </p>
          </div>

          {status ? (
            <div
              style={{
                marginTop: 10,
                padding: "0.9rem",
                borderRadius: 14,
                border: "1px solid rgba(176,0,32,0.22)",
                background: "rgba(176,0,32,0.06)",
                color: "#7a1b1b",
                whiteSpace: "pre-wrap",
              }}
            >
              {status}
            </div>
          ) : null}

          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700, color: "#111" }}>Email</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                autoComplete="email"
                style={input}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700, color: "#111" }}>Password</span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                style={input}
              />
            </label>

            <button onClick={onSubmit} disabled={loading} style={primaryBtn}>
              {loading ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
            </button>

            <button
              onClick={() => {
                setMode((m) => (m === "signup" ? "login" : "signup"));
                setStatus("");
              }}
              disabled={loading}
              style={secondaryBtn}
            >
              {mode === "signup" ? "Already have an account? Log in" : "New here? Create an account"}
            </button>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <Link href="/" style={linkStyle}>
                Back to home
              </Link>

              {/* We’ll wire this once backend reset endpoints exist */}
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setStatus(
                    "Forgot password is next. We’ll add the reset email flow through SendGrid."
                  );
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  color: "rgba(0,0,0,0.85)",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                  opacity: loading ? 0.7 : 1,
                }}
              >
                Forgot password?
              </button>
            </div>

            <div style={{ marginTop: 8, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
              By continuing, you agree to keep this space respectful and real.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
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

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any)?.detail || "Request failed.");
  }
  return data as T;
}

function setStableUserId(stableUserId: string) {
  const cleaned = (stableUserId || "").trim();
  if (!cleaned) return;
  localStorage.setItem("bw_user_id", cleaned);
}

// ✅ NEW: simple "session" flag for MVP
function setLoggedInFlag(isLoggedIn: boolean) {
  localStorage.setItem("bw_logged_in", isLoggedIn ? "1" : "0");
}

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Optional: if already logged in, go to /discover
    const existingUserId = localStorage.getItem("bw_user_id");
    const loggedIn = localStorage.getItem("bw_logged_in") === "1";
    if (existingUserId && loggedIn) {
      // window.location.href = "/discover"; // uncomment if you want auto-redirect
    }

    // Optional nicety: prefill email if remembered
    const savedEmail = localStorage.getItem("bw_email");
    if (savedEmail && !email) setEmail(savedEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit() {
    setStatus(null);

    const normalizedEmail = email.trim().toLowerCase();
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

      // ✅ mark as logged in (instead of relying on "userId exists")
      setLoggedInFlag(true);

      localStorage.setItem("bw_email", data.email);

      window.location.href = "/discover";
    } catch (e: any) {
      setStatus(e?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 520,
    border: "1px solid #eee",
    borderRadius: 16,
    padding: "1.5rem",
  };

  const buttonPrimary: React.CSSProperties = {
    padding: "0.75rem",
    borderRadius: 12,
    border: "1px solid #111",
    background: "#111",
    color: "white",
    cursor: loading ? "not-allowed" : "pointer",
    opacity: loading ? 0.65 : 1,
  };

  const buttonSecondary: React.CSSProperties = {
    padding: "0.75rem",
    borderRadius: 12,
    border: "1px solid #ccc",
    background: "white",
    cursor: loading ? "not-allowed" : "pointer",
    opacity: loading ? 0.65 : 1,
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "2rem",
        display: "grid",
        placeItems: "center",
      }}
    >
      <div style={cardStyle}>
        <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>
          {mode === "signup" ? "Create your account" : "Log in"}
        </h1>
        <p style={{ color: "#555", marginTop: 0 }}>
          Black Within is being released intentionally—to honor depth, safety, and alignment.
        </p>

        {status && (
          <div
            style={{
              marginTop: "1rem",
              padding: "0.75rem",
              borderRadius: 12,
              border: "1px solid #eee",
              color: "#444",
            }}
          >
            {status}
          </div>
        )}

        <div style={{ marginTop: "1rem", display: "grid", gap: "0.75rem" }}>
          <label style={{ color: "#555", fontSize: "0.95rem" }}>Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            autoComplete="email"
            style={{
              padding: "0.75rem",
              borderRadius: 12,
              border: "1px solid #ccc",
            }}
          />

          <label style={{ color: "#555", fontSize: "0.95rem" }}>Password</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            style={{
              padding: "0.75rem",
              borderRadius: 12,
              border: "1px solid #ccc",
            }}
          />

          <button onClick={onSubmit} disabled={loading} style={buttonPrimary}>
            {loading ? "Please wait..." : mode === "signup" ? "Create account" : "Log in"}
          </button>

          <button
            onClick={() => {
              setMode((m) => (m === "signup" ? "login" : "signup"));
              setStatus(null);
            }}
            disabled={loading}
            style={buttonSecondary}
          >
            {mode === "signup"
              ? "Already have an account? Log in"
              : "New here? Create an account"}
          </button>

          <div style={{ color: "#777", fontSize: "0.9rem" }}>
            Tip: This replaces the email code system so you won’t miss codes.
          </div>
        </div>
      </div>
    </main>
  );
}

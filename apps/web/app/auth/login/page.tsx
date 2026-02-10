"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

async function safeReadErrorDetail(res: Response): Promise<string> {
  // Handles FastAPI {detail: "..."} or {detail: [...]} or plain text
  try {
    const data = await res.json();
    if (data?.detail != null) {
      if (typeof data.detail === "string") return data.detail;
      try {
        return JSON.stringify(data.detail, null, 2);
      } catch {
        return String(data.detail);
      }
    }
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  } catch {}

  try {
    const text = await res.text();
    if (text) return text;
  } catch {}

  return `Request failed (${res.status}).`;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      if (!res.ok) {
        throw new Error(await safeReadErrorDetail(res));
      }

      const data = await res.json();

      const userId = (data?.user_id || data?.userId || data?.id || "").toString();
      if (!userId) throw new Error("Login succeeded, but no user id returned.");

      // ✅ Save login session
      localStorage.setItem("bw_user_id", userId);
      localStorage.setItem("bw_logged_in", "1");

      // Optional: keep token if your API returns it
      if (data?.session_token) {
        localStorage.setItem("bw_session_token", String(data.session_token));
      }

      // ✅ Go to app
      router.replace("/discover");
    } catch (err: any) {
      setError(err?.message || "Login error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#0b0b0b",
      }}
    >
      <form
        onSubmit={handleLogin}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "white",
          padding: 24,
          borderRadius: 16,
          boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <h2 style={{ margin: 0 }}>Log in</h2>

        <input
          type="email"
          placeholder="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
          autoComplete="email"
        />

        <input
          type="password"
          placeholder="Password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
          autoComplete="current-password"
        />

        {error && <div style={{ color: "crimson", fontSize: 14, whiteSpace: "pre-wrap" }}>{error}</div>}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "0.9rem",
            borderRadius: 10,
            border: "none",
            background: "#111",
            color: "white",
            fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.8 : 1,
          }}
        >
          {loading ? "Logging in..." : "Log In"}
        </button>

        <a href="/auth/forgot" style={{ textAlign: "center", fontSize: 13, color: "#444" }}>
          Forgot password?
        </a>

        {/* ✅ Add signup link */}
        <div style={{ textAlign: "center", fontSize: 13, marginTop: 2 }}>
          <Link href="/auth/signup" style={{ color: "#111", textDecoration: "underline" }}>
            Create account
          </Link>
        </div>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "0.8rem",
  borderRadius: 8,
  border: "1px solid #ccc",
  fontSize: 15,
};

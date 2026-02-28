"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

async function safeReadErrorDetail(res: Response): Promise<string> {
  // Better handling (same style as login)
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

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const e2 = email.trim().toLowerCase();
    if (!e2) return setErr("Please enter your email.");
    if (!pw) return setErr("Please enter a password.");

    setLoading(true);
    try {
      // IMPORTANT: If your API uses /auth/register instead of /auth/signup,
      // change this URL to match.
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e2, password: pw }),
      });

      if (!res.ok) {
        const detail = await safeReadErrorDetail(res);

        // Friendly message for banned emails (your API should return 403)
        if (res.status === 403) {
          throw new Error(detail || "This email is not allowed to create an account.");
        }

        throw new Error(detail || "Signup failed.");
      }

      const json = await res.json();

      const userId = (json?.user_id || json?.userId || json?.id || "").toString();
      if (!userId) throw new Error("Signup succeeded, but no user id returned.");

      window.localStorage.setItem("bw_user_id", userId);
      window.localStorage.setItem("bw_logged_in", "1");

      if (json?.session_token) {
        window.localStorage.setItem("bw_session_token", String(json.session_token));
      }

      // After signup, most apps go straight to Discover
      router.replace("/discover");
    } catch (e: any) {
      setErr(e?.message || "Signup failed.");
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
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "white",
          borderRadius: 14,
          padding: 18,
          boxShadow: "0 18px 48px rgba(0,0,0,0.35)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 18 }}>Create account</h1>

        {err && (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 10,
              border: "1px solid #f2c7c7",
              background: "#fff7f7",
              color: "#7a1b1b",
              whiteSpace: "pre-wrap",
              fontSize: 13,
            }}
          >
            {err}
          </div>
        )}

        <form onSubmit={onSignup} style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            type="email"
            style={{
              width: "100%",
              padding: "12px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
            }}
            autoComplete="email"
          />

          <input
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Password"
            required
            type="password"
            style={{
              width: "100%",
              padding: "12px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
            }}
            autoComplete="new-password"
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              padding: "12px 12px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111",
              color: "white",
              fontWeight: 800,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.75 : 1,
            }}
          >
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>

        <div style={{ marginTop: 12, textAlign: "center", fontSize: 13 }}>
          Already have an account?{" "}
          <Link href="/auth/login" style={{ textDecoration: "underline" }}>
            Log in
          </Link>
        </div>
      </div>
    </main>
  );
}

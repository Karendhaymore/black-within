"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

function getAdminToken(): string {
  if (typeof window === "undefined") return "";
  const keys = ["bw_admin_token", "admin_token", "bw_admin_session", "bw_admin_key"];
  for (const k of keys) {
    const v = window.localStorage.getItem(k);
    if (v && v.trim()) return v.trim();
  }
  return "";
}

function setAdminToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("bw_admin_token", token);
}

function clearAdminToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("bw_admin_token");
  window.localStorage.removeItem("admin_token");
  window.localStorage.removeItem("bw_admin_session");
  window.localStorage.removeItem("bw_admin_key");
}

async function safeReadErrorDetail(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (j?.detail) return String(j.detail);
    if (j?.message) return String(j.message);
  } catch {}
  try {
    const t = await res.text();
    if (t) return t;
  } catch {}
  return `Request failed (${res.status}).`;
}

export default function AdminLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // If already logged in, go straight to dashboard
    const t = getAdminToken();
    if (t) router.replace("/admin");
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    try {
      // Backend route we added earlier:
      // POST /admin/login  { email, password } -> { token }
      const res = await fetch(`${API_BASE}/admin/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
});


      if (!res.ok) throw new Error(await safeReadErrorDetail(res));
      const json = await res.json().catch(() => ({}));

      const token = String(json?.token || "").trim();
      if (!token) throw new Error("Login succeeded but no token returned.");

      setAdminToken(token);
      router.replace("/admin");
    } catch (e: any) {
      setErr(e?.message || "Login failed.");
      clearAdminToken();
    } finally {
      setLoading(false);
    }
  }

  const card: React.CSSProperties = {
    border: "1px solid #eee",
    borderRadius: 16,
    padding: "1.25rem",
    background: "white",
  };

  const input: React.CSSProperties = {
    padding: "0.75rem 0.85rem",
    borderRadius: 12,
    border: "1px solid #ccc",
    width: "100%",
  };

  const btn: React.CSSProperties = {
    padding: "0.75rem 0.95rem",
    borderRadius: 12,
    border: "1px solid #111",
    background: "#111",
    color: "white",
    cursor: "pointer",
    fontWeight: 800,
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "2rem",
        display: "grid",
        placeItems: "center",
        background: "#fff",
      }}
    >
      <div style={{ width: "100%", maxWidth: 520 }}>
        <h1 style={{ fontSize: "2rem", marginBottom: 10 }}>Admin Login</h1>
        <div style={{ color: "#666", marginBottom: 18 }}>
          Sign in with your admin email + password.
        </div>

        <div style={card}>
          <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Admin email"
              style={input}
              autoComplete="email"
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              style={input}
              type="password"
              autoComplete="current-password"
            />

            <button type="submit" style={btn} disabled={loading || !email.trim() || !password}>
              {loading ? "Signing in..." : "Sign in"}
            </button>

            {err ? (
              <div
                style={{
                  marginTop: 6,
                  padding: "0.75rem",
                  borderRadius: 12,
                  border: "1px solid #f0c9c9",
                  background: "#fff7f7",
                  color: "#7a2d2d",
                  whiteSpace: "pre-wrap",
                }}
              >
                <b>Error:</b> {err}
              </div>
            ) : null}
          </form>
        </div>

        <div style={{ marginTop: 14, color: "#777", fontSize: 12 }}>
          If login fails, the backend must have <code>/admin/login</code> enabled and at least one
          admin user created.
        </div>
      </div>
    </main>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

async function safeReadErrorDetail(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (j?.detail) return String(j.detail);
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

  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = window.localStorage.getItem("bw_admin_token") || "";
    if (token) router.replace("/admin");
  }, [router]);

  async function onLogin() {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error(await safeReadErrorDetail(res));
      const json = await res.json();
      window.localStorage.setItem("bw_admin_token", json.token);
      window.localStorage.setItem("bw_admin_role", json.role || "");
      window.localStorage.setItem("bw_admin_email", json.email || "");
      router.replace("/admin");
    } catch (e: any) {
      setErr(e?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", padding: "2rem", display: "grid", placeItems: "center" }}>
      <div style={{ width: "100%", maxWidth: 520, border: "1px solid #eee", borderRadius: 16, padding: "1.25rem" }}>
        <h1 style={{ marginTop: 0 }}>Admin Login</h1>
        <p style={{ color: "#666", marginTop: 6 }}>Secure admin access for Black Within.</p>

        {err ? (
          <div style={{ marginTop: 12, padding: 10, borderRadius: 12, border: "1px solid #f0c9c9", background: "#fff7f7", color: "#7a2d2d" }}>
            <b>Error:</b> {err}
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin email"
            style={{ padding: "0.75rem", borderRadius: 12, border: "1px solid #ccc" }}
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            type="password"
            style={{ padding: "0.75rem", borderRadius: 12, border: "1px solid #ccc" }}
          />

          <button
            onClick={onLogin}
            disabled={loading}
            style={{
              padding: "0.85rem 1rem",
              borderRadius: 12,
              border: "1px solid #111",
              background: "#111",
              color: "white",
              fontWeight: 900,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <div style={{ color: "#777", fontSize: 12 }}>API: {API_BASE}</div>
        </div>
      </div>
    </main>
  );
}

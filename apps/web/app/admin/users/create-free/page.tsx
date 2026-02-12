"use client";

import React, { useState } from "react";
import Link from "next/link";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

async function safeReadErrorDetail(res: Response) {
  const txt = await res.text().catch(() => "");
  try {
    const j = JSON.parse(txt);
    return j?.detail || j?.message || txt || `${res.status} ${res.statusText}`;
  } catch {
    return txt || `${res.status} ${res.statusText}`;
  }
}

export default function CreateFreeUserPage() {
  const [adminToken, setAdminToken] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("bw_admin_token") || "";
  });

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function saveToken() {
    localStorage.setItem("bw_admin_token", adminToken.trim());
    setStatus("Saved admin token.");
    setError(null);
  }

  async function onCreate() {
    setLoading(true);
    setStatus(null);
    setError(null);

    try {
      const token = adminToken.trim();
      if (!token) throw new Error("Admin token is required.");
      if (!email.trim()) throw new Error("Email is required.");
      if (!displayName.trim()) throw new Error("Display name is required.");

      const res = await fetch(`${API_BASE}/admin/users/create-free`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Token": token,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: email.trim(),
          displayName: displayName.trim(),
        }),
      });

      if (!res.ok) {
        throw new Error(await safeReadErrorDetail(res));
      }

      const data = await res.json().catch(() => ({} as any));
      setStatus(
        `Created user. user_id=${data?.user_id || "?"} profile_id=${
          data?.profile_id || "?"
        }`
      );
      setEmail("");
      setDisplayName("");
    } catch (e: any) {
      setError(e?.message || "Create failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 840, margin: "0 auto", padding: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>Create Free User</h1>
        <Link href="/admin" style={{ alignSelf: "center" }}>
          ← Back to Admin
        </Link>
      </div>

      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 12,
          padding: "1rem",
          marginTop: "1rem",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Admin Token</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            placeholder="Paste admin token"
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
            }}
          />
          <button
            onClick={saveToken}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "white",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Save
          </button>
        </div>
      </div>

      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 12,
          padding: "1rem",
          marginTop: "1rem",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 10 }}>
          New user details
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
            }}
          />
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
            }}
          />

          <button
            onClick={onCreate}
            disabled={loading}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #111",
              background: "#111",
              color: "white",
              fontWeight: 800,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Creating..." : "Create Free User"}
          </button>

          {status && (
            <div style={{ padding: 12, borderRadius: 12, background: "#f4fff4" }}>
              ✅ {status}
            </div>
          )}
          {error && (
            <div style={{ padding: 12, borderRadius: 12, background: "#fff4f4" }}>
              ❌ {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

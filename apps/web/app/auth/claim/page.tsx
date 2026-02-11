"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

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

export default function ClaimPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const token = sp.get("token") || "";

  const [msg, setMsg] = useState("Claiming your access…");

  useEffect(() => {
    (async () => {
      if (!token) {
        setMsg("Missing token.");
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/auth/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) throw new Error(await safeReadErrorDetail(res));
        const json = await res.json();

        // set the app's auth keys
        window.localStorage.setItem("bw_user_id", json.user_id);
        window.localStorage.setItem("bw_logged_in", "1");

        setMsg("Access claimed! Redirecting…");
        router.replace("/profile");
      } catch (e: any) {
        setMsg(e?.message || "Claim failed.");
      }
    })();
  }, [token, router]);

  return (
    <main style={{ minHeight: "100vh", padding: "2rem", display: "grid", placeItems: "center" }}>
      <div style={{ width: "100%", maxWidth: 560, border: "1px solid #eee", borderRadius: 16, padding: "1.25rem" }}>
        <h1 style={{ marginTop: 0 }}>Claim Access</h1>
        <p style={{ color: "#666" }}>{msg}</p>
        <p style={{ color: "#777", fontSize: 12 }}>API: {API_BASE}</p>
      </div>
    </main>
  );
}

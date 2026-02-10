"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

function newId() {
  // good enough for your current prototype auth
  return "u_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");

  useEffect(() => {
    try {
      const loggedIn = window.localStorage.getItem("bw_logged_in") === "1";
      if (loggedIn) router.replace("/discover");
    } catch {}
  }, [router]);

  function onCreate() {
    const uid = newId();

    try {
      window.localStorage.setItem("bw_user_id", uid);
      window.localStorage.setItem("bw_logged_in", "1");

      // Optional: store a display name hint for your profile form (if you want)
      if (name.trim()) window.localStorage.setItem("bw_display_name_hint", name.trim());
    } catch {}

    router.replace("/profile");
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 520, border: "1px solid #eee", borderRadius: 16, padding: 18 }}>
        <h1 style={{ marginTop: 0 }}>Create account</h1>
        <p style={{ marginTop: 6, color: "#555" }}>
          Quick signup for testing. You’ll create your full profile next.
        </p>

        <label style={{ display: "grid", gap: 6, marginTop: 14 }}>
          <span style={{ fontWeight: 700 }}>Display name (optional)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., NubianGrace"
            style={{ padding: "12px 12px", borderRadius: 10, border: "1px solid #ccc" }}
          />
        </label>

        <button
          onClick={onCreate}
          style={{
            marginTop: 14,
            width: "100%",
            padding: "12px 12px",
            borderRadius: 12,
            border: "1px solid #0a5411",
            background: "#0a5411",
            color: "white",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Create account
        </button>

        <div style={{ marginTop: 12, fontSize: 14 }}>
          Already have an account?{" "}
          <Link href="/auth/login" style={{ fontWeight: 800 }}>
            Log in
          </Link>
        </div>
      </div>
    </main>
  );
}

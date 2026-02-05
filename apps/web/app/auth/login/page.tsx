"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://black-within-api.onrender.com";

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
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Login failed");
      }

      // ✅ Save login session
      localStorage.setItem("bw_user_id", data.user_id);
      localStorage.setItem("bw_logged_in", "1");

      // ✅ Go to app
      router.replace("/discover");
    } catch (err: any) {
      setError(err.message || "Login error");
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
        />

        <input
          type="password"
          placeholder="Password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />

        {error && (
          <div style={{ color: "crimson", fontSize: 14 }}>{error}</div>
        )}

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
            cursor: "pointer",
          }}
        >
          {loading ? "Logging in..." : "Log In"}
        </button>

        <a
          href="/auth/forgot"
          style={{ textAlign: "center", fontSize: 13, color: "#444" }}
        >
          Forgot password?
        </a>
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

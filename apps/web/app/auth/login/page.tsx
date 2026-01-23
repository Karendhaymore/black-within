"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""); // placeholder for now
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !email.includes("@")) return setError("Please enter a valid email.");
    if (!password) return setError("Please enter your password.");

    // MVP shortcut:
    // If account exists in localStorage, allow entry. Otherwise, send to signup.
    const raw = localStorage.getItem("bw_account");
    if (!raw) {
      setError("No account found on this device yet. Please create an account first.");
      return;
    }

    router.push("/discover");
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem" }}>
      <div style={{ width: "100%", maxWidth: 520 }}>
        <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Log In</h1>
        <p style={{ color: "#555", marginBottom: "1.5rem" }}>
          Enter gently. This space is designed to move at the speed of trust.
        </p>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.9rem" }}>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span>Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ padding: "0.7rem", borderRadius: 8, border: "1px solid #ccc" }}
            />
          </label>

          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              style={{ padding: "0.7rem", borderRadius: 8, border: "1px solid #ccc" }}
            />
          </label>

          {error && (
            <div style={{ padding: "0.75rem", borderRadius: 8, border: "1px solid #f2c2c2", background: "#fff7f7" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            style={{ padding: "0.8rem 1.1rem", borderRadius: 10, border: "1px solid #ccc", cursor: "pointer" }}
          >
            Continue
          </button>

          <div style={{ marginTop: "0.5rem" }}>
            <a href="/auth/signup" style={{ color: "inherit" }}>
              Need an account? Create one
            </a>
          </div>
        </form>
      </div>
    </main>
  );
}

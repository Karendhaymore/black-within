"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [is18, setIs18] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!displayName.trim()) return setError("Please enter a display name.");
    if (!email.trim() || !email.includes("@")) return setError("Please enter a valid email.");
    if (!password || password.length < 8) return setError("Please create a password (at least 8 characters).");
    if (!is18) return setError("You must confirm you are 18+ to continue.");

    // MVP (no backend yet): store locally so the flow works end-to-end
    localStorage.setItem(
      "bw_account",
      JSON.stringify({ displayName: displayName.trim(), email: email.trim(), is18: true })
    );

    router.push("/initiation/identity");
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem" }}>
      <div style={{ width: "100%", maxWidth: 520 }}>
        <div style={{ marginBottom: "1rem", color: "#666" }}>Step 1 of 6</div>

        <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Welcome to Black Within</h1>
        <p style={{ color: "#555", marginBottom: "1.5rem" }}>
          This is a space for intentional connection rooted in identity, lineage, and alignment.
        </p>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.9rem" }}>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span>Display Name</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How you’ll appear to others"
              style={{ padding: "0.7rem", borderRadius: 8, border: "1px solid #ccc" }}
            />
          </label>

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
              placeholder="At least 8 characters"
              style={{ padding: "0.7rem", borderRadius: 8, border: "1px solid #ccc" }}
            />
          </label>

          <label style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
            <input type="checkbox" checked={is18} onChange={(e) => setIs18(e.target.checked)} />
            <span>I confirm I am 18 years or older.</span>
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
            <a href="/auth/login" style={{ color: "inherit" }}>
              Already have an account? Log In
            </a>
          </div>
        </form>
      </div>
    </main>
  );
}

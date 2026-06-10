"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

export default function ResetContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setMessage("");
    setError("");

    if (!token) {
      setError("This reset link is missing a token. Please request a new password reset email.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          password,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const detail =
          typeof data?.detail === "string"
            ? data.detail
            : typeof data?.message === "string"
              ? data.message
              : "Password reset failed. Please request a new reset link and try again.";

        throw new Error(detail);
      }

      setMessage("Your password has been reset. You can now log in.");
      setPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      console.error("Reset password error:", err);

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Password reset failed. Please request a new reset link and try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: 24 }}>
      <h1>Reset Your Password</h1>
      <p>Enter your new password below.</p>

      <form onSubmit={handleReset}>
        <label>
          New Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              display: "block",
              width: "100%",
              padding: 12,
              marginTop: 6,
              marginBottom: 16,
              border: "1px solid #333",
              borderRadius: 6,
              backgroundColor: "#fff",
              color: "#000",
            }}
          />
        </label>

        <label>
          Confirm New Password
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            style={{
              display: "block",
              width: "100%",
              padding: 12,
              marginTop: 6,
              marginBottom: 16,
              border: "1px solid #333",
              borderRadius: 6,
              backgroundColor: "#fff",
              color: "#000",
            }}
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Resetting..." : "Reset Password"}
        </button>
      </form>

      {message && <p style={{ color: "green", marginTop: 16 }}>{message}</p>}
      {error && <p style={{ color: "red", marginTop: 16 }}>{error}</p>}
    </main>
  );
}

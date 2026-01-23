"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function AuthPage() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  const [status, setStatus] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  async function requestCode() {
    setStatus(null);
    setDevCode(null);

    const res = await fetch(`${API_URL}/auth/request-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();

    if (!res.ok) {
      setStatus(data?.detail || "Could not send a code. Please try again.");
      return;
    }

    // Preview mode: API returns devCode so you can keep building without email setup
    if (data?.devCode) setDevCode(data.devCode);

    setStep("code");
    setStatus("A one-time code was created. Enter it below.");
  }

  async function verifyCode() {
    setStatus(null);

    const res = await fetch(`${API_URL}/auth/verify-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });

    const data = await res.json();

    if (!res.ok) {
      setStatus(data?.detail || "That code didn’t work. Try again.");
      return;
    }

    // Save the “real user id” so Saved + Likes work across devices
    localStorage.setItem("bw_user_id", data.userId);

    window.location.href = "/discover";
  }

  return (
    <main style={{ minHeight: "100vh", padding: "2rem", display: "grid", placeItems: "center" }}>
      <div style={{ width: "100%", maxWidth: 520, border: "1px solid #eee", borderRadius: 16, padding: "1.5rem" }}>
        <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>Sign Up / Log In</h1>
        <p style={{ color: "#555", marginTop: 0 }}>
          Account creation is opening soon. Black Within is being released intentionally to honor depth, safety, and alignment.
        </p>

        {status && (
          <div style={{ marginTop: "1rem", padding: "0.75rem", borderRadius: 12, border: "1px solid #eee", color: "#444" }}>
            {status}
          </div>
        )}

        {step === "email" && (
          <div style={{ marginTop: "1rem", display: "grid", gap: "0.75rem" }}>
            <label style={{ color: "#555", fontSize: "0.95rem" }}>Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              style={{ padding: "0.75rem", borderRadius: 12, border: "1px solid #ccc" }}
            />

            <button
              onClick={requestCode}
              style={{ padding: "0.75rem", borderRadius: 12, border: "1px solid #111", background: "#111", color: "white", cursor: "pointer" }}
            >
              Send me a code
            </button>

            <div style={{ color: "#777", fontSize: "0.9rem" }}>
              This is a one-time code. No passwords.
            </div>
          </div>
        )}

        {step === "code" && (
          <div style={{ marginTop: "1rem", display: "grid", gap: "0.75rem" }}>
            <div style={{ color: "#666", fontSize: "0.95rem" }}>
              Code sent to: <b>{email}</b>
            </div>

            {devCode && (
              <div style={{ padding: "0.75rem", borderRadius: 12, border: "1px solid #cfe7cf", background: "#f6fff6" }}>
                <b>Preview Mode Code:</b> {devCode}
              </div>
            )}

            <label style={{ color: "#555", fontSize: "0.95rem" }}>6-digit code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              maxLength={6}
              style={{ padding: "0.75rem", borderRadius: 12, border: "1px solid #ccc" }}
            />

            <button
              onClick={verifyCode}
              style={{ padding: "0.75rem", borderRadius: 12, border: "1px solid #111", background: "#111", color: "white", cursor: "pointer" }}
            >
              Enter Black Within
            </button>

            <button
              onClick={() => {
                setStep("email");
                setCode("");
                setDevCode(null);
                setStatus(null);
              }}
              style={{ padding: "0.75rem", borderRadius: 12, border: "1px solid #ccc", background: "white", cursor: "pointer" }}
            >
              Use a different email
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

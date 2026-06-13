"use client";

import React, { useState } from "react";
import Link from "next/link";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

async function safeReadErrorDetail(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data?.detail != null) {
      if (typeof data.detail === "string") return data.detail;
      return JSON.stringify(data.detail, null, 2);
    }
    return JSON.stringify(data, null, 2);
  } catch {}

  try {
    const text = await res.text();
    if (text) return text;
  } catch {}

  return `Request failed (${res.status}).`;
}

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [acceptedCommitment, setAcceptedCommitment] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSuccess(null);

    const e2 = email.trim().toLowerCase();
    if (!e2) return setErr("Please enter your email.");
    if (!pw) return setErr("Please enter a password.");

    if (!acceptedCommitment) {
      return setErr(
        "Please read and agree to the Black Within Community Commitment before creating your account."
      );
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e2, password: pw }),
      });

      if (!res.ok) {
        const detail = await safeReadErrorDetail(res);

        if (res.status === 403) {
          throw new Error(detail || "This email is not allowed to create an account.");
        }

        throw new Error(detail || "Signup failed.");
      }

      setPw("");
      setAcceptedCommitment(false);
      setSuccess(
        "Account created. Please check your email to verify your account before logging in."
      );
    } catch (e: any) {
      setErr(e?.message || "Signup failed.");
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
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: "white",
          borderRadius: 14,
          padding: 18,
          boxShadow: "0 18px 48px rgba(0,0,0,0.35)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 18 }}>Create account</h1>

        {err && (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 10,
              border: "1px solid #f2c7c7",
              background: "#fff7f7",
              color: "#7a1b1b",
              whiteSpace: "pre-wrap",
              fontSize: 13,
            }}
          >
            {err}
          </div>
        )}

        {success && (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              borderRadius: 10,
              border: "1px solid #cfe7cf",
              background: "#f6fff6",
              color: "#075f35",
              whiteSpace: "pre-wrap",
              fontSize: 14,
              lineHeight: 1.45,
            }}
          >
            {success}
            <div style={{ marginTop: 10 }}>
              <Link href="/auth/login" style={{ textDecoration: "underline", fontWeight: 700 }}>
                Go to login
              </Link>
            </div>
          </div>
        )}

        {!success && (
          <form onSubmit={onSignup} style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              type="email"
              style={{
                width: "100%",
                padding: "12px 12px",
                borderRadius: 10,
                border: "1px solid #ddd",
              }}
              autoComplete="email"
            />

            <input
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Password"
              required
              type="password"
              style={{
                width: "100%",
                padding: "12px 12px",
                borderRadius: 10,
                border: "1px solid #ddd",
              }}
              autoComplete="new-password"
            />

            <div
              style={{
                marginTop: 4,
                padding: 12,
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "#fafafa",
                fontSize: 13,
                lineHeight: 1.45,
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 8 }}>
                Black Within Community Commitment
              </div>

              <div>
                Black Within was created to foster meaningful, respectful, and culturally
                conscious connections. Members are expected to engage with honesty,
                integrity, kindness, and mutual respect.
              </div>

              <div style={{ marginTop: 8 }}>
                Harassment, discrimination, hate speech, bullying, threats, sexual
                misconduct, scams, fraudulent profiles, solicitation, or any behavior that
                compromises the safety and well-being of our community will not be tolerated.
              </div>

              <div
                style={{
                  marginTop: 8,
                  fontWeight: 800,
                  color: "#8b0000",
                }}
              >
                Never send money to someone you have met online and report suspicious
                behavior immediately.
              </div>

              <div style={{ marginTop: 8 }}>
                Violations of these standards may result in immediate suspension or
                permanent removal from the platform without warning or refund.
              </div>

              <label
                style={{
                  marginTop: 12,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={acceptedCommitment}
                  onChange={(e) => setAcceptedCommitment(e.target.checked)}
                  required
                  style={{ marginTop: 3 }}
                />
                <span>
                  I have read and agree to the Black Within Community Commitment.
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || !acceptedCommitment}
              style={{
                marginTop: 4,
                padding: "12px 12px",
                borderRadius: 10,
                border: "1px solid #111",
                background: "#111",
                color: "white",
                fontWeight: 800,
                cursor: loading || !acceptedCommitment ? "not-allowed" : "pointer",
                opacity: loading || !acceptedCommitment ? 0.65 : 1,
              }}
            >
              {loading ? "Creating..." : "Create account"}
            </button>
          </form>
        )}

        <div style={{ marginTop: 12, textAlign: "center", fontSize: 13 }}>
          Already have an account?{" "}
          <Link href="/auth/login" style={{ textDecoration: "underline" }}>
            Log in
          </Link>
        </div>
      </div>
    </main>
  );
}

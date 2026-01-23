"use client";

import { useEffect, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://black-within-api.onrender.com";

function getOrCreateUserId() {
  if (typeof window === "undefined") return "server";
  const key = "bw_user_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `bw_${Math.random().toString(16).slice(2)}_${Date.now()}`;

  window.localStorage.setItem(key, id);
  return id;
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any)?.detail || "Request failed.");
  }
  return data as T;
}

export default function AuthPage() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  const [status, setStatus] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>("");

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const uid = getOrCreateUserId();
    setUserId(uid);

    // best-effort: ensure user exists in DB
    apiJson(`/me?user_id=${encodeURIComponent(uid)}`).catch(() => {
      // ignore; UI still works, but saved/likes will fail until API is reachable
    });
  }, []);

  async function requestCode() {
    setStatus(null);
    setDevCode(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setStatus("Please enter a valid email address.");
      return;
    }
    if (!userId) {
      setStatus("Missing user id. Please refresh and try again.");
      return;
    }

    setLoading(true);
    try {
      const data = await apiJson<{ ok: boolean; message?: string; dev_code?: string }>(
        `/auth/request-code`,
        {
          method: "POST",
          body: JSON.stringify({ user_id: userId, email: normalizedEmail }),
        }
      );

      if (data?.dev_code) setDevCode(data.dev_code);

      setEmail(normalizedEmail);
      setStep("code");
      setStatus(data?.message || "A one-time code was created. Enter it below.");
    } catch (e: any) {
      setStatus(e?.message || "Could not send a code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    setStatus(null);

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.trim();

    if (!normalizedCode || normalizedCode.length < 4) {
      setStatus("Enter the code you received.");
      return;
    }
    if (!userId) {
      setStatus("Missing user id. Please refresh and try again.");
      return;
    }

    setLoading(true);
    try {
      const data = await apiJson<{
        ok: boolean;
        token: string;
        user_id: string;
        email: string;
      }>(`/auth/verify-code`, {
        method: "POST",
        body: JSON.stringify({
          user_id: userId,
          email: normalizedEmail,
          code: normalizedCode,
        }),
      });

      // Keep bw_user_id as the stable client id (already saved)
      // Store token separately for future authenticated endpoints
      localStorage.setItem("bw_session_token", data.token);
      localStorage.setItem("bw_email", data.email);

      window.location.href = "/discover";
    } catch (e: any) {
      setStatus(e?.message || "That code didn’t work. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 520,
    border: "1px solid #eee",
    borderRadius: 16,
    padding: "1.5rem",
  };

  const buttonPrimary: React.CSSProperties = {
    padding: "0.75rem",
    borderRadius: 12,
    border: "1px solid #111",
    background: "#111",
    color: "white",
    cursor: loading ? "not-allowed" : "pointer",
    opacity: loading ? 0.65 : 1,
  };

  const buttonSecondary: React.CSSProperties = {
    padding: "0.75rem",
    borderRadius: 12,
    border: "1px solid #ccc",
    background: "white",
    cursor: loading ? "not-allowed" : "pointer",
    opacity: loading ? 0.65 : 1,
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "2rem",
        display: "grid",
        placeItems: "center",
      }}
    >
      <div style={cardStyle}>
        <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>
          Sign Up / Log In
        </h1>
        <p style={{ color: "#555", marginTop: 0 }}>
          Black Within is being released intentionally—to honor depth, safety, and
          alignment.
        </p>

        {status && (
          <div
            style={{
              marginTop: "1rem",
              padding: "0.75rem",
              borderRadius: 12,
              border: "1px solid #eee",
              color: "#444",
            }}
          >
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
              autoComplete="email"
              style={{
                padding: "0.75rem",
                borderRadius: 12,
                border: "1px solid #ccc",
              }}
            />

            <button onClick={requestCode} disabled={loading} style={buttonPrimary}>
              {loading ? "Sending..." : "Send me a code"}
            </button>

            <div style={{ color: "#777", fontSize: "0.9rem" }}>
              This is a one-time code. No passwords.
            </div>

            <div style={{ color: "#999", fontSize: "0.85rem" }}>
              (Preview profiles + saved/likes are tied to your device id for now:
              <span style={{ marginLeft: 6, fontFamily: "monospace" }}>
                {userId || "—"}
              </span>
              )
            </div>
          </div>
        )}

        {step === "code" && (
          <div style={{ marginTop: "1rem", display: "grid", gap: "0.75rem" }}>
            <div style={{ color: "#666", fontSize: "0.95rem" }}>
              Code sent to: <b>{email}</b>
            </div>

            {devCode && (
              <div
                style={{
                  padding: "0.75rem",
                  borderRadius: 12,
                  border: "1px solid #cfe7cf",
                  background: "#f6fff6",
                }}
              >
                <b>Preview Mode Code:</b> {devCode}
              </div>
            )}

            <label style={{ color: "#555", fontSize: "0.95rem" }}>
              6-digit code
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              inputMode="numeric"
              maxLength={6}
              style={{
                padding: "0.75rem",
                borderRadius: 12,
                border: "1px solid #ccc",
              }}
            />

            <button onClick={verifyCode} disabled={loading} style={buttonPrimary}>
              {loading ? "Verifying..." : "Enter Black Within"}
            </button>

            <button
              onClick={() => {
                setStep("email");
                setCode("");
                setDevCode(null);
                setStatus(null);
              }}
              disabled={loading}
              style={buttonSecondary}
            >
              Use a different email
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

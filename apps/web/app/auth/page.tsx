"use client";

import { useEffect, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  "https://black-within-api.onrender.com";

/**
 * IMPORTANT (plain language):
 * - Before login, we allow a temporary anonymous id (so the page can still call /me).
 * - After login, we REPLACE bw_user_id with the real/stable userId returned by your API.
 *   This prevents "logout/login resets likes" because the same email always gets the same userId.
 */

function getStoredUserIdOrAnon() {
  if (typeof window === "undefined") return "server";

  // If already logged in before, use the real stable id
  const existing = window.localStorage.getItem("bw_user_id");
  if (existing) return existing;

  // Otherwise use a temporary anonymous id (DO NOT store this as bw_user_id)
  const anonKey = "bw_anon_id";
  const anonExisting = window.localStorage.getItem(anonKey);
  if (anonExisting) return anonExisting;

  const anonId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `anon_${crypto.randomUUID()}`
      : `anon_${Math.random().toString(16).slice(2)}_${Date.now()}`;

  window.localStorage.setItem(anonKey, anonId);
  return anonId;
}

function setStableUserId(stableUserId: string) {
  if (typeof window === "undefined") return;
  const cleaned = (stableUserId || "").trim();
  if (!cleaned) return;

  // Save the real stable id for the logged-in email
  window.localStorage.setItem("bw_user_id", cleaned);

  // Optional cleanup: we no longer need the anonymous id
  window.localStorage.removeItem("bw_anon_id");
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
    const uid = getStoredUserIdOrAnon();
    setUserId(uid);

    // best-effort: ensure user exists in DB
    apiJson(`/me?user_id=${encodeURIComponent(uid)}`).catch(() => {
      // ignore; UI still works, but saved/likes will fail until API is reachable
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestCode() {
    setStatus(null);
    setDevCode(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setStatus("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      // Your backend only needs email, but it has been tolerant of extra fields.
      // We'll keep user_id here for compatibility with what you're already running.
      const data = await apiJson<any>(`/auth/request-code`, {
        method: "POST",
        body: JSON.stringify({
          email: normalizedEmail,
          user_id: userId || null,
        }),
      });

      // Support both naming styles (devCode vs dev_code)
      const possibleDev =
        data?.devCode || data?.dev_code || data?.dev_code?.toString?.();
      if (possibleDev) setDevCode(String(possibleDev));

      setEmail(normalizedEmail);
      setStep("code");
      setStatus("A one-time code was sent. Enter it below.");
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

    setLoading(true);
    try {
      const data = await apiJson<any>(`/auth/verify-code`, {
        method: "POST",
        body: JSON.stringify({
          email: normalizedEmail,
          code: normalizedCode,
          user_id: userId || null, // harmless if backend ignores it
        }),
      });

      /**
       * Your backend may return different shapes depending on version.
       * We support all of these:
       * - data.userId  (your FastAPI example)
       * - data.user_id
       * - data.userId from other builds
       */
      const stable =
        (data?.userId || data?.user_id || data?.userID || "").toString().trim();

      if (!stable) {
        throw new Error(
          "Login worked but the server did not return a user id. Please try again."
        );
      }

      // ✅ CRITICAL FIX: lock this email to the stable user id
      setStableUserId(stable);
      setUserId(stable);

      // Optional: store token/email if your backend provides them
      if (data?.token) localStorage.setItem("bw_session_token", String(data.token));
      if (data?.email) localStorage.setItem("bw_email", String(data.email));
      else localStorage.setItem("bw_email", normalizedEmail);

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
              Current session id:
              <span style={{ marginLeft: 6, fontFamily: "monospace" }}>
                {userId || "—"}
              </span>
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

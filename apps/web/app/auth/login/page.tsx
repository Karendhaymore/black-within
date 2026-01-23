"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type RequestCodeResponse = {
  ok: boolean;
  devCode?: string; // preview mode only
};

type VerifyCodeResponse = {
  ok: boolean;
  userId: string;
};

function getApiBaseUrl() {
  // 1) Prefer NEXT_PUBLIC_API_BASE_URL if you set it in Render env vars
  // 2) Fallback to your Render API URL
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ||
    "https://black-within-api.onrender.com"
  );
}

export default function LoginPage() {
  const router = useRouter();
  const API_BASE = useMemo(() => getApiBaseUrl(), []);

  const [step, setStep] = useState<"email" | "code">("email");

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preview mode convenience: show the dev code returned by API (optional)
  const [devCode, setDevCode] = useState<string | null>(null);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDevCode(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid email.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/request-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Request failed (${res.status})`);
      }

      const data = (await res.json()) as RequestCodeResponse;

      if (!data.ok) {
        throw new Error("Could not request code. Please try again.");
      }

      if (data.devCode) setDevCode(data.devCode);
      setStep("code");
    } catch (err: any) {
      setError(err?.message || "Something went wrong requesting your code.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid email.");
      return;
    }
    if (!/^\d{6}$/.test(cleanCode)) {
      setError("Please enter the 6-digit code.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, code: cleanCode }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Verify failed (${res.status})`);
      }

      const data = (await res.json()) as VerifyCodeResponse;

      if (!data.ok || !data.userId) {
        throw new Error("Invalid code. Please request a new one and try again.");
      }

      // Store userId for the rest of the app (saved/likes endpoints need it)
      localStorage.setItem("bw_user_id", data.userId);
      localStorage.setItem("bw_email", cleanEmail);

      router.push("/discover");
    } catch (err: any) {
      setError(err?.message || "Something went wrong verifying your code.");
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
        padding: "2rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: 520 }}>
        <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>
          Log In
        </h1>
        <p style={{ color: "#555", marginBottom: "1.5rem" }}>
          Enter gently. This space is designed to move at the speed of trust.
        </p>

        {step === "email" ? (
          <form onSubmit={requestCode} style={{ display: "grid", gap: "0.9rem" }}>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>Email</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={{
                  padding: "0.7rem",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                }}
              />
            </label>

            {error && (
              <div
                style={{
                  padding: "0.75rem",
                  borderRadius: 8,
                  border: "1px solid #f2c2c2",
                  background: "#fff7f7",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "0.8rem 1.1rem",
                borderRadius: 10,
                border: "1px solid #ccc",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Sending code..." : "Send me a code"}
            </button>

            <div style={{ marginTop: "0.5rem" }}>
              <a href="/auth/signup" style={{ color: "inherit" }}>
                Need an account? Create one
              </a>
            </div>
          </form>
        ) : (
          <form onSubmit={verifyCode} style={{ display: "grid", gap: "0.9rem" }}>
            <div style={{ color: "#555" }}>
              We sent a 6-digit code to <b>{email.trim()}</b>.
            </div>

            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>6-digit code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                placeholder="123456"
                style={{
                  padding: "0.7rem",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  letterSpacing: "0.2em",
                }}
              />
            </label>

            {devCode && (
              <div
                style={{
                  padding: "0.75rem",
                  borderRadius: 8,
                  border: "1px solid #cde7d1",
                  background: "#f3fff5",
                }}
              >
                <b>Dev code (preview mode):</b> {devCode}
              </div>
            )}

            {error && (
              <div
                style={{
                  padding: "0.75rem",
                  borderRadius: 8,
                  border: "1px solid #f2c2c2",
                  background: "#fff7f7",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "0.8rem 1.1rem",
                borderRadius: 10,
                border: "1px solid #ccc",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Verifying..." : "Verify & Continue"}
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
                setDevCode(null);
              }}
              style={{
                padding: "0.8rem 1.1rem",
                borderRadius: 10,
                border: "1px solid #eee",
                cursor: loading ? "not-allowed" : "pointer",
                background: "transparent",
              }}
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

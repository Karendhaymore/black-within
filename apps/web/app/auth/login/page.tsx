"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setCurrentUser } from "../../lib/storage";

type RequestCodeResponse = {
  ok: boolean;
  devCode?: string;
};

type VerifyCodeResponse = {
  ok: boolean;
  userId?: string;
  user_id?: string;
};

function getApiBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, "") ||
    process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, "") ||
    "https://black-within-api.onrender.com"
  );
}

function isValidEmail(email: string) {
  const e = (email || "").trim().toLowerCase();
  return !!e && e.includes("@") && e.includes(".");
}

export default function AuthPage() {
  const router = useRouter();
  const API_BASE = useMemo(() => getApiBaseUrl(), []);

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [devCode, setDevCode] = useState<string>("");

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setDevCode("");

    const cleanEmail = (email || "").trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) {
      setError("Please enter a valid email address.");
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
      if (!data?.ok) throw new Error("We couldn’t send your code. Please try again.");

      if (data?.devCode) setDevCode(String(data.devCode));
      setStep("code");
    } catch (err: any) {
      setError(err?.message || "Something went wrong requesting your code.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanCode = (code || "").trim();

    if (!isValidEmail(cleanEmail)) {
      setError("Please enter a valid email address.");
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
      const userId = data?.userId || data?.user_id;

      if (!data?.ok || !userId) {
        throw new Error("That code didn’t work. Please request a new one and try again.");
      }

      setCurrentUser(String(userId), cleanEmail);
      router.push("/discover");
    } catch (err: any) {
      setError(err?.message || "Something went wrong verifying your code.");
    } finally {
      setLoading(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 520,
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.92)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
    padding: "1.5rem",
    backdropFilter: "blur(6px)",
  };

  const labelStyle: React.CSSProperties = { display: "grid", gap: "0.35rem" };

  const inputStyle: React.CSSProperties = {
    padding: "0.8rem 0.9rem",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.18)",
    background: "white",
    outline: "none",
  };

  const primaryBtn: React.CSSProperties = {
    padding: "0.85rem 1.1rem",
    borderRadius: 12,
    border: "1px solid #0a5",
    background: "#0a5",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
  };

  const secondaryBtn: React.CSSProperties = {
    padding: "0.85rem 1.1rem",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.14)",
    background: "white",
    cursor: "pointer",
    fontWeight: 600,
  };

  const subtleLink: React.CSSProperties = {
    color: "inherit",
    textDecoration: "none",
    borderBottom: "1px solid rgba(0,0,0,0.25)",
    paddingBottom: 1,
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem 1rem",
        background:
          // Minimal + premium “diaspora-inspired” feel: deep neutral + warm gold accents
          "radial-gradient(1200px 600px at 20% 10%, rgba(197,137,45,0.18), transparent 60%), radial-gradient(900px 500px at 80% 20%, rgba(10,85,0,0.14), transparent 55%), radial-gradient(900px 700px at 50% 90%, rgba(0,0,0,0.12), transparent 55%), #0b0b0b",
      }}
    >
      <div style={{ width: "100%", maxWidth: 900 }}>
        {/* Subtle “pattern” band (minimal, premium, not busy) */}
        <div
          style={{
            margin: "0 auto 14px",
            maxWidth: 520,
            height: 10,
            borderRadius: 999,
            background:
              "linear-gradient(90deg, rgba(197,137,45,0.0), rgba(197,137,45,0.55), rgba(10,85,0,0.55), rgba(197,137,45,0.55), rgba(197,137,45,0.0))",
            opacity: 0.9,
          }}
        />

        <div style={cardStyle}>
          <div style={{ marginBottom: 14 }}>
            <h1 style={{ fontSize: "2rem", margin: 0, color: "#111" }}>Welcome back</h1>
            <p style={{ margin: "0.45rem 0 0", color: "rgba(0,0,0,0.72)", lineHeight: 1.4 }}>
              Enter gently. This space is designed to move at the speed of trust.
            </p>
          </div>

          {step === "email" ? (
            <form onSubmit={requestCode} style={{ display: "grid", gap: "0.9rem" }}>
              <label style={labelStyle}>
                <span style={{ fontWeight: 600, color: "#111" }}>Email</span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  style={inputStyle}
                />
              </label>

              {error ? (
                <div
                  style={{
                    padding: "0.85rem",
                    borderRadius: 12,
                    border: "1px solid rgba(176,0,32,0.25)",
                    background: "rgba(176,0,32,0.06)",
                    color: "#7a1b1b",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {error}
                </div>
              ) : null}

              <button type="submit" disabled={loading} style={{ ...primaryBtn, opacity: loading ? 0.75 : 1 }}>
                {loading ? "Sending code…" : "Send me a code"}
              </button>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <Link href="/auth/signup" style={subtleLink}>
                  Need an account? Create one
                </Link>

                {/* Placeholder: we'll wire this once backend endpoints exist */}
                <button
                  type="button"
                  onClick={() => {
                    // For now, this is a friendly message until we build the reset flow.
                    setError("Forgot password is coming next. (We’ll add the reset email flow.)");
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: "rgba(0,0,0,0.85)",
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                  }}
                >
                  Forgot password?
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={verifyCode} style={{ display: "grid", gap: "0.9rem" }}>
              <div style={{ color: "rgba(0,0,0,0.72)", lineHeight: 1.4 }}>
                We sent a 6-digit code to <b>{(email || "").trim()}</b>.
              </div>

              <label style={labelStyle}>
                <span style={{ fontWeight: 600, color: "#111" }}>6-digit code</span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  style={{ ...inputStyle, letterSpacing: "0.25em" }}
                />
              </label>

              {/* Dev-only code display (only appears if API returns devCode in preview mode) */}
              {devCode ? (
                <div
                  style={{
                    padding: "0.85rem",
                    borderRadius: 12,
                    border: "1px solid rgba(10,85,0,0.25)",
                    background: "rgba(10,85,0,0.06)",
                    color: "#1f5b1f",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  <b>Dev code:</b> {devCode}
                </div>
              ) : null}

              {error ? (
                <div
                  style={{
                    padding: "0.85rem",
                    borderRadius: 12,
                    border: "1px solid rgba(176,0,32,0.25)",
                    background: "rgba(176,0,32,0.06)",
                    color: "#7a1b1b",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {error}
                </div>
              ) : null}

              <button type="submit" disabled={loading} style={{ ...primaryBtn, opacity: loading ? 0.75 : 1 }}>
                {loading ? "Verifying…" : "Verify & Continue"}
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError("");
                  setDevCode("");
                }}
                style={{ ...secondaryBtn, opacity: loading ? 0.75 : 1 }}
              >
                Use a different email
              </button>
            </form>
          )}

          <div style={{ marginTop: 16, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
            By continuing, you agree to keep this space respectful and real.
          </div>
        </div>
      </div>
    </main>
  );
}

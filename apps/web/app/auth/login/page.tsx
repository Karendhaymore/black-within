"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
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

      try {
        return JSON.stringify(data.detail, null, 2);
      } catch {
        return String(data.detail);
      }
    }

    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  } catch {}

  try {
    const text = await res.text();
    if (text) return text;
  } catch {}

  return `Request failed (${res.status}).`;
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [loading, setLoading] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      if (!res.ok) {
        const detail = await safeReadErrorDetail(res);

        if (res.status === 403) {
          throw new Error(detail || "Your account has been suspended.");
        }

        throw new Error(detail || "Email or password is incorrect.");
      }

      const data = await res.json();

      const userId = (
        data?.user_id ||
        data?.userId ||
        data?.id ||
        ""
      ).toString();

      if (!userId) {
        throw new Error("Login succeeded, but no user id returned.");
      }

      localStorage.setItem("bw_user_id", userId);
      localStorage.setItem("bw_logged_in", "1");

      if (data?.session_token) {
        localStorage.setItem(
          "bw_session_token",
          String(data.session_token)
        );
      }

      router.replace("/discover");
    } catch (err: any) {
      setError(err?.message || "Login error");
    } finally {
      setLoading(false);
    }
  }

  async function resendVerificationEmail() {
    if (!email.trim()) {
      setError("Please enter your email address first.");
      return;
    }

    setSendingVerification(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(
        `${API_BASE}/auth/resend-verification`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password: "",
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.detail || "Unable to send verification email."
        );
      }

      setSuccess(
        data?.message ||
          "Verification email sent. Please check your inbox."
      );
    } catch (err: any) {
      setError(
        err?.message || "Unable to send verification email."
      );
    } finally {
      setSendingVerification(false);
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
          background: "#fff",
          color: "#111",
          padding: 24,
          borderRadius: 16,
          boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <h2
          style={{
            margin: 0,
            color: "#111",
            fontWeight: 900,
          }}
        >
          Log in
        </h2>

        <input
          type="email"
          placeholder="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
          autoComplete="email"
        />

        <input
          type="password"
          placeholder="Password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
          autoComplete="current-password"
        />

        {error && (
          <div
            style={{
              color: "crimson",
              fontSize: 14,
              whiteSpace: "pre-wrap",
            }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            style={{
              color: "green",
              fontSize: 14,
              whiteSpace: "pre-wrap",
            }}
          >
            {success}
          </div>
        )}

        <button
          type="button"
          onClick={resendVerificationEmail}
          disabled={sendingVerification}
          style={{
            padding: "0.8rem",
            borderRadius: 10,
            border: "1px solid #0a5",
            background: "#fff",
            color: "#0a5",
            fontWeight: 700,
            cursor: sendingVerification ? "not-allowed" : "pointer",
         }}
       >
          {sendingVerification ? "Sending..." : "Resend Verification Email"}
       </button>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "0.9rem",
            borderRadius: 10,
            border: "none",
            background: "#111",
            color: "#fff",
            fontWeight: 800,
            cursor: loading
              ? "not-allowed"
              : "pointer",
            opacity: loading ? 0.8 : 1,
          }}
        >
          {loading ? "Logging in..." : "Log In"}
        </button>

        <a
          href="/auth/forgot"
          style={{
            textAlign: "center",
            fontSize: 13,
            color: "#222",
          }}
        >
          Forgot password?
        </a>

        <div
          style={{
            textAlign: "center",
            fontSize: 13,
            marginTop: 2,
            color: "#111",
          }}
        >
          <Link
            href="/auth/signup"
            style={{
              color: "#111",
              textDecoration: "underline",
            }}
          >
            Create account
          </Link>
        </div>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "0.8rem",
  borderRadius: 8,
  border: "1px solid #999",
  fontSize: 15,
  color: "#111",
  background: "#fff",
  fontWeight: 600,
  outlineColor: "#111",
};

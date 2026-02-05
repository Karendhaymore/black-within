"use client";

import Link from "next/link";

export default function HomePage() {
  const bg = {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: "2.5rem 1rem",
    background:
      "radial-gradient(1200px 700px at 15% 10%, rgba(197,137,45,0.18), transparent 60%), radial-gradient(900px 600px at 85% 20%, rgba(10,85,0,0.14), transparent 55%), radial-gradient(900px 700px at 50% 92%, rgba(0,0,0,0.14), transparent 55%), #0b0b0b",
  } as const;

  const card = {
    width: "100%",
    maxWidth: 900,
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.92)",
    boxShadow: "0 18px 60px rgba(0,0,0,0.28)",
    padding: "2rem",
    backdropFilter: "blur(8px)",
  } as const;

  const pill = {
    display: "inline-block",
    padding: "0.4rem 0.75rem",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.14)",
    background: "rgba(197,137,45,0.10)",
    color: "rgba(0,0,0,0.78)",
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
  };

  const btn = {
    display: "inline-block",
    padding: "0.95rem 1.15rem",
    borderRadius: 14,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    textDecoration: "none",
    fontWeight: 800,
  };

  return (
    <main style={bg}>
      <div style={{ width: "100%", maxWidth: 980 }}>
        <div
          style={{
            margin: "0 auto 14px",
            maxWidth: 900,
            height: 10,
            borderRadius: 999,
            background:
              "linear-gradient(90deg, rgba(197,137,45,0.0), rgba(197,137,45,0.55), rgba(10,85,0,0.55), rgba(197,137,45,0.55), rgba(197,137,45,0.0))",
            opacity: 0.9,
          }}
        />

        <section style={card}>
          <div style={pill}>Black Within</div>

          <h1 style={{ margin: "12px 0 8px", fontSize: "2.3rem", color: "#111" }}>
            Connection with intention.
          </h1>

          <p style={{ margin: 0, color: "rgba(0,0,0,0.72)", lineHeight: 1.55, fontSize: 16 }}>
            A community built for safety, alignment, and real conversation — not noise.
          </p>

          <div style={{ marginTop: 18, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/discover" style={btn}>
              Log in / Create account
            </Link>
          </div>

          <div style={{ marginTop: 14, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
            Move slow. Move honest. Move protected.
          </div>
        </section>
      </div>
    </main>
  );
}

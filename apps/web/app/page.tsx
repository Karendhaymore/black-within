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
    background: "rgba(255,255,255,0.96)",
    boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
    padding: "2.25rem",
    backdropFilter: "blur(8px)",
  } as const;

  const pill = {
    display: "inline-block",
    padding: "0.45rem 0.8rem",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.14)",
    background: "rgba(197,137,45,0.12)",
    color: "#111",
    fontWeight: 800,
    fontSize: 12,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
  };

  const btn = {
    display: "inline-block",
    padding: "1rem 1.2rem",
    borderRadius: 14,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    textDecoration: "none",
    fontWeight: 800,
    letterSpacing: "0.02em",
    transition: "all 0.2s ease",
  };

  return (
    <main style={bg}>
      <div style={{ width: "100%", maxWidth: 980 }}>
        <section style={card}>
          <div style={pill}>Black Within</div>

          <h1
            style={{
              margin: "14px 0 10px",
              fontSize: "2.5rem",
              color: "#111",
              fontWeight: 800,
              lineHeight: 1.1,
            }}
          >
            Connection with intention.
          </h1>

          <p
            style={{
              margin: 0,
              color: "#333",
              lineHeight: 1.7,
              fontSize: 17,
              maxWidth: 620,
            }}
          >
            A community built for safety, alignment, and real conversation —
            not noise.
          </p>

          <div style={{ marginTop: 24 }}>
            <Link href="/auth/login" style={btn}>
              ENTER COMMUNITY
            </Link>
          </div>

          <div
            style={{
              marginTop: 18,
              fontSize: 13,
              color: "#555",
              fontWeight: 500,
            }}
          >
            Move slow. Move honest. Move protected.
          </div>
        </section>
      </div>
    </main>
  );
}

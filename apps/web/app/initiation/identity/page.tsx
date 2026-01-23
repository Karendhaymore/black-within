"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function IdentityPage() {
  const router = useRouter();

  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");
  const [q3, setQ3] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!q1.trim() || !q2.trim() || !q3.trim()) {
      return setError("Please share a brief response for each question before continuing.");
    }

    localStorage.setItem(
      "bw_identity",
      JSON.stringify({ defineBlackness: q1.trim(), lineageRole: q2.trim(), consciousPartnership: q3.trim() })
    );

    router.push("/initiation/intention");
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem" }}>
      <div style={{ width: "100%", maxWidth: 700 }}>
        <div style={{ marginBottom: "1rem", color: "#666" }}>Step 2 of 6</div>

        <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Identity &amp; Lineage</h1>
        <p style={{ color: "#555", marginBottom: "1.5rem" }}>
          Take your time. There are no right answers here.
        </p>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: "1rem" }}>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span>How do you define Blackness for yourself?</span>
            <textarea
              value={q1}
              onChange={(e) => setQ1(e.target.value)}
              rows={4}
              style={{ padding: "0.8rem", borderRadius: 8, border: "1px solid #ccc" }}
            />
          </label>

          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span>What role does ancestry or lineage play in your life?</span>
            <textarea
              value={q2}
              onChange={(e) => setQ2(e.target.value)}
              rows={4}
              style={{ padding: "0.8rem", borderRadius: 8, border: "1px solid #ccc" }}
            />
          </label>

          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span>What does conscious partnership mean to you?</span>
            <textarea
              value={q3}
              onChange={(e) => setQ3(e.target.value)}
              rows={4}
              style={{ padding: "0.8rem", borderRadius: 8, border: "1px solid #ccc" }}
            />
          </label>

          {error && (
            <div style={{ padding: "0.75rem", borderRadius: 8, border: "1px solid #f2c2c2", background: "#fff7f7" }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => router.back()}
              style={{ padding: "0.8rem 1.1rem", borderRadius: 10, border: "1px solid #ccc", cursor: "pointer" }}
            >
              Back
            </button>

            <button
              type="submit"
              style={{ padding: "0.8rem 1.1rem", borderRadius: 10, border: "1px solid #ccc", cursor: "pointer" }}
            >
              Continue with intention
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

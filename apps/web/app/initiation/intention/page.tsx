"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const OPTIONS = [
  "Intentional partnership",
  "Marriage-minded",
  "Conscious companionship",
  "Community-first connection",
  "Open to evolving alignment",
];

export default function IntentionPage() {
  const router = useRouter();
  const [intention, setIntention] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!intention) return setError("Please choose one intention to continue.");

    localStorage.setItem("bw_intention", JSON.stringify({ intention }));
    router.push("/initiation/alignment");
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem" }}>
      <div style={{ width: "100%", maxWidth: 700 }}>
        <div style={{ marginBottom: "1rem", color: "#666" }}>Step 3 of 6</div>

        <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Relationship Intention</h1>
        <p style={{ color: "#555", marginBottom: "1.5rem" }}>
          Intentions can evolve. Honesty matters more than certainty.
        </p>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: "1rem" }}>
          <div style={{ display: "grid", gap: "0.6rem" }}>
            {OPTIONS.map((opt) => (
              <label
                key={opt}
                style={{
                  display: "flex",
                  gap: "0.6rem",
                  alignItems: "center",
                  padding: "0.85rem",
                  border: "1px solid #ccc",
                  borderRadius: 10,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="intention"
                  value={opt}
                  checked={intention === opt}
                  onChange={() => setIntention(opt)}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>

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
              Continue
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PhotosPage() {
  const router = useRouter();

  const [photo1, setPhoto1] = useState("");
  const [photo2, setPhoto2] = useState("");
  const [photo3, setPhoto3] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!photo1.trim() || !photo2.trim()) {
      return setError("Please provide at least 2 photo links to continue (temporary MVP step).");
    }

    localStorage.setItem(
      "bw_photos",
      JSON.stringify({
        photos: [photo1.trim(), photo2.trim(), photo3.trim()].filter(Boolean),
      })
    );

    router.push("/initiation/complete");
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem" }}>
      <div style={{ width: "100%", maxWidth: 700 }}>
        <div style={{ marginBottom: "1rem", color: "#666" }}>Step 5 of 6</div>

        <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Profile Photos</h1>
        <p style={{ color: "#555", marginBottom: "1rem" }}>
          Black Within is identity-forward, not appearance-first. Share what feels true.
        </p>
        <p style={{ color: "#666", marginBottom: "1.5rem" }}>
          Temporary MVP: paste image links now. We’ll replace this with real uploads later.
        </p>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: "1rem" }}>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span>Photo 1 link (required)</span>
            <input
              value={photo1}
              onChange={(e) => setPhoto1(e.target.value)}
              placeholder="https://..."
              style={{ padding: "0.7rem", borderRadius: 8, border: "1px solid #ccc" }}
            />
          </label>

          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span>Photo 2 link (required)</span>
            <input
              value={photo2}
              onChange={(e) => setPhoto2(e.target.value)}
              placeholder="https://..."
              style={{ padding: "0.7rem", borderRadius: 8, border: "1px solid #ccc" }}
            />
          </label>

          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span>Photo 3 link (optional)</span>
            <input
              value={photo3}
              onChange={(e) => setPhoto3(e.target.value)}
              placeholder="https://..."
              style={{ padding: "0.7rem", borderRadius: 8, border: "1px solid #ccc" }}
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
              Complete Entry
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

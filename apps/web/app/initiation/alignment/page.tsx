"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const TAGS = [
  "Afrocentric Spirituality",
  "Dogon",
  "Kemetic Philosophy",
  "Ubuntu",
  "Sankofa",
  "Ifa / Orisha Traditions (Yoruba)",
  "Vodun / Vodou",
  "Hoodoo / Rootwork",
  "Hebrew Israelite",
  "Candomblé",
  "Obeah",
  "Pan African Spiritual Movements",
  "African-Centered Holistic Healing",
  "Bible Based Christian",
  "Ancestral Veneration Systems",
  "Liberated Christianity",
  "Islam",
  "New Age Spirituality",
  "Afrofuturist Spirituality",
  "Metaphysical Science (African-centered variants)",
  "Quantum Spirituality",
  "Prefer not to say",
];

export default function AlignmentPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [pathNote, setPathNote] = useState("");

  const isPreferNot = useMemo(() => selected.includes("Prefer not to say"), [selected]);

  function toggle(tag: string) {
    // If user chooses "Prefer not to say", clear all other selections
    if (tag === "Prefer not to say") {
      setSelected((prev) => (prev.includes(tag) ? [] : [tag]));
      return;
    }

    // If "Prefer not to say" is already selected, remove it before selecting others
    setSelected((prev) => {
      const withoutPreferNot = prev.filter((t) => t !== "Prefer not to say");
      if (withoutPreferNot.includes(tag)) return withoutPreferNot.filter((t) => t !== tag);
      return [...withoutPreferNot, tag];
    });
  }

  function onContinue() {
    localStorage.setItem("bw_alignment", JSON.stringify({ tags: selected, note: pathNote.trim() || null }));
    router.push("/initiation/photos");
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem" }}>
      <div style={{ width: "100%", maxWidth: 820 }}>
        <div style={{ marginBottom: "1rem", color: "#666" }}>Step 4 of 6</div>

        <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Cultural &amp; Spiritual Grounding</h1>
        <p style={{ color: "#555", marginBottom: "1.5rem" }}>
          Select what shapes how you see the world. You can update this anytime.
        </p>

        <div style={{ display: "grid", gap: "1rem" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "0.6rem",
            }}
          >
            {TAGS.map((tag) => {
              const active = selected.includes(tag);
              const disabled = isPreferNot && tag !== "Prefer not to say";
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggle(tag)}
                  disabled={disabled}
                  style={{
                    textAlign: "left",
                    padding: "0.85rem",
                    borderRadius: 10,
                    border: "1px solid #ccc",
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.5 : 1,
                    background: active ? "#f3f3f3" : "transparent",
                  }}
                >
                  {tag}
                </button>
              );
            })}
          </div>

          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span>Anything you’d like to share about your path? (optional)</span>
            <textarea
              value={pathNote}
              onChange={(e) => setPathNote(e.target.value)}
              rows={4}
              style={{ padding: "0.8rem", borderRadius: 8, border: "1px solid #ccc" }}
            />
          </label>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => router.back()}
              style={{ padding: "0.8rem 1.1rem", borderRadius: 10, border: "1px solid #ccc", cursor: "pointer" }}
            >
              Back
            </button>

            <button
              type="button"
              onClick={onContinue}
              style={{ padding: "0.8rem 1.1rem", borderRadius: 10, border: "1px solid #ccc", cursor: "pointer" }}
            >
              Continue
            </button>

            <button
              type="button"
              onClick={onContinue}
              style={{
                padding: "0.8rem 1.1rem",
                borderRadius: 10,
                border: "1px solid #ccc",
                cursor: "pointer",
                background: "transparent",
              }}
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

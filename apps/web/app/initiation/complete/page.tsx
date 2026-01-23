"use client";

import { useRouter } from "next/navigation";

export default function CompletePage() {
  const router = useRouter();

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem" }}>
      <div style={{ textAlign: "center", maxWidth: 720 }}>
        <div style={{ marginBottom: "1rem", color: "#666" }}>Step 6 of 6</div>

        <h1 style={{ fontSize: "2.2rem", marginBottom: "0.75rem" }}>You’re In</h1>

        <p style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>
          Your profile has entered a protected cultural space.
        </p>

        <p style={{ color: "#555", marginBottom: "1.75rem" }}>
          Take your time. Browse intentionally. Alignment matters more than algorithms here.
        </p>

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => router.push("/discover")}
            style={{ padding: "0.8rem 1.1rem", borderRadius: 10, border: "1px solid #ccc", cursor: "pointer" }}
          >
            Explore Profiles
          </button>

          <button
            onClick={() => router.push("/profile/edit")}
            style={{ padding: "0.8rem 1.1rem", borderRadius: 10, border: "1px solid #ccc", cursor: "pointer" }}
          >
            Edit My Profile
          </button>
        </div>

        <p style={{ marginTop: "1.5rem", color: "#777", fontSize: "0.95rem" }}>
          Note: “Edit My Profile” is coming next. For now, you can continue to Discover.
        </p>
      </div>
    </main>
  );
}

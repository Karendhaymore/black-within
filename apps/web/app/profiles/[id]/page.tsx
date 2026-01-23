"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { SAMPLE_PROFILES } from "../../lib/sampleProfiles";

export default function ProfileViewPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const profile = useMemo(() => SAMPLE_PROFILES.find((p) => p.id === id), [id]);

  if (!profile || !profile.isAvailable) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem" }}>
        <div style={{ textAlign: "center", maxWidth: 600 }}>
          <h1 style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>Profile Not Available</h1>
          <p style={{ color: "#555", marginBottom: "1.5rem" }}>
            This profile is no longer available.
          </p>
          <a
            href="/discover"
            style={{ padding: "0.65rem 1rem", border: "1px solid #ccc", borderRadius: 10, textDecoration: "none", color: "inherit" }}
          >
            Back to Discover
          </a>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", padding: "2rem", display: "grid", placeItems: "start center" }}>
      <div style={{ width: "100%", maxWidth: 900 }}>
        <a
          href="/discover"
          style={{ display: "inline-block", marginBottom: "1rem", padding: "0.65rem 1rem", border: "1px solid #ccc", borderRadius: 10, textDecoration: "none", color: "inherit" }}
        >
          Back to Discover
        </a>

        <div style={{ border: "1px solid #e5e5e5", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ width: "100%", aspectRatio: "16 / 9", background: "#f3f3f3" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={profile.photo} alt={profile.displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>

          <div style={{ padding: "1.25rem" }}>
            <h1 style={{ fontSize: "2rem", marginBottom: "0.25rem" }}>{profile.displayName}</h1>
            <div style={{ color: "#666", marginBottom: "1rem" }}>
              {profile.age} • {profile.city}, {profile.stateUS}
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Relationship Intention</div>
              <div style={{ color: "#555" }}>{profile.intention}</div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Identity Preview</div>
              <div style={{ color: "#555" }}>{profile.identityPreview}</div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Grounding</div>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                {profile.tags.map((t) => (
                  <span key={t} style={{ fontSize: "0.85rem", padding: "0.25rem 0.5rem", border: "1px solid #ddd", borderRadius: 999 }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ marginTop: "1.25rem", padding: "1rem", borderRadius: 12, border: "1px solid #eee", color: "#666" }}>
              Personal Boundaries and Vision of Alignment are private and only unlock through mutual alignment and shared access.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

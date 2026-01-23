"use client";

import { useEffect, useMemo, useState } from "react";
import { SAMPLE_PROFILES } from "../lib/sampleProfiles";
import { cleanupSavedIds, getSavedIds, removeSavedId } from "../lib/storage";

export default function SavedPage() {
  const [savedIds, setSavedIds] = useState<string[]>([]);

  const availableProfiles = useMemo(() => SAMPLE_PROFILES.filter((p) => p.isAvailable), []);

  useEffect(() => {
    cleanupSavedIds(availableProfiles);
    setSavedIds(getSavedIds());
  }, [availableProfiles]);

  const savedProfiles = availableProfiles.filter((p) => savedIds.includes(p.id));

  function onRemove(id: string) {
    removeSavedId(id);
    setSavedIds(getSavedIds());
  }

  return (
    <main style={{ minHeight: "100vh", padding: "2rem", display: "grid", placeItems: "start center" }}>
      <div style={{ width: "100%", maxWidth: 1000 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "2.2rem", marginBottom: "0.25rem" }}>Saved Profiles</h1>
            <p style={{ color: "#555" }}>Saved profiles stay here until you remove them (or they become unavailable).</p>
          </div>

          <a
            href="/discover"
            style={{
              padding: "0.65rem 1rem",
              border: "1px solid #ccc",
              borderRadius: 10,
              textDecoration: "none",
              color: "inherit",
              height: "fit-content",
            }}
          >
            Back to Discover
          </a>
        </div>

        {savedProfiles.length === 0 ? (
          <div style={{ marginTop: "2rem", padding: "1rem", border: "1px solid #eee", borderRadius: 12, color: "#666" }}>
            You haven’t saved any profiles yet.
          </div>
        ) : (
          <div
            style={{
              marginTop: "1.5rem",
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "1rem",
            }}
          >
            {savedProfiles.map((p) => (
              <div key={p.id} style={{ border: "1px solid #e5e5e5", borderRadius: 14, overflow: "hidden" }}>
                <div style={{ width: "100%", aspectRatio: "4 / 3", background: "#f3f3f3" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.photo} alt={p.displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>

                <div style={{ padding: "1rem" }}>
                  <div style={{ fontSize: "1.15rem", fontWeight: 600 }}>{p.displayName}</div>
                  <div style={{ color: "#666" }}>
                    {p.age} • {p.city}, {p.stateUS}
                  </div>

                  <div style={{ marginTop: "1rem", display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                    <a
                      href={`/profiles/${p.id}`}
                      style={{
                        padding: "0.6rem 0.9rem",
                        borderRadius: 10,
                        border: "1px solid #ccc",
                        textDecoration: "none",
                        color: "inherit",
                      }}
                    >
                      View
                    </a>

                    <button
                      onClick={() => onRemove(p.id)}
                      style={{ padding: "0.6rem 0.9rem", borderRadius: 10, border: "1px solid #ccc", cursor: "pointer" }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { DEMO_PROFILES, type Profile } from "../lib/sampleProfiles";
import { getOrCreateUserId } from "../lib/user";
import { getSavedIds, removeSavedId } from "../lib/storage";

export default function SavedPage() {
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  // Only show profiles that are available + saved
  const savedProfiles = useMemo(() => {
    const set = new Set(savedIds);
    return DEMO_PROFILES.filter((p) => p.isAvailable && set.has(p.id));
  }, [savedIds]);

  useEffect(() => {
    const userId = getOrCreateUserId();

    (async () => {
      const saved = await getSavedIds(userId);
      setSavedIds(saved);
    })();
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  }

  async function onRemove(p: Profile) {
    const userId = getOrCreateUserId();
    await removeSavedId(userId, p.id);
    setSavedIds(await getSavedIds(userId));
    showToast("Removed from Saved Profiles.");
  }

  function getInitials(displayName: string) {
    return displayName
      .trim()
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "2rem",
        display: "grid",
        placeItems: "start center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 1100 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <div>
            <h1 style={{ fontSize: "2.2rem", marginBottom: "0.25rem" }}>
              Saved Profiles
            </h1>
            <p style={{ color: "#555" }}>
              Saved profiles stay here until you remove them (or the profile is no longer available).
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <a
              href="/discover"
              style={{
                padding: "0.65rem 1rem",
                border: "1px solid #ccc",
                borderRadius: 10,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              Back to Discover
            </a>

            <a
              href="/notifications"
              style={{
                padding: "0.65rem 1rem",
                border: "1px solid #ccc",
                borderRadius: 10,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              Notifications
            </a>
          </div>
        </div>

        {toast && (
          <div
            style={{
              marginTop: "1rem",
              padding: "0.75rem",
              borderRadius: 10,
              border: "1px solid #cfe7cf",
              background: "#f6fff6",
            }}
          >
            {toast}
          </div>
        )}

        <div
          style={{
            marginTop: "1.25rem",
            padding: "0.85rem",
            borderRadius: 12,
            border: "1px solid #eee",
            color: "#555",
          }}
        >
          You’re viewing saved preview profiles while Black Within opens intentionally.
        </div>

        {savedProfiles.length === 0 ? (
          <div
            style={{
              marginTop: "1.5rem",
              padding: "1.25rem",
              borderRadius: 14,
              border: "1px solid #eee",
              color: "#555",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>
              No saved profiles yet.
            </div>
            <div style={{ color: "#666" }}>
              Go to Discover and save profiles you want to revisit.
            </div>

            <div style={{ marginTop: "1rem" }}>
              <a
                href="/discover"
                style={{
                  padding: "0.65rem 1rem",
                  border: "1px solid #ccc",
                  borderRadius: 10,
                  textDecoration: "none",
                  color: "inherit",
                  display: "inline-block",
                }}
              >
                Go to Discover
              </a>
            </div>
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
              <div
                key={p.id}
                style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: 14,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "4 / 3",
                    background: "#f3f3f3",
                  }}
                >
                  {p.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.photo}
                      alt={p.displayName}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "grid",
                        placeItems: "center",
                        background: "#f2f2f2",
                        color: "#555",
                        fontSize: "1.5rem",
                        fontWeight: 600,
                      }}
                    >
                      {getInitials(p.displayName)}
                    </div>
                  )}
                </div>

                <div style={{ padding: "1rem" }}>
                  <div style={{ fontSize: "1.15rem", fontWeight: 600 }}>
                    {p.displayName}
                  </div>

                  <div style={{ color: "#666", marginTop: "0.4rem" }}>
                    {p.age} • {p.city}, {p.stateUS}
                  </div>

                  <div style={{ marginTop: "0.75rem", color: "#555" }}>
                    {p.identityPreview}
                  </div>

                  <div
                    style={{
                      marginTop: "0.75rem",
                      display: "flex",
                      gap: "0.4rem",
                      flexWrap: "wrap",
                    }}
                  >
                    {p.tags.slice(0, 3).map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: "0.85rem",
                          padding: "0.25rem 0.5rem",
                          border: "1px solid #ddd",
                          borderRadius: 999,
                          color: "#444",
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>

                  <div
                    style={{
                      marginTop: "1rem",
                      display: "flex",
                      gap: "0.6rem",
                      flexWrap: "wrap",
                    }}
                  >
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
                      onClick={() => onRemove(p)}
                      style={{
                        padding: "0.6rem 0.9rem",
                        borderRadius: 10,
                        border: "1px solid #ccc",
                        cursor: "pointer",
                        background: "white",
                      }}
                    >
                      Remove
                    </button>
                  </div>

                  <div
                    style={{
                      marginTop: "0.75rem",
                      color: "#777",
                      fontSize: "0.9rem",
                    }}
                  >
                    Saved until you remove it.
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: "2rem", color: "#777", fontSize: "0.95rem" }}>
          MVP note: Saved Profiles are stored in the database so they survive refresh and redeploys.
          Full cross-device syncing will be automatic once we add login.
        </div>
      </div>
    </main>
  );
}

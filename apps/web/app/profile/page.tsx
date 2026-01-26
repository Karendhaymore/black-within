"use client";

import { useEffect, useState } from "react";
import { getOrCreateUserId } from "../lib/user";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  "https://black-within-api.onrender.com";

type FormState = {
  display_name: string;
  age: string; // keep as string in input
  city: string;
  state_us: string;
  photo: string;
  identity_preview: string;
  intention: string;
  tags: string; // comma separated
};

async function apiUpsertProfile(payload: any) {
  // ✅ FIX: endpoint must match API
  const res = await fetch(`${API_BASE}/profiles/upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Failed to save profile.");
  }
  return res.json();
}

export default function MyProfilePage() {
  const [userId, setUserId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    display_name: "",
    age: "",
    city: "",
    state_us: "",
    photo: "",
    identity_preview: "",
    intention: "Dating with intention",
    tags: "",
  });

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  }

  useEffect(() => {
    const uid = getOrCreateUserId();
    setUserId(uid);
  }, []);

  function onChange<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave() {
    if (!userId) return;

    // simple validation
    if (!form.display_name.trim()) return showToast("Please add a display name.");
    const ageNum = parseInt(form.age || "0", 10);
    if (!ageNum || ageNum < 18) return showToast("Please enter a valid age (18+).");
    if (!form.city.trim()) return showToast("Please add your city.");
    if (!form.state_us.trim()) return showToast("Please add your state.");
    if (!form.identity_preview.trim())
      return showToast("Please add your short identity preview.");
    if (!form.intention.trim()) return showToast("Please add your intention.");

    const tagsList = (form.tags || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    setSaving(true);
    setApiError(null);

    try {
      // ✅ FIX: payload keys must match API schema
      await apiUpsertProfile({
        owner_user_id: userId,
        displayName: form.display_name.trim(),
        age: ageNum,
        city: form.city.trim(),
        stateUS: form.state_us.trim(),
        photo: form.photo.trim() || null,
        identityPreview: form.identity_preview.trim(),
        intention: form.intention.trim(),
        tags: tagsList,
        isAvailable: true,
      });

      showToast("Profile saved. You are now a real profile in the database.");
    } catch (e: any) {
      setApiError(e?.message || "Could not save profile.");
      showToast("Save failed. See API notice.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", padding: "2rem", display: "grid", placeItems: "start center" }}>
      <div style={{ width: "100%", maxWidth: 900 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "2.2rem", marginBottom: "0.25rem" }}>My Profile</h1>
            <p style={{ color: "#555" }}>
              Create your real profile (stored in the database). This is what other users will browse.
            </p>
            <div style={{ marginTop: "0.75rem", color: "#777", fontSize: "0.92rem" }}>
              Your user id: <code>{userId || "..."}</code>
            </div>
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
                height: "fit-content",
              }}
            >
              Back to Discover
            </a>
          </div>
        </div>

        {apiError && (
          <div
            style={{
              marginTop: "0.9rem",
              padding: "0.85rem",
              borderRadius: 12,
              border: "1px solid #f0c9c9",
              background: "#fff7f7",
              color: "#7a2d2d",
            }}
          >
            <b>API notice:</b> {apiError}
          </div>
        )}

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

        <div style={{ marginTop: "1.25rem", border: "1px solid #eee", borderRadius: 14, padding: "1.25rem" }}>
          <div style={{ display: "grid", gap: "0.8rem" }}>
            <label>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Display name</div>
              <input
                value={form.display_name}
                onChange={(e) => onChange("display_name", e.target.value)}
                style={{ width: "100%", padding: "0.7rem", borderRadius: 10, border: "1px solid #ccc" }}
                placeholder="e.g., NubianGrace"
              />
            </label>

            <label>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Age</div>
              <input
                value={form.age}
                onChange={(e) => onChange("age", e.target.value)}
                style={{ width: "100%", padding: "0.7rem", borderRadius: 10, border: "1px solid #ccc" }}
                placeholder="e.g., 31"
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
              <label>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>City</div>
                <input
                  value={form.city}
                  onChange={(e) => onChange("city", e.target.value)}
                  style={{ width: "100%", padding: "0.7rem", borderRadius: 10, border: "1px solid #ccc" }}
                  placeholder="e.g., Atlanta"
                />
              </label>

              <label>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>State</div>
                <input
                  value={form.state_us}
                  onChange={(e) => onChange("state_us", e.target.value)}
                  style={{ width: "100%", padding: "0.7rem", borderRadius: 10, border: "1px solid #ccc" }}
                  placeholder="e.g., GA"
                />
              </label>
            </div>

            <label>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Photo URL (optional)</div>
              <input
                value={form.photo}
                onChange={(e) => onChange("photo", e.target.value)}
                style={{ width: "100%", padding: "0.7rem", borderRadius: 10, border: "1px solid #ccc" }}
                placeholder="https://..."
              />
            </label>

            <label>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Identity preview (short)</div>
              <textarea
                value={form.identity_preview}
                onChange={(e) => onChange("identity_preview", e.target.value)}
                style={{ width: "100%", padding: "0.7rem", borderRadius: 10, border: "1px solid #ccc", minHeight: 90 }}
                placeholder="One sentence that captures who you are."
              />
            </label>

            <label>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Intention</div>
              <input
                value={form.intention}
                onChange={(e) => onChange("intention", e.target.value)}
                style={{ width: "100%", padding: "0.7rem", borderRadius: 10, border: "1px solid #ccc" }}
                placeholder="Dating with intention"
              />
            </label>

            <label>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Tags (comma-separated)</div>
              <input
                value={form.tags}
                onChange={(e) => onChange("tags", e.target.value)}
                style={{ width: "100%", padding: "0.7rem", borderRadius: 10, border: "1px solid #ccc" }}
                placeholder="Ubuntu, Sankofa, Kemetic Philosophy"
              />
            </label>

            <button
              onClick={onSave}
              disabled={saving}
              style={{
                marginTop: "0.5rem",
                padding: "0.85rem 1rem",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: "white",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
                fontWeight: 600,
              }}
            >
              {saving ? "Saving..." : "Save profile"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: "1.25rem", color: "#777", fontSize: "0.95rem" }}>
          Tip: open the site in an incognito window (or a different browser) to create a second user + second profile.
          Then Like each other and watch notifications show up.
        </div>
      </div>
    </main>
  );
}

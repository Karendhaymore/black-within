"use client";

import { useEffect, useMemo, useState } from "react";
import { getOrCreateUserId } from "../lib/user";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  "https://black-within-api.onrender.com";

type FormState = {
  display_name: string;
  age: string;
  city: string;
  state_us: string;
  photo: string;

  relationship_intent: string; // dropdown -> maps to API "intention"
  biggest_challenge: string;
  one_thing_to_know: string;
};

const RELATIONSHIP_INTENTS = [
  "Intentional partnership",
  "Marriage-minded",
  "Conscious companionship",
  "Community-first connection",
];

const CULTURAL_IDENTITY_OPTIONS = [
  "African-Centered - Lives and thinks from African worldviews",
  "Pan-African - Identifies with the global African family, regardless of nationality",
  "Ancestrally Rooted - Identity defined by lineage consciousness, not geography alone",
  "Culturally Sovereign - Rejects Western cultural authority",
  "Black (Conscious Use) - Uses “Black” intentionally as a political and cultural identity, not default",
  "African American - Retrieves cultural identity from the American experience.",
];

const SPIRITUAL_FRAMEWORK_OPTIONS = [
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
];

async function apiUpsertProfile(payload: any) {
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

function Chip({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        padding: "0.45rem 0.7rem",
        borderRadius: 999,
        border: "1px solid #ccc",
        background: selected ? "#111" : "white",
        color: selected ? "white" : "#111",
        cursor: "pointer",
        fontSize: "0.92rem",
      }}
    >
      {label}
    </button>
  );
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

    relationship_intent: "Intentional partnership",
    biggest_challenge: "",
    one_thing_to_know: "",
  });

  const [culturalSelected, setCulturalSelected] = useState<string[]>([]);
  const [spiritualSelected, setSpiritualSelected] = useState<string[]>([]);

  const selectedTags = useMemo(() => {
    // tags are used for filters in Discover
    return [...culturalSelected, ...spiritualSelected].slice(0, 25);
  }, [culturalSelected, spiritualSelected]);

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

  function toggleInList(
    value: string,
    list: string[],
    setList: (v: string[]) => void
  ) {
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  async function onSave() {
    if (!userId) return;

    if (!form.display_name.trim()) return showToast("Please add a display name.");
    const ageNum = parseInt(form.age || "0", 10);
    if (!ageNum || ageNum < 18) return showToast("Please enter a valid age (18+).");
    if (!form.city.trim()) return showToast("Please add your city.");
    if (!form.state_us.trim()) return showToast("Please add your state.");
    if (!form.relationship_intent.trim())
      return showToast("Please select a Relationship Intent.");

    // require at least 1 selection to keep the vibe aligned
    if (culturalSelected.length === 0)
      return showToast("Please select at least one Cultural Identity option.");
    if (spiritualSelected.length === 0)
      return showToast("Please select at least one Spiritual Framework option.");

    setSaving(true);
    setApiError(null);

    const identityPreviewPacked = [
      `Cultural Identity: ${culturalSelected.join(" • ")}`,
      `Spiritual Framework: ${spiritualSelected.join(" • ")}`,
      form.biggest_challenge.trim()
        ? `Biggest Dating Challenge: ${form.biggest_challenge.trim()}`
        : "",
      form.one_thing_to_know.trim()
        ? `One Thing You Need to Know About Me: ${form.one_thing_to_know.trim()}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      await apiUpsertProfile({
        owner_user_id: userId,
        displayName: form.display_name.trim(),
        age: ageNum,
        city: form.city.trim(),
        stateUS: form.state_us.trim(),
        photo: form.photo.trim() || null,

        intention: form.relationship_intent.trim(),
        identityPreview: identityPreviewPacked,

        tags: selectedTags,
        isAvailable: true,
      });

      showToast("Profile saved.");
    } catch (e: any) {
      setApiError(e?.message || "Could not save profile.");
      showToast("Save failed. See API notice.");
    } finally {
      setSaving(false);
    }
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
      <div style={{ width: "100%", maxWidth: 980 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ fontSize: "2.2rem", marginBottom: "0.25rem" }}>My Profile</h1>
            <p style={{ color: "#555" }}>
              Build your real profile (stored in the database). This is what other users will browse.
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
          <div style={{ display: "grid", gap: "0.9rem" }}>
            <label>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Name (profile name can be different)</div>
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
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Relationship Intent</div>
              <select
                value={form.relationship_intent}
                onChange={(e) => onChange("relationship_intent", e.target.value)}
                style={{ width: "100%", padding: "0.7rem", borderRadius: 10, border: "1px solid #ccc" }}
              >
                {RELATIONSHIP_INTENTS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Cultural Identity (multi-select)</div>
              <div style={{ color: "#666", fontSize: "0.92rem", marginBottom: 10 }}>
                Choose what describes your cultural identity. You can select multiple.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {CULTURAL_IDENTITY_OPTIONS.map((label) => (
                  <Chip
                    key={label}
                    label={label}
                    selected={culturalSelected.includes(label)}
                    onToggle={() => toggleInList(label, culturalSelected, setCulturalSelected)}
                  />
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Spiritual Framework (multi-select)</div>
              <div style={{ color: "#666", fontSize: "0.92rem", marginBottom: 10 }}>
                Choose what guides your life and love. You can select multiple.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {SPIRITUAL_FRAMEWORK_OPTIONS.map((label) => (
                  <Chip
                    key={label}
                    label={label}
                    selected={spiritualSelected.includes(label)}
                    onToggle={() => toggleInList(label, spiritualSelected, setSpiritualSelected)}
                  />
                ))}
              </div>
            </div>

            <label>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                What has been your biggest dating challenge as a melanated person?
              </div>
              <textarea
                value={form.biggest_challenge}
                onChange={(e) => onChange("biggest_challenge", e.target.value)}
                style={{ width: "100%", padding: "0.7rem", borderRadius: 10, border: "1px solid #ccc", minHeight: 90 }}
                placeholder="Share what you’ve experienced (brief is fine)."
              />
            </label>

            <label>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>One thing you need to know about me is…</div>
              <textarea
                value={form.one_thing_to_know}
                onChange={(e) => onChange("one_thing_to_know", e.target.value)}
                style={{ width: "100%", padding: "0.7rem", borderRadius: 10, border: "1px solid #ccc", minHeight: 90 }}
                placeholder="Your truth. Your standard. Your vibe."
              />
            </label>

            <button
              onClick={onSave}
              disabled={saving}
              style={{
                marginTop: "0.4rem",
                padding: "0.85rem 1rem",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: "white",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
                fontWeight: 700,
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

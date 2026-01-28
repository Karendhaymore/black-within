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

  // short identity preview used in Discover cards
  identity_preview: string;

  // Relationship intent dropdown
  intention: string;

  // Multi-select sections
  cultural_identity: string[]; // Cultural Identity Statement (multi-select)
  spiritual_framework: string[]; // Spiritual Framework (multi-select)

  // Two open-ended questions
  q_dating_challenge: string;
  q_one_thing: string;

  // Optional free tags (comma separated)
  tags_freeform: string;
};

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

// ---------------------------
// Dropdown / Multi-select Options
// ---------------------------
const RELATIONSHIP_INTENT_OPTIONS = [
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

// US states dropdown (optional, but nice)
const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

function CheckboxPill({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        padding: "8px 10px",
        borderRadius: 999,
        border: "1px solid #ddd",
        background: checked ? "#f6fff6" : "white",
        boxShadow: checked ? "0 0 0 2px rgba(207,231,207,0.55) inset" : "none",
        cursor: "pointer",
        fontSize: 13,
        textAlign: "left",
      }}
      aria-pressed={checked}
    >
      {checked ? "✓ " : ""}{label}
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
    identity_preview: "",
    intention: RELATIONSHIP_INTENT_OPTIONS[0],
    cultural_identity: [],
    spiritual_framework: [],
    q_dating_challenge: "",
    q_one_thing: "",
    tags_freeform: "",
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

  function toggleFromList(key: "cultural_identity" | "spiritual_framework", value: string) {
    setForm((prev) => {
      const set = new Set(prev[key]);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...prev, [key]: Array.from(set) };
    });
  }

  const selectedCount = useMemo(() => {
    return form.cultural_identity.length + form.spiritual_framework.length;
  }, [form.cultural_identity.length, form.spiritual_framework.length]);

  function buildTagsList(): string[] {
    const tags: string[] = [];

    // freeform tags (comma separated)
    const free = (form.tags_freeform || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    // Cultural identity
    const ci = (form.cultural_identity || []).map((x) => `CI: ${x}`);

    // Spiritual framework
    const sf = (form.spiritual_framework || []).map((x) => `SF: ${x}`);

    // Store Qs in tags so we don't need DB migrations
    const q1 = (form.q_dating_challenge || "").trim();
    const q2 = (form.q_one_thing || "").trim();

    if (q1) tags.push(`Q: Biggest dating challenge (melanated) = ${q1}`);
    if (q2) tags.push(`Q: One thing you need to know about me = ${q2}`);

    // Merge and de-dupe (keep it reasonable)
    const merged = [...tags, ...ci, ...sf, ...free];
    const deduped = Array.from(new Set(merged)).slice(0, 25); // your backend caps to 25
    return deduped;
  }

  async function onSave() {
    if (!userId) return;

    // Validation
    if (!form.display_name.trim()) return showToast("Please add a display name.");
    const ageNum = parseInt(form.age || "0", 10);
    if (!ageNum || ageNum < 18) return showToast("Please enter a valid age (18+).");
    if (!form.city.trim()) return showToast("Please add your city.");
    if (!form.state_us.trim()) return showToast("Please add your state.");
    if (!form.identity_preview.trim())
      return showToast("Please add your short identity preview.");

    if (!form.intention.trim()) return showToast("Please choose your relationship intent.");

    // You can require at least 1 selection if you want:
    // if (form.cultural_identity.length === 0) return showToast("Please select at least one Cultural Identity option.");
    // if (form.spiritual_framework.length === 0) return showToast("Please select at least one Spiritual Framework option.");

    const tagsList = buildTagsList();

    setSaving(true);
    setApiError(null);

    try {
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
      <div style={{ width: "100%", maxWidth: 900 }}>
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
                background: "white",
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
                height: "fit-content",
                background: "white",
              }}
            >
              Notifications
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
              whiteSpace: "pre-wrap",
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

        <div
          style={{
            marginTop: "1.25rem",
            border: "1px solid #eee",
            borderRadius: 14,
            padding: "1.25rem",
          }}
        >
          <div style={{ display: "grid", gap: "0.9rem" }}>
            {/* Display name */}
            <label>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Profile name</div>
              <input
                value={form.display_name}
                onChange={(e) => onChange("display_name", e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.7rem",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                }}
                placeholder="e.g., NubianGrace"
              />
              <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                This can be different from your legal name.
              </div>
            </label>

            {/* Age */}
            <label>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Age</div>
              <input
                value={form.age}
                onChange={(e) => onChange("age", e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.7rem",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                }}
                placeholder="e.g., 31"
                inputMode="numeric"
              />
            </label>

            {/* Location */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
              <label>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>City</div>
                <input
                  value={form.city}
                  onChange={(e) => onChange("city", e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.7rem",
                    borderRadius: 10,
                    border: "1px solid #ccc",
                  }}
                  placeholder="e.g., Atlanta"
                />
              </label>

              <label>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>State</div>
                <select
                  value={form.state_us}
                  onChange={(e) => onChange("state_us", e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.7rem",
                    borderRadius: 10,
                    border: "1px solid #ccc",
                    background: "white",
                  }}
                >
                  <option value="">Select…</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Photo */}
            <label>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Photo URL (optional)</div>
              <input
                value={form.photo}
                onChange={(e) => onChange("photo", e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.7rem",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                }}
                placeholder="https://..."
              />
              <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                MVP note: for now, paste an image URL. Later we’ll add uploads.
              </div>
            </label>

            {/* Identity preview */}
            <label>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                Identity statement (short)
              </div>
              <textarea
                value={form.identity_preview}
                onChange={(e) => onChange("identity_preview", e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.7rem",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  minHeight: 90,
                }}
                placeholder="One sentence that captures who you are."
              />
              <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                This shows in Discover.
              </div>
            </label>

            {/* Intention dropdown */}
            <label>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Relationship intent</div>
              <select
                value={form.intention}
                onChange={(e) => onChange("intention", e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.7rem",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  background: "white",
                }}
              >
                {RELATIONSHIP_INTENT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>

            {/* Cultural identity multi-select */}
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                Cultural Identity Statement (multi-select)
              </div>
              <div style={{ color: "#666", fontSize: 13, marginBottom: 10 }}>
                Choose what fits you. You can select multiple.
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {CULTURAL_IDENTITY_OPTIONS.map((opt) => (
                  <CheckboxPill
                    key={opt}
                    label={opt}
                    checked={form.cultural_identity.includes(opt)}
                    onToggle={() => toggleFromList("cultural_identity", opt)}
                  />
                ))}
              </div>
            </div>

            {/* Spiritual framework multi-select */}
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                Spiritual Framework (multi-select)
              </div>
              <div style={{ color: "#666", fontSize: 13, marginBottom: 10 }}>
                Choose what guides your life and love. You can select multiple.
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {SPIRITUAL_FRAMEWORK_OPTIONS.map((opt) => (
                  <CheckboxPill
                    key={opt}
                    label={opt}
                    checked={form.spiritual_framework.includes(opt)}
                    onToggle={() => toggleFromList("spiritual_framework", opt)}
                  />
                ))}
              </div>
            </div>

            {/* Qs */}
            <label>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                What has been your biggest dating challenge as a melanated person?
              </div>
              <textarea
                value={form.q_dating_challenge}
                onChange={(e) => onChange("q_dating_challenge", e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.7rem",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  minHeight: 90,
                }}
                placeholder="Share what you’ve experienced (brief is fine)."
              />
            </label>

            <label>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                One thing you need to know about me is…
              </div>
              <textarea
                value={form.q_one_thing}
                onChange={(e) => onChange("q_one_thing", e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.7rem",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  minHeight: 90,
                }}
                placeholder="Your truth. Your standard. Your vibe."
              />
            </label>

            {/* Free tags */}
            <label>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                Extra tags (optional, comma-separated)
              </div>
              <input
                value={form.tags_freeform}
                onChange={(e) => onChange("tags_freeform", e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.7rem",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                }}
                placeholder="Ubuntu, Sankofa, Kemetic Philosophy"
              />
              <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                Tip: your selections above are already stored automatically.
              </div>
            </label>

            <div style={{ marginTop: 2, color: "#777", fontSize: 12 }}>
              Selected: {selectedCount} total (Cultural + Spiritual)
            </div>

            {/* Save */}
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

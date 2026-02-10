"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";


const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

type ProfileItem = {
  id: string;
  owner_user_id: string;

  displayName: string;
  age: number;
  city: string;
  stateUS: string;
  photo?: string | null;

  identityPreview: string;
  intention: string;
  tags: string[];
  isAvailable: boolean;

  culturalIdentity?: string[];
  spiritualFramework?: string[];
  relationshipIntent?: string | null;
  datingChallenge?: string | null;
  personalTruth?: string | null;
};

type ProfilesResponse = { items: ProfileItem[] };

type FormState = {
  displayName: string;
  age: string;
  city: string;
  stateUS: string;
  photo: string;

  relationshipIntent: string;
  datingChallenge: string;
  personalTruth: string;

  isAvailable: boolean;
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

function getLoggedInUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const uid = window.localStorage.getItem("bw_user_id");
    const loggedIn = window.localStorage.getItem("bw_logged_in") === "1";
    if (!loggedIn) return null;
    return uid && uid.trim() ? uid.trim() : null;
  } catch {
    return null;
  }
}

async function safeReadErrorDetail(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data?.detail) return String(data.detail);
  } catch {}
  try {
    const text = await res.text();
    if (text) return text;
  } catch {}
  return `Request failed (${res.status}).`;
}

async function apiListProfiles(excludeOwnerUserId?: string): Promise<ProfileItem[]> {
  const url =
    `${API_BASE}/profiles?limit=200` +
    (excludeOwnerUserId
      ? `&exclude_owner_user_id=${encodeURIComponent(excludeOwnerUserId)}`
      : "");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(await safeReadErrorDetail(res));
  const json = (await res.json()) as ProfilesResponse;
  return Array.isArray(json?.items) ? json.items : [];
}

async function apiUpsertProfile(payload: any) {
  const res = await fetch(`${API_BASE}/profiles/upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const msg = await safeReadErrorDetail(res);
    throw new Error(msg || "Failed to save profile.");
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
        textAlign: "left",
      }}
    >
      {label}
    </button>
  );
}

function buildIdentityPreview(args: {
  cultural: string[];
  spiritual: string[];
  datingChallenge: string;
  personalTruth: string;
}) {
  const parts = [
    args.cultural.length ? `Cultural Identity: ${args.cultural.join(" • ")}` : "",
    args.spiritual.length ? `Spiritual Framework: ${args.spiritual.join(" • ")}` : "",
    args.datingChallenge.trim() ? `Biggest Dating Challenge: ${args.datingChallenge.trim()}` : "",
    args.personalTruth.trim() ? `One Thing You Need to Know About Me: ${args.personalTruth.trim()}` : "",
  ].filter(Boolean);

  return parts.join("\n\n");
}

function MyProfilePageInner() {
  const [userId, setUserId] = useState<string>("");
  const sp = useSearchParams();
  const reason = sp.get("reason") || "";
 
  const [loadingExisting, setLoadingExisting] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    displayName: "",
    age: "",
    city: "",
    stateUS: "",
    photo: "",

    relationshipIntent: "Intentional partnership",
    datingChallenge: "",
    personalTruth: "",

    isAvailable: true,
  });

  const [culturalSelected, setCulturalSelected] = useState<string[]>([]);
  const [spiritualSelected, setSpiritualSelected] = useState<string[]>([]);

  const selectedTags = useMemo(() => {
    // Tags are used for filters in Discover. Keep them short and recognizable.
    // We'll store the user's chosen identity/spiritual items as tags (up to 25).
    const combined = [...culturalSelected, ...spiritualSelected]
      .map((x) => x.trim())
      .filter(Boolean);

    // Remove duplicates while preserving order
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const t of combined) {
      if (!seen.has(t)) {
        seen.add(t);
        deduped.push(t);
      }
    }
    return deduped.slice(0, 25);
  }, [culturalSelected, spiritualSelected]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  }

  function onChange<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleInList(value: string, list: string[], setList: (v: string[]) => void) {
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  // ✅ Auth guard (same pattern as Discover)
  useEffect(() => {
    const uid = getLoggedInUserId();
    if (!uid) {
      window.location.href = "/auth";
      return;
    }
    setUserId(uid);
  }, []);

  // ✅ Load existing profile (if it exists)
  useEffect(() => {
    if (!userId) return;

    (async () => {
      setLoadingExisting(true);
      setApiError(null);
      try {
        // Since /profiles excludes owner when you pass exclude_owner_user_id,
        // we DO NOT pass that here. We'll just fetch the list and find ours.
        const all = await apiListProfiles();
        const mine = all.find((p) => p.owner_user_id === userId);

        if (mine) {
          setForm({
            displayName: mine.displayName || "",
            age: String(mine.age || ""),
            city: mine.city || "",
            stateUS: mine.stateUS || "",
            photo: (mine.photo as string) || "",

            relationshipIntent: mine.relationshipIntent || mine.intention || "Intentional partnership",
            datingChallenge: mine.datingChallenge || "",
            personalTruth: mine.personalTruth || "",

            isAvailable: typeof mine.isAvailable === "boolean" ? mine.isAvailable : true,
          });

          setCulturalSelected(Array.isArray(mine.culturalIdentity) ? mine.culturalIdentity : []);
          setSpiritualSelected(Array.isArray(mine.spiritualFramework) ? mine.spiritualFramework : []);
        }
      } catch (e: any) {
        setApiError(e?.message || "Could not load your profile.");
      } finally {
        setLoadingExisting(false);
      }
    })();
  }, [userId]);

  async function onSave() {
    if (!userId) return;

    if (!form.displayName.trim()) return showToast("Please add a display name.");
    const ageNum = parseInt(form.age || "0", 10);
    if (!ageNum || ageNum < 18) return showToast("Please enter a valid age (18+).");
    if (!form.city.trim()) return showToast("Please add your city.");
    if (!form.stateUS.trim()) return showToast("Please add your state.");
    if (!form.relationshipIntent.trim()) return showToast("Please select a Relationship Intent.");

    // You wanted at least 1 selection to keep the vibe aligned
    if (culturalSelected.length === 0)
      return showToast("Please select at least one Cultural Identity option.");
    if (spiritualSelected.length === 0)
      return showToast("Please select at least one Spiritual Framework option.");

    setSaving(true);
    setApiError(null);

    const identityPreview = buildIdentityPreview({
      cultural: culturalSelected,
      spiritual: spiritualSelected,
      datingChallenge: form.datingChallenge,
      personalTruth: form.personalTruth,
    });

    try {
      await apiUpsertProfile({
        owner_user_id: userId,

        displayName: form.displayName.trim(),
        age: ageNum,
        city: form.city.trim(),
        stateUS: form.stateUS.trim(),
        photo: form.photo.trim() || null,

        // keep existing Discover usage
        intention: form.relationshipIntent.trim(),
        identityPreview,

        // NEW richer fields your backend supports
        culturalIdentity: culturalSelected,
        spiritualFramework: spiritualSelected,
        relationshipIntent: form.relationshipIntent.trim(),
        datingChallenge: form.datingChallenge.trim() || null,
        personalTruth: form.personalTruth.trim() || null,

        tags: selectedTags,
        isAvailable: !!form.isAvailable,
      });

      showToast("Profile saved.");
    } catch (e: any) {
      setApiError(e?.message || "Could not save profile.");
      showToast("Save failed. See API notice.");
    } finally {
      setSaving(false);
    }
  }

  const sectionStyle: React.CSSProperties = {
    marginTop: "1.25rem",
    border: "1px solid #eee",
    borderRadius: 14,
    padding: "1.25rem",
    background: "white",
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "2rem",
        display: "grid",
        placeItems: "start center",
        background: "#fff",
      }}
    >
      <div style={{ width: "100%", maxWidth: 980 }}>
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
            <h1 style={{ fontSize: "2.2rem", marginBottom: "0.25rem" }}>My Profile</h1>
            <p style={{ color: "#555", marginTop: 0 }}>
              This is your real profile stored in the database — what other users browse in Discover.
            </p>

            <div style={{ marginTop: "0.75rem", color: "#777", fontSize: "0.92rem" }}>
              Your user id: <code>{userId || "..."}</code>
              {loadingExisting ? (
                <span style={{ marginLeft: 10 }}>(loading your profile…)</span>
              ) : null}
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <Link
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
            </Link>

            <Link
              href="/saved"
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
              Saved
            </Link>

            <Link
              href="/liked"
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
              Liked
            </Link>

            <Link
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
            </Link>
          </div>
        </div>
        {reason === "photo_required" ? (
          <div
            style={{
              marginTop: "0.9rem",
              padding: "0.95rem",
              borderRadius: 14,
              border: "1px solid #ffe0b2",
              background: "#fff8ee",
              color: "#5a3b00",
              display: "flex",
              gap: 12,
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontWeight: 800 }}>
              Upload a profile photo to message members
            </div>

            <a
              href="#photo"
              style={{
                padding: "0.65rem 0.95rem",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.15)",
                background: "white",
                textDecoration: "none",
                color: "inherit",
                fontWeight: 800,
              }}
            >
              Add photo now
            </a>
          </div>
        ) : null}

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

        <div style={sectionStyle}>
          <div style={{ display: "grid", gap: "0.9rem" }}>
            <label>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Name (profile name can be different)</div>
              <input
                value={form.displayName}
                onChange={(e) => onChange("displayName", e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.7rem",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                }}
                placeholder="e.g., NubianGrace"
                disabled={loadingExisting}
              />
            </label>

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
                disabled={loadingExisting}
              />
            </label>

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
                  disabled={loadingExisting}
                />
              </label>

              <label>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>State</div>
                <input
                  value={form.stateUS}
                  onChange={(e) => onChange("stateUS", e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.7rem",
                    borderRadius: 10,
                    border: "1px solid #ccc",
                  }}
                  placeholder="e.g., GA"
                  disabled={loadingExisting}
                />
              </label>
            </div>

           <label>
  <div style={{ fontWeight: 600, marginBottom: 6 }}>Profile Photo</div>

  {form.photo && (
    <img
      src={form.photo}
      alt="Profile"
      style={{
        width: 120,
        height: 120,
        objectFit: "cover",
        borderRadius: 12,
        marginBottom: 10,
        border: "1px solid #ddd",
      }}
    />
  )}

  <input
    type="file"
    accept="image/*"
    onChange={async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const fd = new FormData();
      fd.append("file", file);

      try {
        const res = await fetch(`${API_BASE}/upload/photo`, {
          method: "POST",
          body: fd,
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Upload failed");

        onChange("photo", data.url);
      } catch (err) {
        alert("Upload failed");
      }
    }}
  />
</label>


            <label>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Relationship Intent</div>
              <select
                value={form.relationshipIntent}
                onChange={(e) => onChange("relationshipIntent", e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.7rem",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                }}
                disabled={loadingExisting}
              >
                {RELATIONSHIP_INTENTS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={form.isAvailable}
                onChange={(e) => onChange("isAvailable", e.target.checked)}
                disabled={loadingExisting}
              />
              <span style={{ fontWeight: 600 }}>Visible in Discover</span>
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
                value={form.datingChallenge}
                onChange={(e) => onChange("datingChallenge", e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.7rem",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  minHeight: 90,
                }}
                placeholder="Share what you’ve experienced (brief is fine)."
                disabled={loadingExisting}
              />
            </label>

            <label>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>One thing you need to know about me is…</div>
              <textarea
                value={form.personalTruth}
                onChange={(e) => onChange("personalTruth", e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.7rem",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  minHeight: 90,
                }}
                placeholder="Your truth. Your standard. Your vibe."
                disabled={loadingExisting}
              />
            </label>

            <button
              onClick={onSave}
              disabled={saving || loadingExisting}
              style={{
                marginTop: "0.4rem",
                padding: "0.85rem 1rem",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: "white",
                cursor: saving || loadingExisting ? "not-allowed" : "pointer",
                opacity: saving || loadingExisting ? 0.7 : 1,
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
export default function MyProfilePage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
      <MyProfilePageInner />
    </Suspense>
  );
}

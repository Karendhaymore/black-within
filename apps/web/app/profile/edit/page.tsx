"use client";

import { useEffect, useMemo, useState } from "react";

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

const INTENTIONS = [
  "Intentional partnership",
  "Marriage-minded",
  "Conscious companionship",
  "Community-first connection",
  "Open to evolving alignment",
];

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export default function EditProfilePage() {
  // Public profile info
  const [displayName, setDisplayName] = useState("");
  const [age, setAge] = useState<string>("");
  const [city, setCity] = useState("");
  const [stateUS, setStateUS] = useState("");
  const [intention, setIntention] = useState<string>("");

  // Photos (MVP: links)
  const [photo1, setPhoto1] = useState("");
  const [photo2, setPhoto2] = useState("");
  const [photo3, setPhoto3] = useState("");

  // Identity prompts
  const [defineBlackness, setDefineBlackness] = useState("");
  const [lineageRole, setLineageRole] = useState("");
  const [consciousPartnership, setConsciousPartnership] = useState("");

  // Alignment tags + optional note
  const [tags, setTags] = useState<string[]>([]);
  const [pathNote, setPathNote] = useState("");

  // Private sections
  const [pb1, setPb1] = useState("");
  const [pb2, setPb2] = useState("");
  const [pb3, setPb3] = useState("");

  const [va1, setVa1] = useState("");
  const [va2, setVa2] = useState("");
  const [va3, setVa3] = useState("");

  // UI feedback
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Load on mount
  useEffect(() => {
    // Account (displayName + email)
    const account = safeParse<{ displayName?: string; email?: string; is18?: boolean }>(
      localStorage.getItem("bw_account")
    );
    if (account?.displayName) setDisplayName(account.displayName);

    // Identity
    const ident = safeParse<{
      defineBlackness?: string;
      lineageRole?: string;
      consciousPartnership?: string;
    }>(localStorage.getItem("bw_identity"));

    if (ident?.defineBlackness) setDefineBlackness(ident.defineBlackness);
    if (ident?.lineageRole) setLineageRole(ident.lineageRole);
    if (ident?.consciousPartnership) setConsciousPartnership(ident.consciousPartnership);

    // Intention
    const inten = safeParse<{ intention?: string }>(localStorage.getItem("bw_intention"));
    if (inten?.intention) setIntention(inten.intention);

    // Alignment tags + note
    const align = safeParse<{ tags?: string[]; note?: string | null }>(localStorage.getItem("bw_alignment"));
    if (align?.tags?.length) setTags(align.tags);
    if (align?.note) setPathNote(align.note);

    // Photos
    const photos = safeParse<{ photos?: string[] }>(localStorage.getItem("bw_photos"));
    if (photos?.photos?.length) {
      setPhoto1(photos.photos[0] || "");
      setPhoto2(photos.photos[1] || "");
      setPhoto3(photos.photos[2] || "");
    }

    // Public profile extra fields (if already saved before)
    const pub = safeParse<{
      age?: string;
      city?: string;
      stateUS?: string;
    }>(localStorage.getItem("bw_public_profile"));

    if (pub?.age) setAge(pub.age);
    if (pub?.city) setCity(pub.city);
    if (pub?.stateUS) setStateUS(pub.stateUS);

    // Private sections
    const priv = safeParse<{
      personalBoundaries?: { pb1?: string; pb2?: string; pb3?: string };
      visionAlignment?: { va1?: string; va2?: string; va3?: string };
    }>(localStorage.getItem("bw_private_profile"));

    if (priv?.personalBoundaries?.pb1) setPb1(priv.personalBoundaries.pb1);
    if (priv?.personalBoundaries?.pb2) setPb2(priv.personalBoundaries.pb2);
    if (priv?.personalBoundaries?.pb3) setPb3(priv.personalBoundaries.pb3);

    if (priv?.visionAlignment?.va1) setVa1(priv.visionAlignment.va1);
    if (priv?.visionAlignment?.va2) setVa2(priv.visionAlignment.va2);
    if (priv?.visionAlignment?.va3) setVa3(priv.visionAlignment.va3);
  }, []);

  const isPreferNot = useMemo(() => tags.includes("Prefer not to say"), [tags]);

  function toggleTag(tag: string) {
    if (tag === "Prefer not to say") {
      setTags((prev) => (prev.includes(tag) ? [] : [tag]));
      return;
    }

    setTags((prev) => {
      const withoutPreferNot = prev.filter((t) => t !== "Prefer not to say");
      if (withoutPreferNot.includes(tag)) return withoutPreferNot.filter((t) => t !== tag);
      return [...withoutPreferNot, tag];
    });
  }

  function saveAll() {
    setSavedMsg(null);

    // Save display name into account object
    const existingAccount = safeParse<{ displayName?: string; email?: string; is18?: boolean }>(
      localStorage.getItem("bw_account")
    ) || { is18: true };

    localStorage.setItem(
      "bw_account",
      JSON.stringify({
        ...existingAccount,
        displayName: displayName.trim(),
      })
    );

    // Save identity prompts
    localStorage.setItem(
      "bw_identity",
      JSON.stringify({
        defineBlackness: defineBlackness.trim(),
        lineageRole: lineageRole.trim(),
        consciousPartnership: consciousPartnership.trim(),
      })
    );

    // Save intention
    localStorage.setItem("bw_intention", JSON.stringify({ intention }));

    // Save alignment
    localStorage.setItem("bw_alignment", JSON.stringify({ tags, note: pathNote.trim() || null }));

    // Save photos
    const photoList = [photo1.trim(), photo2.trim(), photo3.trim()].filter(Boolean);
    localStorage.setItem("bw_photos", JSON.stringify({ photos: photoList }));

    // Save public profile fields
    localStorage.setItem(
      "bw_public_profile",
      JSON.stringify({
        age: age.trim(),
        city: city.trim(),
        stateUS: stateUS.trim(),
      })
    );

    // Save private sections
    localStorage.setItem(
      "bw_private_profile",
      JSON.stringify({
        personalBoundaries: {
          pb1: pb1.trim(),
          pb2: pb2.trim(),
          pb3: pb3.trim(),
        },
        visionAlignment: {
          va1: va1.trim(),
          va2: va2.trim(),
          va3: va3.trim(),
        },
      })
    );

    setSavedMsg("Your reflections have been saved.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main style={{ minHeight: "100vh", padding: "2rem", display: "grid", placeItems: "start center" }}>
      <div style={{ width: "100%", maxWidth: 900 }}>
        <h1 style={{ fontSize: "2.1rem", marginBottom: "0.25rem" }}>Edit My Profile</h1>
        <p style={{ color: "#555", marginBottom: "1.25rem" }}>
          Move at your pace. This space honors depth, safety, and alignment.
        </p>

        {savedMsg && (
          <div style={{ padding: "0.9rem", borderRadius: 10, border: "1px solid #cfe7cf", background: "#f6fff6" }}>
            {savedMsg}
          </div>
        )}

        {/* SECTION 1: Public Profile Info */}
        <section style={{ marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1px solid #eee" }}>
          <h2 style={{ fontSize: "1.4rem", marginBottom: "0.25rem" }}>Public Profile Info</h2>
          <p style={{ color: "#666", marginBottom: "1rem" }}>This is visible to other users.</p>

          <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>Display Name</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                style={{ padding: "0.7rem", borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>

            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>Age</span>
              <input
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="e.g., 34"
                style={{ padding: "0.7rem", borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>

            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>City</span>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g., Oakland"
                style={{ padding: "0.7rem", borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>

            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>State</span>
              <input
                value={stateUS}
                onChange={(e) => setStateUS(e.target.value)}
                placeholder="e.g., CA"
                style={{ padding: "0.7rem", borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>

            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>Relationship Intention</span>
              <select
                value={intention}
                onChange={(e) => setIntention(e.target.value)}
                style={{ padding: "0.7rem", borderRadius: 8, border: "1px solid #ccc" }}
              >
                <option value="">Select one</option>
                {INTENTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {/* SECTION 1B: Photos */}
        <section style={{ marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1px solid #eee" }}>
          <h2 style={{ fontSize: "1.4rem", marginBottom: "0.25rem" }}>Photos</h2>
          <p style={{ color: "#666", marginBottom: "1rem" }}>
            Temporary MVP: paste image links. We’ll replace this with real uploads later.
          </p>

          <div style={{ display: "grid", gap: "1rem" }}>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>Photo 1 link</span>
              <input
                value={photo1}
                onChange={(e) => setPhoto1(e.target.value)}
                placeholder="https://..."
                style={{ padding: "0.7rem", borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>

            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>Photo 2 link</span>
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
          </div>
        </section>

        {/* SECTION 2: Identity & Lineage */}
        <section style={{ marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1px solid #eee" }}>
          <h2 style={{ fontSize: "1.4rem", marginBottom: "0.25rem" }}>Identity &amp; Lineage</h2>
          <p style={{ color: "#666", marginBottom: "1rem" }}>These responses appear on your profile.</p>

          <div style={{ display: "grid", gap: "1rem" }}>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>How do you define Blackness for yourself?</span>
              <textarea
                value={defineBlackness}
                onChange={(e) => setDefineBlackness(e.target.value)}
                rows={4}
                style={{ padding: "0.8rem", borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>

            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>What role does ancestry or lineage play in your life?</span>
              <textarea
                value={lineageRole}
                onChange={(e) => setLineageRole(e.target.value)}
                rows={4}
                style={{ padding: "0.8rem", borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>

            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>What does conscious partnership mean to you?</span>
              <textarea
                value={consciousPartnership}
                onChange={(e) => setConsciousPartnership(e.target.value)}
                rows={4}
                style={{ padding: "0.8rem", borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>
          </div>
        </section>

        {/* SECTION 3: Cultural & Spiritual Grounding */}
        <section style={{ marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1px solid #eee" }}>
          <h2 style={{ fontSize: "1.4rem", marginBottom: "0.25rem" }}>Cultural &amp; Spiritual Grounding</h2>
          <p style={{ color: "#666", marginBottom: "1rem" }}>
            Select your spiritual identity and the traditions that guide how you move through the world.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "0.6rem",
              marginBottom: "1rem",
            }}
          >
            {TAGS.map((tag) => {
              const active = tags.includes(tag);
              const disabled = isPreferNot && tag !== "Prefer not to say";
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
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
        </section>

        {/* SECTION 4: Personal Boundaries (Private) */}
        <section style={{ marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1px solid #eee" }}>
          <h2 style={{ fontSize: "1.4rem", marginBottom: "0.25rem" }}>Personal Boundaries (Private)</h2>
          <p style={{ color: "#666", marginBottom: "1rem" }}>
            Visible only to you unless there is mutual alignment and shared access.
          </p>

          <div style={{ display: "grid", gap: "1rem" }}>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>A relationship I am not willing to repeat is…</span>
              <textarea
                value={pb1}
                onChange={(e) => setPb1(e.target.value)}
                rows={3}
                style={{ padding: "0.8rem", borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>

            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>A value or behavior I cannot compromise on is…</span>
              <textarea
                value={pb2}
                onChange={(e) => setPb2(e.target.value)}
                rows={3}
                style={{ padding: "0.8rem", borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>

            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>I feel safest in connection when…</span>
              <textarea
                value={pb3}
                onChange={(e) => setPb3(e.target.value)}
                rows={3}
                style={{ padding: "0.8rem", borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>
          </div>
        </section>

        {/* SECTION 5: Vision of Alignment (Private) */}
        <section style={{ marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1px solid #eee" }}>
          <h2 style={{ fontSize: "1.4rem", marginBottom: "0.25rem" }}>Vision of Alignment (Private)</h2>
          <p style={{ color: "#666", marginBottom: "1rem" }}>
            Visible only through mutual alignment and shared access.
          </p>

          <div style={{ display: "grid", gap: "1rem" }}>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>My ideal partner moves through the world with…</span>
              <textarea
                value={va1}
                onChange={(e) => setVa1(e.target.value)}
                rows={3}
                style={{ padding: "0.8rem", borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>

            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>I feel most aligned with someone who…</span>
              <textarea
                value={va2}
                onChange={(e) => setVa2(e.target.value)}
                rows={3}
                style={{ padding: "0.8rem", borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>

            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>The partnership I am cultivating is…</span>
              <textarea
                value={va3}
                onChange={(e) => setVa3(e.target.value)}
                rows={3}
                style={{ padding: "0.8rem", borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>
          </div>
        </section>

        {/* SAVE BUTTON */}
        <div style={{ marginTop: "2rem", paddingTop: "1.25rem", borderTop: "1px solid #eee" }}>
          <button
            type="button"
            onClick={saveAll}
            style={{
              padding: "0.9rem 1.2rem",
              borderRadius: 10,
              border: "1px solid #ccc",
              cursor: "pointer",
              width: "100%",
              maxWidth: 320,
            }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </main>
  );
}

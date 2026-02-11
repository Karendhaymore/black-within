"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

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
  photo2?: string | null;

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
  photo2: string;

  relationshipIntent: string;
  datingChallenge: string;
  personalTruth: string;

  isAvailable: boolean;
};

type UploadPhotoResponse = {
  photoUrl?: string;
  url?: string;
  photo?: string;
  ok?: boolean;
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

async function apiListProfiles(
  excludeOwnerUserId?: string
): Promise<ProfileItem[]> {
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

// ✅ Fix #2: signature matches usage (userId + file)
async function apiUploadProfilePhoto(userId: string, file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);

  // (safe) send userId both ways in case your backend expects one or the other
  fd.append("user_id", userId);

  const res = await fetch(
    `${API_BASE}/upload/photo?user_id=${encodeURIComponent(userId)}`,
    { method: "POST", body: fd }
  );

  if (!res.ok) throw new Error(await safeReadErrorDetail(res));

  const json = (await res.json()) as UploadPhotoResponse;
  const url = (json.photoUrl || json.url || json.photo || "").trim();
  if (!url) throw new Error("Upload succeeded but no photo URL was returned.");
  return url;
}

// ✅ Delete photo API helper
async function apiDeleteProfilePhoto(userId: string, photoUrl: string): Promise<void> {
  const res = await fetch(`${API_BASE}/photos/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, photo_url: photoUrl }),
  });
  if (!res.ok) throw new Error(await safeReadErrorDetail(res));
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
    args.spiritual.length
      ? `Spiritual Framework: ${args.spiritual.join(" • ")}`
      : "",
    args.datingChallenge.trim()
      ? `Biggest Dating Challenge: ${args.datingChallenge.trim()}`
      : "",
    args.personalTruth.trim()
      ? `One Thing You Need to Know About Me: ${args.personalTruth.trim()}`
      : "",
  ].filter(Boolean);

  return parts.join("\n\n");
}

export default function MyProfilePage() {
  const [userId, setUserId] = useState<string>("");

  const [loadingExisting, setLoadingExisting] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // ✅ Photo upload state - Photo 1
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // ✅ Photo 2 upload state
  const fileInputRef2 = useRef<HTMLInputElement | null>(null);
  const [photoFile2, setPhotoFile2] = useState<File | null>(null);
  const [photoPreview2, setPhotoPreview2] = useState<string>("");

  const [form, setForm] = useState<FormState>({
    displayName: "",
    age: "",
    city: "",
    stateUS: "",
    photo: "",
    photo2: "",

    relationshipIntent: "Intentional partnership",
    datingChallenge: "",
    personalTruth: "",

    isAvailable: true,
  });

  const [culturalSelected, setCulturalSelected] = useState<string[]>([]);
  const [spiritualSelected, setSpiritualSelected] = useState<string[]>([]);

  const selectedTags = useMemo(() => {
    const combined = [...culturalSelected, ...spiritualSelected]
      .map((x) => x.trim())
      .filter(Boolean);

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

  function toggleInList(
    value: string,
    list: string[],
    setList: (v: string[]) => void
  ) {
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  // ✅ Auth guard
  useEffect(() => {
    const uid = getLoggedInUserId();
    if (!uid) {
      window.location.href = "/auth";
      return;
    }
    setUserId(uid);
  }, []);

  // ✅ Load existing profile
  useEffect(() => {
    if (!userId) return;

    (async () => {
      setLoadingExisting(true);
      setApiError(null);
      try {
        const all = await apiListProfiles();
        const mine = all.find((p) => p.owner_user_id === userId);

        if (mine) {
          setForm({
            displayName: mine.displayName || "",
            age: String(mine.age || ""),
            city: mine.city || "",
            stateUS: mine.stateUS || "",
            photo: (mine.photo as string) || "",
            photo2: (mine.photo2 as string) || "",

            relationshipIntent:
              mine.relationshipIntent || mine.intention || "Intentional partnership",
            datingChallenge: mine.datingChallenge || "",
            personalTruth: mine.personalTruth || "",

            isAvailable: typeof mine.isAvailable === "boolean" ? mine.isAvailable : true,
          });

          setCulturalSelected(Array.isArray(mine.culturalIdentity) ? mine.culturalIdentity : []);
          setSpiritualSelected(
            Array.isArray(mine.spiritualFramework) ? mine.spiritualFramework : []
          );

          // ✅ reset previews to stored photos when loading
          setPhotoPreview((mine.photo as string) || "");
          setPhotoPreview2((mine.photo2 as string) || "");
        }
      } catch (e: any) {
        setApiError(e?.message || "Could not load your profile.");
      } finally {
        setLoadingExisting(false);
      }
    })();
  }, [userId]);

  // ✅ buildUpsertPayload()
  function buildUpsertPayload(overrides?: Partial<{ photo: string; photo2: string }>) {
    const ageNum = parseInt(form.age || "0", 10) || 0;

    const identityPreview = buildIdentityPreview({
      cultural: culturalSelected,
      spiritual: spiritualSelected,
      datingChallenge: form.datingChallenge,
      personalTruth: form.personalTruth,
    });

    const photoValue = (overrides?.photo ?? form.photo).trim() || null;
    const photo2Value = (overrides?.photo2 ?? form.photo2).trim() || null;

    return {
      owner_user_id: userId,

      displayName: form.displayName.trim(),
      age: ageNum,
      city: form.city.trim(),
      stateUS: form.stateUS.trim(),

      photo: photoValue,
      photo2: photo2Value,

      intention: form.relationshipIntent.trim(),
      identityPreview,

      culturalIdentity: culturalSelected,
      spiritualFramework: spiritualSelected,
      relationshipIntent: form.relationshipIntent.trim(),
      datingChallenge: form.datingChallenge.trim() || null,
      personalTruth: form.personalTruth.trim() || null,

      tags: selectedTags,
      isAvailable: !!form.isAvailable,
    };
  }

  // ✅ onUploadPhoto()  (ONLY ONE - duplicates removed)
  async function onUploadPhoto(slot: 1 | 2) {
    if (!userId) return;

    const file = slot === 1 ? photoFile : photoFile2;
    if (!file) {
      showToast("Choose a photo first.");
      return;
    }

    if (!file.type.startsWith("image/")) {
      showToast("Please choose an image file (jpg/png/webp).");
      return;
    }

    setUploadingPhoto(true);
    setApiError(null);

    try {
      const url = await apiUploadProfilePhoto(userId, file);

      // Update the correct slot in state + preview + clear file input
      if (slot === 1) {
        setForm((p) => ({ ...p, photo: url }));
        // ✅ Fix #3: keep preview as string (not null)
        setPhotoPreview("");
        setPhotoFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } else {
        setForm((p) => ({ ...p, photo2: url }));
        // ✅ Fix #3: keep preview as string (not null)
        setPhotoPreview2("");
        setPhotoFile2(null);
        if (fileInputRef2.current) fileInputRef2.current.value = "";
      }

      // ✅ AUTO-SAVE immediately so it persists
      await apiUpsertProfile(buildUpsertPayload(slot === 1 ? { photo: url } : { photo2: url }));

      showToast(`Photo ${slot} uploaded & saved!`);
    } catch (e: any) {
      setApiError(e?.message || "Photo upload failed.");
      showToast("Upload failed.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  // ✅ Fix #4: Delete persists immediately
  async function onDeletePhoto(photoUrl: string, slot: 1 | 2) {
    if (!userId) return;
    if (!photoUrl) return;

    const ok = window.confirm("Delete this photo? You can upload a new one after.");
    if (!ok) return;

    setApiError(null);

    try {
      await apiDeleteProfilePhoto(userId, photoUrl);

      // Clear UI immediately + persist immediately
      if (slot === 1) {
        setForm((p) => ({ ...p, photo: "" }));
        setPhotoPreview("");
        setPhotoFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        await apiUpsertProfile(buildUpsertPayload({ photo: "" }));
      } else {
        setForm((p) => ({ ...p, photo2: "" }));
        setPhotoPreview2("");
        setPhotoFile2(null);
        if (fileInputRef2.current) fileInputRef2.current.value = "";
        await apiUpsertProfile(buildUpsertPayload({ photo2: "" }));
      }

      showToast("Photo deleted.");
    } catch (e: any) {
      setApiError(e?.message || "Could not delete photo.");
      showToast("Delete failed. See API notice.");
    }
  }

  async function onSave() {
    if (!userId) return;

    if (!form.displayName.trim()) return showToast("Please add a display name.");
    const ageNum = parseInt(form.age || "0", 10);
    if (!ageNum || ageNum < 18) return showToast("Please enter a valid age (18+).");
    if (!form.city.trim()) return showToast("Please add your city.");
    if (!form.stateUS.trim()) return showToast("Please add your state.");
    if (!form.relationshipIntent.trim()) return showToast("Please select a Relationship Intent.");

    if (culturalSelected.length === 0)
      return showToast("Please select at least one Cultural Identity option.");
    if (spiritualSelected.length === 0)
      return showToast("Please select at least one Spiritual Framework option.");

    setSaving(true);
    setApiError(null);

    try {
      await apiUpsertProfile(buildUpsertPayload());
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

  const bigPhotoStyle: React.CSSProperties = {
    width: "100%",
    height: 420,
    borderRadius: 16,
    border: "1px solid #e6e6e6",
    background: "#f4f4f4",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
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
            <h1 style={{ fontSize: "2.2rem", marginBottom: "0.25rem" }}>
              My Profile
            </h1>
            <p style={{ color: "#555", marginTop: 0 }}>
              This is your real profile stored in the database — what other users browse
              in Discover.
            </p>

            <div
              style={{
                marginTop: "0.75rem",
                color: "#777",
                fontSize: "0.92rem",
              }}
            >
              Your user id: <code>{userId || "..."}</code>
              {loadingExisting ? (
                <span style={{ marginLeft: 10 }}>(loading your profile…)</span>
              ) : null}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
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
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                Name (profile name can be different)
              </div>
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

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.8rem",
              }}
            >
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

            {/* ✅ Photo 1 block */}
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Profile Photo</div>

              <div style={bigPhotoStyle}>
                {photoPreview || form.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoPreview || form.photo}
                    alt="Profile photo"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      fontSize: 64,
                      fontWeight: 900,
                      color: "rgba(0,0,0,0.35)",
                    }}
                  >
                    {(form.displayName || "U").slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>

              {form.photo ? (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.photo}
                      alt="Photo 1"
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: 14,
                        objectFit: "cover",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => onDeletePhoto(form.photo, 1)}
                      disabled={loadingExisting || uploadingPhoto}
                      style={{
                        padding: "0.55rem 0.8rem",
                        borderRadius: 10,
                        border: "1px solid #ccc",
                        background: "white",
                        cursor:
                          loadingExisting || uploadingPhoto ? "not-allowed" : "pointer",
                        fontWeight: 700,
                        opacity: loadingExisting || uploadingPhoto ? 0.7 : 1,
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : null}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setPhotoFile(f);

                  if (f) {
                    const localUrl = URL.createObjectURL(f);
                    setPhotoPreview(localUrl);
                    showToast("Photo selected. Click Upload Photo.");
                  }
                }}
              />

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
                  marginTop: 10,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!photoFile) {
                      fileInputRef.current?.click();
                      return;
                    }
                    onUploadPhoto(1);
                  }}
                  disabled={loadingExisting || uploadingPhoto}
                  style={{
                    padding: "0.6rem 0.9rem",
                    borderRadius: 10,
                    border: "1px solid #111",
                    background: "#111",
                    color: "white",
                    cursor:
                      loadingExisting || uploadingPhoto ? "not-allowed" : "pointer",
                    fontWeight: 900,
                    opacity: loadingExisting || uploadingPhoto ? 0.7 : 1,
                  }}
                >
                  {uploadingPhoto ? "Uploading..." : photoFile ? "Upload Photo" : "Choose Photo"}
                </button>

                <div style={{ fontSize: 12, color: "#777" }}>
                  {photoFile ? (
                    <>
                      Selected: <b>{photoFile.name}</b> • Uploading will <b>auto-save</b>.
                    </>
                  ) : (
                    <>Click the button to choose a photo (jpg/png/webp).</>
                  )}
                </div>
              </div>

              {form.photo ? (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color: "#666",
                    wordBreak: "break-all",
                  }}
                >
                  Saved URL: {form.photo}
                </div>
              ) : null}
            </div>

            {/* ✅ Photo 2 block (optional) */}
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Photo 2 (optional)</div>

              <div style={bigPhotoStyle}>
                {photoPreview2 || form.photo2 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoPreview2 || form.photo2}
                    alt="Profile photo 2"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      fontSize: 48,
                      fontWeight: 900,
                      color: "rgba(0,0,0,0.25)",
                      textAlign: "center",
                      padding: 20,
                    }}
                  >
                    Optional second photo
                  </div>
                )}
              </div>

              {form.photo2 ? (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.photo2}
                      alt="Photo 2"
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: 14,
                        objectFit: "cover",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => onDeletePhoto(form.photo2, 2)}
                      disabled={loadingExisting || uploadingPhoto}
                      style={{
                        padding: "0.55rem 0.8rem",
                        borderRadius: 10,
                        border: "1px solid #ccc",
                        background: "white",
                        cursor:
                          loadingExisting || uploadingPhoto ? "not-allowed" : "pointer",
                        fontWeight: 700,
                        opacity: loadingExisting || uploadingPhoto ? 0.7 : 1,
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : null}

              <input
                ref={fileInputRef2}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setPhotoFile2(f);

                  if (f) {
                    const localUrl = URL.createObjectURL(f);
                    setPhotoPreview2(localUrl);
                    showToast("Photo 2 selected. Click Upload Photo 2.");
                  }
                }}
              />

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
                  marginTop: 10,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!photoFile2) {
                      fileInputRef2.current?.click();
                      return;
                    }
                    onUploadPhoto(2);
                  }}
                  disabled={loadingExisting || uploadingPhoto}
                  style={{
                    padding: "0.6rem 0.9rem",
                    borderRadius: 10,
                    border: "1px solid #111",
                    background: "#111",
                    color: "white",
                    cursor:
                      loadingExisting || uploadingPhoto ? "not-allowed" : "pointer",
                    fontWeight: 900,
                    opacity: loadingExisting || uploadingPhoto ? 0.7 : 1,
                  }}
                >
                  {uploadingPhoto
                    ? "Uploading..."
                    : photoFile2
                    ? "Upload Photo 2"
                    : "Choose Photo 2"}
                </button>

                <div style={{ fontSize: 12, color: "#777" }}>
                  {photoFile2 ? (
                    <>
                      Selected: <b>{photoFile2.name}</b> • Uploading will <b>auto-save</b>.
                    </>
                  ) : (
                    <>Click the button to choose a second photo (optional).</>
                  )}
                </div>
              </div>

              {form.photo2 ? (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color: "#666",
                    wordBreak: "break-all",
                  }}
                >
                  Saved URL: {form.photo2}
                </div>
              ) : null}
            </div>

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
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                Cultural Identity (multi-select)
              </div>
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
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                Spiritual Framework (multi-select)
              </div>
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
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                One thing you need to know about me is…
              </div>
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
          Tip: open the site in an incognito window (or a different browser) to create a
          second user + second profile. Then Like each other and watch notifications show
          up.
        </div>
      </div>
    </main>
  );
}

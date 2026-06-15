"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

type ProfileItem = {
  id: string;
  owner_user_id: string;
  
  mateQualities?: string | null;
  funActivities?: string | null;
  smokes?: string | null;
  drinks?: string | null;
  educationLevel?: string | null;
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
  gender?: string | null;
  lookingForGender?: string | null;
};

type ProfilesResponse = { items: ProfileItem[] };

type FormState = {
  displayName: string;
  age: string;
  city: string;
  stateUS: string;
  photo: string;
  photo2: string;
 
  mateQualities: string;
  funActivities: string;
  smokes: string;
  drinks: string;
  educationLevel: string;
  relationshipIntent: string;
  datingChallenge: string;
  personalTruth: string;
  gender: string;
  lookingForGender: string;
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
  "African American - Retrieves cultural identity from the American experience.",
  "African Diasporic",
  "African-Centered - Lives and thinks from African worldviews",
  "Ancestrally Rooted - Identity defined by lineage consciousness, not geography alone",
  "Black (Conscious Use) - Uses “Black” intentionally as a political and cultural identity, not default",
  "Culturally Sovereign - Rejects Western cultural authority",
  "Pan-African - Identifies with the global African family, regardless of nationality",
];

const SPIRITUAL_FRAMEWORK_OPTIONS = [
  "African-Centered Holistic Healing",
  "Afrocentric Spirituality",
  "Ancient African Philosophical Systems",
  "Ancestral Veneration Systems",
  "Astrologically Based",
  "Bible Based Christian",
  "Candomblé",
  "Dogon",
  "Hebrew Israelite",
  "Hoodoo / Rootwork",
  "Ifa / Orisha Traditions (Yoruba)",
  "Islam",
  "Kemetic Philosophy",
  "Liberated Christianity",
  "Metaphysical Science (African-centered variants)",
  "New Age Spirituality",
  "Obeah",
  "Pan African Spiritual Movements",
  "Quantum Spirituality",
  "Rastafari",
  "Sankofa",
  "Spiritual Science",
  "Ubuntu",
  "Vodun / Vodou",
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

async function apiGetMyProfile(userId: string): Promise<ProfileItem | null> {
  const all = await apiListProfiles();
  const mine = all.find((p) => p.owner_user_id === userId);
  return mine || null;
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

async function apiUploadProfilePhoto(userId: string, file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
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
        width: "100%",
        minHeight: 46,
        padding: "0.65rem 0.8rem",
        borderRadius: 12,
        border: "1px solid #ccc",
        background: selected ? "#111" : "white",
        color: selected ? "white" : "#111",
        cursor: "pointer",
        fontSize: "0.9rem",
        fontWeight: 700,
        lineHeight: 1.25,
        textAlign: "left",
        display: "flex",
        alignItems: "center",
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
  const router = useRouter();

  const [loadingExisting, setLoadingExisting] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // Photo 1 upload state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");

  // Photo 2 upload state
  const fileInputRef2 = useRef<HTMLInputElement | null>(null);
  const [photoFile2, setPhotoFile2] = useState<File | null>(null);
  const [photoPreview2, setPhotoPreview2] = useState<string>("");

  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [form, setForm] = useState<FormState>({
  displayName: "",
  age: "",
  city: "",
  stateUS: "",
  photo: "",
  photo2: "",

  gender: "",
  lookingForGender: "",

  relationshipIntent: "Intentional partnership",
  datingChallenge: "",
  personalTruth: "",
  mateQualities: "",
  funActivities: "",
  smokes: "",
  drinks: "",
  educationLevel: "",
    
  isAvailable: true,
});

  const [culturalSelected, setCulturalSelected] = useState<string[]>([]);
  const [spiritualSelected, setSpiritualSelected] = useState<string[]>([]);

  // Photo gallery state
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [draggingPhotoIndex, setDraggingPhotoIndex] = useState<number | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);

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

  useEffect(() => {
    const uid = getLoggedInUserId();
    if (!uid) {
      router.replace("/auth/login");
      return;
    }
    setUserId(uid);
  }, [router]);

  useEffect(() => {
    if (!userId) return;

    (async () => {
      setLoadingExisting(true);
      setApiError(null);
      try {
        const mine = await apiGetMyProfile(userId);

        if (mine) {
          setForm({
            displayName: mine.displayName || "",
            age: String(mine.age || ""),
            city: mine.city || "",
            stateUS: mine.stateUS || "",
            photo: (mine.photo as string) || "",
            photo2: (mine.photo2 as string) || "",

            gender: mine.gender || "",
            lookingForGender: mine.lookingForGender || "",
            
            relationshipIntent:
              mine.relationshipIntent || mine.intention || "Intentional partnership",
            datingChallenge: mine.datingChallenge || "",
            personalTruth: mine.personalTruth || "",
            mateQualities: mine.mateQualities || "",
            funActivities: mine.funActivities || "",
            smokes: mine.smokes || "",
            drinks: mine.drinks || "",
            educationLevel: mine.educationLevel || "",

            isAvailable: typeof mine.isAvailable === "boolean" ? mine.isAvailable : true,
          });

          setCulturalSelected(Array.isArray(mine.culturalIdentity) ? mine.culturalIdentity : []);
          setSpiritualSelected(
            Array.isArray(mine.spiritualFramework) ? mine.spiritualFramework : []
          );

          setPhotoPreview("");
          setPhotoPreview2("");
        }
      } catch (e: any) {
        setApiError(e?.message || "Could not load your profile.");
      } finally {
        setLoadingExisting(false);
      }
    })();
  }, [userId]);

  function buildUpsertPayload(
  overrides: Partial<{ photo: string; photo2: string }> = {}
) {
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

      gender: form.gender,
      looking_for_gender: form.lookingForGender,
      
      intention: form.relationshipIntent.trim(),
      identityPreview,

      culturalIdentity: culturalSelected,
      spiritualFramework: spiritualSelected,
      relationshipIntent: form.relationshipIntent.trim(),
      datingChallenge: form.datingChallenge.trim() || null,
      personalTruth: form.personalTruth.trim() || null,
      mateQualities: form.mateQualities.trim() || null,
      funActivities: form.funActivities.trim() || null,
      smokes: form.smokes || null,
      drinks: form.drinks || null,
      educationLevel: form.educationLevel || null,
      
      tags: selectedTags,
      isAvailable: !!form.isAvailable,
    };
  }

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

      const nextForm = {
        ...form,
        photo: slot === 1 ? url : form.photo,
        photo2: slot === 2 ? url : form.photo2,
      };

      setForm(nextForm);

      if (slot === 1) {
        setPhotoPreview("");
        setPhotoFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } else {
        setPhotoPreview2("");
        setPhotoFile2(null);
        if (fileInputRef2.current) fileInputRef2.current.value = "";
      }

      await apiUpsertProfile({
        ...buildUpsertPayload(),
        photo: nextForm.photo || null,
        photo2: nextForm.photo2 || null,
      });

      showToast(`Photo ${slot} uploaded and saved.`);
    } catch (e: any) {
      setApiError(e?.message || "Photo upload failed.");
      showToast("Upload failed.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  function onDeletePhoto(photoUrl: string, slot: 1 | 2) {
    if (!photoUrl) return;

    const ok = window.confirm("Remove this photo from your profile? Click Save profile to keep the change.");
    if (!ok) return;

    if (slot === 1) {
      setForm((p) => ({ ...p, photo: "" }));
      setPhotoPreview("");
      setPhotoFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else {
      setForm((p) => ({ ...p, photo2: "" }));
      setPhotoPreview2("");
      setPhotoFile2(null);
      if (fileInputRef2.current) fileInputRef2.current.value = "";
    }

    showToast("Photo removed from the form. Click Save profile to keep the change.");
  }

 async function onSave() {
  if (!userId) return;

  if (uploadingPhoto) {
    return showToast("Please wait for the photo upload to finish, then click Save profile.");
  }

  if (photoFile) {
    return showToast("Please click Upload Photo for your profile photo before saving.");
  }

  if (photoFile2) {
    return showToast("Please click Upload Photo for Photo 2 before saving.");
  }

  if (!form.displayName.trim()) return showToast("Please add a display name.");

  const ageNum = parseInt(form.age || "0", 10);
  if (!ageNum || ageNum < 18) {
    return showToast("Please enter a valid age (18+).");
  }

  if (!form.city.trim()) return showToast("Please add your city.");
  if (!form.stateUS.trim()) return showToast("Please add your state.");
  if (!form.relationshipIntent.trim()) {
    return showToast("Please select a Relationship Intent.");
  }

  if (culturalSelected.length === 0) {
    return showToast("Please select at least one Cultural Identity option.");
  }

  if (spiritualSelected.length === 0) {
    return showToast("Please select at least one Spiritual Framework option.");
  }

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

  const photoSlots = [
    {
      slot: 1 as const,
      url: photoPreview || form.photo || "",
      savedUrl: form.photo || "",
      label: "Profile Photo",
      alt: "Profile photo",
    },
    {
      slot: 2 as const,
      url: photoPreview2 || form.photo2 || "",
      savedUrl: form.photo2 || "",
      label: "Photo 2 (optional)",
      alt: "Profile photo 2",
    },
  ];

  const visiblePhotos = photoSlots.filter((p) => p.url);

  useEffect(() => {
    if (visiblePhotos.length === 0) {
      setActivePhotoIndex(0);
      return;
    }
    if (activePhotoIndex > visiblePhotos.length - 1) {
      setActivePhotoIndex(0);
    }
  }, [activePhotoIndex, visiblePhotos.length]);

  function goToPrevPhoto() {
    if (visiblePhotos.length <= 1) return;
    setActivePhotoIndex((prev) =>
      prev === 0 ? visiblePhotos.length - 1 : prev - 1
    );
  }

  function goToNextPhoto() {
    if (visiblePhotos.length <= 1) return;
    setActivePhotoIndex((prev) =>
      prev === visiblePhotos.length - 1 ? 0 : prev + 1
    );
  }

  function onDragStartPhoto(index: number) {
    setDraggingPhotoIndex(index);
  }

  function onDragOverPhoto(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  const sectionStyle: React.CSSProperties = {
    marginTop: "1.25rem",
    border: "1px solid #eee",
    borderRadius: 14,
    padding: "1.25rem",
    background: "white",
  };

  const galleryBoxStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 520,
    maxHeight: 760,
    borderRadius: 24,
    background: "#f6f6f6",
    border: "1px solid #e7e7e7",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  };

  const galleryImageStyle: React.CSSProperties = {
    width: "100%",
    height: "auto",
    maxHeight: 760,
    objectFit: "contain",
    display: "block",
  };

  const thumbStyle: React.CSSProperties = {
    width: 84,
    height: 108,
    borderRadius: 16,
    border: "2px solid #ddd",
    objectFit: "cover",
    objectPosition: "center center",
    background: "#f4f4f4",
  };

  const navButtonStyle: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: 42,
    height: 42,
    borderRadius: "999px",
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(255,255,255,0.92)",
    fontSize: 24,
    fontWeight: 900,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
  };

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    setTouchEndX(null);
    setTouchStartX(e.targetTouches[0].clientX);
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    setTouchEndX(e.targetTouches[0].clientX);
  }

  function handleTouchEnd() {
    if (touchStartX === null || touchEndX === null) return;

    const distance = touchStartX - touchEndX;

    if (distance > 50) {
      goToNextPhoto();
    } else if (distance < -50) {
      goToPrevPhoto();
    }
  }

  function onDropPhoto(targetIndex: number) {
    if (draggingPhotoIndex === null || draggingPhotoIndex === targetIndex) {
      setDraggingPhotoIndex(null);
      return;
    }

    const newPhoto = form.photo2 || "";
    const newPhoto2 = form.photo || "";

    setForm((prev) => ({
      ...prev,
      photo: newPhoto,
      photo2: newPhoto2,
    }));

    setPhotoPreview("");
    setPhotoPreview2("");
    setDraggingPhotoIndex(null);

    showToast("Photos reordered. Click Save profile to keep the new order.");
  }
   const completionFields = [
  form.displayName,
  form.age,
  form.city,
  form.stateUS,
  form.photo,
  form.photo2,
  form.gender,
  form.lookingForGender,
  form.relationshipIntent,
  form.datingChallenge,
  form.personalTruth,
  form.mateQualities,
  form.funActivities,
  form.smokes,
  form.drinks,
  form.educationLevel,
];

const completedFields = completionFields.filter(
  (field) => String(field || "").trim().length > 0
).length;

const profileCompletion = Math.round(
  (completedFields / completionFields.length) * 100
);

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
          <div
  style={{
    marginTop: "0.75rem",
    marginBottom: "1rem",
    padding: "0.85rem 1rem",
    border: "1px solid #ddd",
    borderRadius: 12,
    background: "#fff",
    maxWidth: 500,
  }}
>
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      marginBottom: 8,
      fontWeight: 700,
    }}
  >
    <span>Profile Completion</span>
    <span>{profileCompletion}%</span>
  </div>

  <div
    style={{
      width: "100%",
      height: 10,
      background: "#eee",
      borderRadius: 999,
      overflow: "hidden",
    }}
  >
    <div
      style={{
        width: `${profileCompletion}%`,
        height: "100%",
        background: "#0a5",
      }}
    />
  </div>
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

          <div style={{ marginTop: 22 }}>
           <div style={{ fontWeight: 700, marginBottom: 6 }}>Profile Photo</div>

           <div
             style={{
               width: "100%",
               minHeight: 320,
               maxHeight: 760,
               borderRadius: 24,
               background: "#f6f6f6",
               border: "1px solid #e7e7e7",
               overflow: "hidden",
               display: "flex",
               alignItems: "center",
               justifyContent: "center",
             }}
           >
              {photoPreview || form.photo ? (
                <img
                  src={photoPreview || form.photo}
                  alt="Profile photo"
                  style={{
                    width: "100%",
                    height: "auto",
                    maxHeight: 760,
                    objectFit: "contain",
                    display: "block",
                  }}
                />
              ) : (
                <div style={{ fontSize: 64, fontWeight: 900, color: "rgba(0,0,0,0.35)" }}>
                  {(form.displayName || "U").slice(0, 1).toUpperCase()}
                </div>
              )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setPhotoFile(f);
             if (f) {
               setPhotoPreview(URL.createObjectURL(f));
               showToast("Photo selected. Click Upload Photo.");
              }
            }}
         />

         <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
           <button
             type="button"
             onClick={() => fileInputRef.current?.click()}
             disabled={loadingExisting || uploadingPhoto}
             style={{
               marginTop: 10,
               padding: "0.6rem 0.9rem",
               borderRadius: 10,
               border: "1px solid #111",
               background: "#111",
               color: "white",
               cursor: loadingExisting || uploadingPhoto ? "not-allowed" : "pointer",
               fontWeight: 900,
               opacity: loadingExisting || uploadingPhoto ? 0.7 : 1,
             }}
           >
             Choose Photo
           </button>

           {photoFile && (
             <button
               type="button"
               onClick={() => onUploadPhoto(1)}
               disabled={uploadingPhoto}
               style={{
                 marginTop: 10,
                 padding: "0.6rem 0.9rem",
                 borderRadius: 10,
                 border: "1px solid #0a5",
                 background: "#0a5",
                 color: "white",
                 fontWeight: 900,
                 cursor: uploadingPhoto ? "not-allowed" : "pointer",
                 opacity: uploadingPhoto ? 0.7 : 1,
               }}
             >
               {uploadingPhoto ? "Uploading & Saving..." : "Upload & Save Photo"}
             </button>
           )}
         </div>
       </div>

       <div style={{ marginTop: 22 }}>
         <div style={{ fontWeight: 700, marginBottom: 6 }}>Photo 2 (optional)</div>

         <div
           style={{
             width: "100%",
             minHeight: 320,
             maxHeight: 760,
             borderRadius: 24,
             background: "#f6f6f6",
             border: "1px solid #e7e7e7",
             overflow: "hidden",
             display: "flex",
             alignItems: "center",
             justifyContent: "center",
           }}
        >
         {photoPreview2 || form.photo2 ? (
           <img
             src={photoPreview2 || form.photo2}
             alt="Profile photo 2"
             style={{
               width: "100%",
               height: "auto",
               maxHeight: 760,
               objectFit: "contain",
               display: "block",
             }}
          />
        ) : (
          <div style={{ fontSize: 48, fontWeight: 900, color: "rgba(0,0,0,0.25)" }}>
            Optional second photo
          </div>
        )}
      </div>

      <input
        ref={fileInputRef2}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0] || null;
          setPhotoFile2(f);
          if (f) {
            setPhotoPreview2(URL.createObjectURL(f));
            showToast("Second photo selected. Click Upload Photo.");
         }
       }}
     />

     <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
       <button
         type="button"
         onClick={() => fileInputRef2.current?.click()}
         disabled={loadingExisting || uploadingPhoto}
         style={{
           marginTop: 10,
           padding: "0.6rem 0.9rem",
           borderRadius: 10,
           border: "1px solid #111",
           background: "#111",
           color: "white",
           cursor: loadingExisting || uploadingPhoto ? "not-allowed" : "pointer",
           fontWeight: 900,
           opacity: loadingExisting || uploadingPhoto ? 0.7 : 1,
         }}
       >
         Choose Photo
       </button>

       {photoFile2 && (
         <button
           type="button"
           onClick={() => onUploadPhoto(2)}
           disabled={uploadingPhoto}
           style={{
             marginTop: 10,
             padding: "0.6rem 0.9rem",
             borderRadius: 10,
             border: "1px solid #0a5",
             background: "#0a5",
             color: "white",
             fontWeight: 900,
             cursor: uploadingPhoto ? "not-allowed" : "pointer",
             opacity: uploadingPhoto ? 0.7 : 1,
           }}
         >
           {uploadingPhoto ? "Uploading & Saving..." : "Upload & Save Photo"}
         </button>
       )}
     </div>
   </div> 

              <div style={{ fontWeight: 700, marginBottom: 10 }}>Photo Gallery</div>

              <div
                style={galleryBoxStyle}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {visiblePhotos.length > 0 ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={visiblePhotos[activePhotoIndex].url}
                      alt={visiblePhotos[activePhotoIndex].alt}
                      style={galleryImageStyle}
                    />

                    {visiblePhotos.length > 1 ? (
                      <>
                        <button
                          type="button"
                          onClick={goToPrevPhoto}
                          style={{ ...navButtonStyle, left: 14 }}
                          aria-label="Previous photo"
                        >
                          ‹
                        </button>

                        <button
                          type="button"
                          onClick={goToNextPhoto}
                          style={{ ...navButtonStyle, right: 14 }}
                          aria-label="Next photo"
                        >
                          ›
                        </button>

                        <div
                          style={{
                            position: "absolute",
                            bottom: 12,
                            left: "50%",
                            transform: "translateX(-50%)",
                            display: "flex",
                            gap: 8,
                            background: "rgba(255,255,255,0.88)",
                            padding: "8px 12px",
                            borderRadius: 999,
                          }}
                        >
                          {visiblePhotos.map((_, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setActivePhotoIndex(i)}
                              aria-label={`Go to photo ${i + 1}`}
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: "999px",
                                border: "none",
                                cursor: "pointer",
                                background: i === activePhotoIndex ? "#111" : "#cfcfcf",
                              }}
                            />
                          ))}
                        </div>
                      </>
                    ) : null}
                  </>
                ) : (
                  <div
                    style={{
                      fontSize: 64,
                      fontWeight: 900,
                      color: "rgba(0,0,0,0.25)",
                    }}
                  >
                    {(form.displayName || "U").slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
                Swipe left/right on mobile, or use the arrows. Drag the thumbnails below to reorder.
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                  marginTop: 14,
                }}
              >
                {photoSlots.map((slotItem, index) => {
                  const hasPhoto = !!slotItem.url;

                  return (
                    <div
                      key={slotItem.slot}
                      draggable={hasPhoto}
                      onDragStart={() => onDragStartPhoto(index)}
                      onDragOver={onDragOverPhoto}
                      onDrop={() => onDropPhoto(index)}
                      style={{
                        width: 140,
                        border: "1px solid #ddd",
                        borderRadius: 16,
                        padding: 10,
                        background: draggingPhotoIndex === index ? "#f7f7f7" : "white",
                        boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          marginBottom: 8,
                        }}
                      >
                        {slotItem.label}
                      </div>

                      <div
                        style={{
                          width: "100%",
                          height: 140,
                          borderRadius: 14,
                          background: "#f4f4f4",
                          overflow: "hidden",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginBottom: 8,
                        }}
                      >
                        {hasPhoto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={slotItem.url}
                            alt={slotItem.alt}
                            style={thumbStyle}
                          />
                        ) : (
                          <div
                            style={{
                              fontSize: 12,
                              color: "#999",
                              textAlign: "center",
                              padding: 8,
                            }}
                          >
                            No photo yet
                          </div>
                        )}
                      </div>

                      {slotItem.savedUrl ? (
                        <button
                          type="button"
                          onClick={() => {
                            setActivePhotoIndex(
                              Math.max(
                                0,
                                visiblePhotos.findIndex((p) => p.slot === slotItem.slot)
                              )
                            );
                          }}
                          style={{
                            width: "100%",
                            marginBottom: 8,
                            padding: "0.5rem 0.7rem",
                            borderRadius: 10,
                            border: "1px solid #ccc",
                            background: "white",
                            cursor: "pointer",
                            fontWeight: 700,
                          }}
                        >
                          View
                        </button>
                      ) : null}

                      {slotItem.savedUrl ? (
                        <button
                          type="button"
                          onClick={() => onDeletePhoto(slotItem.savedUrl, slotItem.slot)}
                          disabled={loadingExisting || uploadingPhoto}
                          style={{
                            width: "100%",
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
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <label>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>I Am</div>

              <select
                value={form.gender}
                onChange={(e) => onChange("gender", e.target.value)}
                style={{
                width: "100%",
                padding: "0.7rem",
                borderRadius: 10,
                border: "1px solid #ccc",
              }}
              disabled={loadingExisting}
            >
              <option value="">Select</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </label>

          <label>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              I Am Looking For
            </div>

            <select
              value={form.lookingForGender}
              onChange={(e) => onChange("lookingForGender", e.target.value)}
              style={{
                width: "100%",
                padding: "0.7rem",
                borderRadius: 10,
                border: "1px solid #ccc",
              }}
              disabled={loadingExisting}
            >
              <option value="">Select</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </label>

          <label>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              Relationship Intent
            </div>
  
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
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                  gap: "0.6rem",
                  alignItems: "stretch",
                }}
              >
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
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                  gap: "0.6rem",
                  alignItems: "stretch",
                }}
              >
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

            <label>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                What type of qualities are important in a mate?
              </div>

              <textarea
                value={form.mateQualities || ""}
                onChange={(e) => onChange("mateQualities", e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.7rem",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  minHeight: 90,
                }}
                placeholder="Describe the qualities that matter most to you."
         />
       </label>

      <label>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>
          What do you do for fun?
        </div>

        <textarea
          value={form.funActivities || ""}
          onChange={(e) => onChange("funActivities", e.target.value)}
          style={{
            width: "100%",
            padding: "0.7rem",
            borderRadius: 10,
            border: "1px solid #ccc",
            minHeight: 90,
          }}
          placeholder="Share your hobbies, interests, and favorite activities."
        />
      </label>

      <label>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>
          Do you smoke?
        </div>

        <select
          value={form.smokes || ""}
          onChange={(e) => onChange("smokes", e.target.value)}
          style={{
            width: "100%",
            padding: "0.7rem",
            borderRadius: 10,
            border: "1px solid #ccc",
          }}
        >
          <option value="">Select one</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
       </label>

       <label>
         <div style={{ fontWeight: 700, marginBottom: 6 }}>
           Do you drink?
         </div>

         <select
           value={form.drinks || ""}
           onChange={(e) => onChange("drinks", e.target.value)}
           style={{
             width: "100%",
             padding: "0.7rem",
             borderRadius: 10,
             border: "1px solid #ccc",
           }}
        >
          <option value="">Select one</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      </label>

      <label>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>
          What's your highest level of education?
        </div>

        <select
          value={form.educationLevel || ""}
          onChange={(e) => onChange("educationLevel", e.target.value)}
          style={{
            width: "100%",
            padding: "0.7rem",
            borderRadius: 10,
            border: "1px solid #ccc",
          }}
       >
         <option value="">Select one</option>
         <option value="High school graduate or less">
           High school graduate or less
         </option>
         <option value="Some college">Some college</option>
         <option value="College graduate">College graduate</option>
         <option value="Advanced degree">Advanced degree</option>
       </select>
    </label>

           <div
             style={{
               marginTop: "1rem",
               padding: "1rem",
               borderRadius: 12,
               border: "1px solid #e5e7eb",
               background: "#fafafa",
               fontSize: "0.9rem",
               lineHeight: 1.5,
             }}
         >
           <div style={{ fontWeight: 700, marginBottom: 8 }}>
             Community Commitment
           </div>

           <div>
             Black Within is a respectful community built on authenticity,
             integrity, and meaningful connection.
           </div>

           <div style={{ marginTop: 8 }}>
             Harassment, scams, hate speech, bullying, sexual misconduct,
             fraudulent profiles, or other harmful behavior may result in
             immediate account removal.
          </div>

          <div
            style={{
              marginTop: 8,
              fontWeight: 700,
              color: "#8b0000",
           }}
        >
          Never send money to someone you have met online and report
          suspicious behavior immediately.
       </div>
    </div> 

            <button
              onClick={onSave}
              disabled={saving || loadingExisting || uploadingPhoto}
              style={{
                marginTop: "0.4rem",
                padding: "0.85rem 1rem",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: "white",
                cursor:
                  saving || loadingExisting || uploadingPhoto ? "not-allowed" : "pointer",
                opacity: saving || loadingExisting || uploadingPhoto ? 0.7 : 1,
                fontWeight: 700,
              }}
            >
              {saving ? "Saving..." : uploadingPhoto ? "Waiting for photo upload..." : "Save profile"}
            </button>
          </div>
        </div>
    </main>
  );
}

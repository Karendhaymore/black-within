"use client";

import { useEffect, useMemo, useState } from "react";
import { type Profile } from "../lib/sampleProfiles";
import { getOrCreateUserId } from "../lib/user";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  "https://black-within-api.onrender.com";

async function apiGetSavedIds(userId: string): Promise<string[]> {
  const res = await fetch(
    `${API_BASE}/saved?user_id=${encodeURIComponent(userId)}`
  );
  if (!res.ok) throw new Error("Failed to load saved profiles.");
  const json = await res.json();
  return Array.isArray(json?.ids) ? json.ids : [];
}

async function apiGetLikes(userId: string): Promise<string[]> {
  const res = await fetch(
    `${API_BASE}/likes?user_id=${encodeURIComponent(userId)}`
  );
  if (!res.ok) throw new Error("Failed to load likes.");
  const json = await res.json();
  return Array.isArray(json?.ids) ? json.ids : [];
}

async function apiSaveProfile(userId: string, profileId: string) {
  const res = await fetch(`${API_BASE}/saved`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, profile_id: profileId }),
  });
  if (!res.ok) throw new Error("Save failed.");
}

async function apiUnsaveProfile(userId: string, profileId: string) {
  const url = `${API_BASE}/saved?user_id=${encodeURIComponent(
    userId
  )}&profile_id=${encodeURIComponent(profileId)}`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error("Unsave failed.");
}

// UPDATED: recipient_user_id added
async function apiLikeProfile(
  userId: string,
  profileId: string,
  recipientUserId?: string
) {
  const res = await fetch(`${API_BASE}/likes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      profile_id: profileId,
      recipient_user_id: recipientUserId || null,
    }),
  });
  if (!res.ok) throw new Error("Like failed.");
}

// ✅ NEW helper: GET /profiles
async function apiListProfiles(): Promise<Profile[]> {
  const res = await fetch(`${API_BASE}/profiles`, { method: "GET" });
  if (!res.ok) throw new Error("Failed to load profiles.");
  const json = await res.json();
  return Array.isArray(json?.items) ? json.items : [];
}

export default function DiscoverPage() {
  const [userId, setUserId] = useState<string>("");

  // ✅ NEW state: store profiles from API
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [loadingSets, setLoadingSets] = useState<boolean>(true);

  const [intentionFilter, setIntentionFilter] = useState<string>("All");
  const [tagFilter, setTagFilter] = useState<string>("All");
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  // ✅ CHANGED: use profiles from API instead of DEMO_PROFILES
  const availableProfiles = useMemo(
    () => profiles.filter((p) => p.isAvailable),
    [profiles]
  );

  const availableProfileIds = useMemo(
    () => new Set(availableProfiles.map((p) => p.id)),
    [availableProfiles]
  );

  const intentionOptions = useMemo(() => {
    const set = new Set<string>();
    availableProfiles.forEach((p) => set.add(p.intention));
    return ["All", ...Array.from(set).sort()];
  }, [availableProfiles]);

  const tagOptions = useMemo(() => {
    const set = new Set<string>();
    availableProfiles.forEach((p) => p.tags.forEach((t) => set.add(t)));
    return ["All", ...Array.from(set).sort()];
  }, [availableProfiles]);

  const filteredProfiles = useMemo(() => {
    return availableProfiles.filter((p) => {
      const intentionMatch =
        intentionFilter === "All" || p.intention === intentionFilter;
      const tagMatch = tagFilter === "All" || p.tags.includes(tagFilter);
      return intentionMatch && tagMatch;
    });
  }, [availableProfiles, intentionFilter, tagFilter]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
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

  async function refreshSavedAndLikes(uid: string) {
    try {
      setApiError(null);
      setLoadingSets(true);

      const [saved, likes] = await Promise.all([
        apiGetSavedIds(uid),
        apiGetLikes(uid),
      ]);

      setSavedIds(saved.filter((id) => availableProfileIds.has(id)));
      setLikedIds(likes.filter((id) => availableProfileIds.has(id)));
    } catch (e: any) {
      setApiError(e?.message || `Could not reach API at ${API_BASE}`);
    } finally {
      setLoadingSets(false);
    }
  }

  // ✅ CHANGED: load profiles via GET /profiles first, then refresh saved/likes.
  useEffect(() => {
    const uid = getOrCreateUserId();
    setUserId(uid);

    (async () => {
      try {
        const items = await apiListProfiles();
        setProfiles(items);
      } catch (e: any) {
        setApiError(e?.message || "Could not load profiles.");
      }
      await refreshSavedAndLikes(uid);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ When availableProfileIds changes (after profiles load), re-filter saved/likes.
  useEffect(() => {
    if (!userId) return;
    refreshSavedAndLikes(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableProfileIds]);

  async function onToggleSave(p: Profile) {
    if (!userId) return;

    const currentlySaved = savedIds.includes(p.id);
    const prev = savedIds;

    setSavedIds((curr) =>
      curr.includes(p.id) ? curr.filter((x) => x !== p.id) : [p.id, ...curr]
    );

    try {
      if (currentlySaved) {
        await apiUnsaveProfile(userId, p.id);
        showToast("Removed from Saved Profiles.");
      } else {
        await apiSaveProfile(userId, p.id);
        showToast("Saved. You can view it later in Saved Profiles.");
      }
      await refreshSavedAndLikes(userId);
    } catch (e: any) {
      setSavedIds(prev);
      setApiError(e?.message || "Save/Unsave failed.");
      showToast("Could not update saved status right now.");
    }
  }

  async function onLike(p: Profile) {
    if (!userId) return;
    if (likedIds.includes(p.id)) return;

    const prev = likedIds;
    setLikedIds((curr) => (curr.includes(p.id) ? curr : [p.id, ...curr]));

    try {
      // IMPORTANT: In the real app, recipientUserId must be the profile owner's user id.
      // For now (preview), we don't truly have that mapping, so we pass nothing.
      await apiLikeProfile(userId, p.id, undefined);

      await refreshSavedAndLikes(userId);
      showToast("Like sent.");
    } catch (e: any) {
      setLikedIds(prev);
      setApiError(e?.message || "Like failed.");
      showToast("Could not like right now.");
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
      <div style={{ width: "100%", maxWidth: 1100 }}>
        {/* ✅ ADD THIS in your top-right buttons area */}
        {/* Paste this <a> next to your other top-right buttons/links */}
        <a
          href="/profile"
          style={{
            padding: "0.65rem 1rem",
            border: "1px solid #ccc",
            borderRadius: 10,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          My Profile
        </a>

        {/* (rest of your UI stays exactly the same) */}
        {/* Only: DEMO_PROFILES removed, profiles loaded from GET /profiles */}
        {/* Keep your existing JSX below */}
      </div>
    </main>
  );
}

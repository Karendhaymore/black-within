"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

type AdminProfile = {
  profile_id: string;
  owner_user_id: string;
  displayName: string;
  age: number;
  city: string;
  stateUS: string;
  photo?: string | null;
  photo2?: string | null;
  identityPreview?: string | null;
  intention?: string | null;
  tags?: string[] | null;
  culturalIdentity?: string[] | null;
  spiritualFramework?: string[] | null;
  relationshipIntent?: string | null;
  datingChallenge?: string | null;
  personalTruth?: string | null;
  isAvailable: boolean;
  is_banned?: boolean;
  banned_reason?: string | null;
  banned_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

function getAdminToken(): string {
  if (typeof window === "undefined") return "";
  const keys = ["bw_admin_token", "admin_token", "bw_admin_session", "bw_admin_key"];
  for (const key of keys) {
    const value = window.localStorage.getItem(key);
    if (value?.trim()) return value.trim();
  }
  return "";
}

function adminHeaders(token: string): Record<string, string> {
  return {
    "X-Admin-Token": token,
    Authorization: `Bearer ${token}`,
  };
}

function list(items?: string[] | null) {
  return items?.length ? items.join(", ") : "—";
}

export default function AdminProfileReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const profileId = decodeURIComponent(String(params?.id || ""));
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }

    (async () => {
      try {
        const me = await fetch(`${API_BASE}/admin/me`, {
          headers: adminHeaders(token),
          cache: "no-store",
        });
        if (!me.ok) {
          router.replace("/admin/login");
          return;
        }

        const res = await fetch(`${API_BASE}/admin/profiles/${encodeURIComponent(profileId)}`, {
          headers: adminHeaders(token),
          cache: "no-store",
        });
        if (!res.ok) {
          let detail = `Unable to load profile (${res.status}).`;
          try {
            const body = await res.json();
            if (body?.detail) detail = String(body.detail);
          } catch {}
          throw new Error(detail);
        }
        setProfile((await res.json()) as AdminProfile);
      } catch (e: any) {
        setError(e?.message || "Unable to load profile.");
      } finally {
        setLoading(false);
      }
    })();
  }, [profileId, router]);

  const card: React.CSSProperties = {
    background: "white",
    border: "1px solid #e7e7e7",
    borderRadius: 16,
    padding: 20,
  };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: "#666", marginBottom: 5 };
  const value: React.CSSProperties = { fontSize: 15, whiteSpace: "pre-wrap", lineHeight: 1.55 };

  if (loading) return <main style={{ padding: 32 }}>Loading profile for admin review…</main>;

  return (
    <main style={{ minHeight: "100vh", background: "#f7f7f5", padding: "28px 18px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.2, color: "#666" }}>ADMIN MODERATION VIEW</div>
            <h1 style={{ margin: "6px 0 4px", fontSize: 30 }}>Profile Review</h1>
            <div style={{ color: "#666" }}>Read-only view for complaint and safety review.</div>
          </div>
          <Link href="/admin" style={{ alignSelf: "flex-start", padding: "10px 14px", border: "1px solid #ccc", borderRadius: 10, background: "white", color: "#111", textDecoration: "none", fontWeight: 800 }}>
            ← Back to Admin
          </Link>
        </div>

        {error ? <div style={{ ...card, color: "#8a2424", background: "#fff7f7" }}>{error}</div> : null}

        {profile ? (
          <>
            <section style={{ ...card, marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 320px) 1fr", gap: 24 }}>
                <div style={{ display: "grid", gridTemplateColumns: profile.photo2 ? "1fr 1fr" : "1fr", gap: 10 }}>
                  {[profile.photo, profile.photo2].filter(Boolean).map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={String(src)} alt={`Profile photo ${i + 1}`} style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 14, border: "1px solid #eee" }} />
                  ))}
                  {!profile.photo && !profile.photo2 ? <div style={{ padding: 40, border: "1px dashed #bbb", borderRadius: 14, textAlign: "center", color: "#777" }}>No photos</div> : null}
                </div>
                <div>
                  <h2 style={{ fontSize: 28, margin: "0 0 6px" }}>{profile.displayName}</h2>
                  <div style={{ fontSize: 18, marginBottom: 14 }}>{profile.age}, {profile.city}, {profile.stateUS}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
                    <span style={{ padding: "6px 10px", borderRadius: 999, background: profile.isAvailable ? "#eaf7ea" : "#eee", fontWeight: 800 }}>{profile.isAvailable ? "Visible" : "Hidden"}</span>
                    {profile.is_banned ? <span style={{ padding: "6px 10px", borderRadius: 999, background: "#ffe8e8", color: "#8a2424", fontWeight: 800 }}>BANNED</span> : null}
                  </div>
                  <div style={label}>USER ID</div><div style={{ ...value, wordBreak: "break-all", marginBottom: 12 }}>{profile.owner_user_id}</div>
                  <div style={label}>PROFILE ID</div><div style={{ ...value, wordBreak: "break-all" }}>{profile.profile_id}</div>
                </div>
              </div>
            </section>

            <section style={{ ...card, marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Profile Information</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 20 }}>
                <div><div style={label}>INTENTION</div><div style={value}>{profile.intention || "—"}</div></div>
                <div><div style={label}>RELATIONSHIP INTENT</div><div style={value}>{profile.relationshipIntent || "—"}</div></div>
                <div><div style={label}>CULTURAL IDENTITY</div><div style={value}>{list(profile.culturalIdentity)}</div></div>
                <div><div style={label}>SPIRITUAL FRAMEWORK</div><div style={value}>{list(profile.spiritualFramework)}</div></div>
                <div><div style={label}>TAGS / INTERESTS</div><div style={value}>{list(profile.tags)}</div></div>
              </div>
            </section>

            <section style={{ ...card, marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Member Responses</h2>
              <div style={{ marginBottom: 18 }}><div style={label}>IDENTITY / ABOUT</div><div style={value}>{profile.identityPreview || "—"}</div></div>
              <div style={{ marginBottom: 18 }}><div style={label}>DATING CHALLENGE</div><div style={value}>{profile.datingChallenge || "—"}</div></div>
              <div><div style={label}>PERSONAL TRUTH</div><div style={value}>{profile.personalTruth || "—"}</div></div>
            </section>

            {profile.is_banned || profile.banned_reason ? (
              <section style={{ ...card, marginBottom: 16, background: "#fff8f8" }}>
                <h2 style={{ marginTop: 0 }}>Moderation Status</h2>
                <div style={label}>BAN REASON</div><div style={value}>{profile.banned_reason || "—"}</div>
                {profile.banned_at ? <div style={{ marginTop: 12 }}><div style={label}>BANNED AT</div><div style={value}>{new Date(profile.banned_at).toLocaleString()}</div></div> : null}
              </section>
            ) : null}

            <div style={{ color: "#777", fontSize: 12, padding: "4px 4px 20px" }}>
              Created: {profile.created_at ? new Date(profile.created_at).toLocaleString() : "—"} · Updated: {profile.updated_at ? new Date(profile.updated_at).toLocaleString() : "—"}
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}

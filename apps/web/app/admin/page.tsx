"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

type ApiProfile = {
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
};

type ProfilesResponse = { items: ApiProfile[] };

async function safeReadErrorDetail(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if ((data as any)?.detail) return String((data as any).detail);
    return JSON.stringify(data);
  } catch {}
  try {
    const text = await res.text();
    if (text) return text;
  } catch {}
  return `Request failed (${res.status}).`;
}

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState<string>("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [seedCount, setSeedCount] = useState<number>(10);
  const [created, setCreated] = useState<ApiProfile[]>([]);

  const [form, setForm] = useState({
    owner_user_id: "",
    displayName: "",
    age: "30",
    city: "Atlanta",
    stateUS: "GA",
    photo: "",
    intention: "Intentional partnership",
    identityPreview:
      "Cultural Identity: Ancestrally Rooted\n\nSpiritual Framework: Kemetic Philosophy\n\nOne Thing You Need to Know About Me: I’m intentional, grounded, and ready for aligned love.",
    tags: "Ancestrally Rooted, Kemetic Philosophy",
  });

  const navBtnStyle: React.CSSProperties = useMemo(
    () => ({
      padding: "0.65rem 1rem",
      border: "1px solid #ccc",
      borderRadius: 10,
      textDecoration: "none",
      color: "inherit",
      background: "white",
      display: "inline-block",
    }),
    []
  );

  function show(msg: string) {
    setStatus(msg);
    window.setTimeout(() => setStatus(null), 3500);
  }

  function mustHaveAdminKey(): boolean {
    const k = (adminKey || "").trim();
    if (!k) {
      show("Enter your ADMIN_KEY first.");
      return false;
    }
    return true;
  }

  async function seedProfiles() {
    if (!mustHaveAdminKey()) return;

    setLoading(true);
    setCreated([]);
    try {
      const res = await fetch(`${API_BASE}/admin/seed-profiles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": adminKey.trim(),
        },
        body: JSON.stringify({ count: seedCount }),
      });

      if (!res.ok) throw new Error(await safeReadErrorDetail(res));

      const json = (await res.json()) as ProfilesResponse;
      setCreated(Array.isArray(json?.items) ? json.items : []);
      show(`Seeded ${Array.isArray(json?.items) ? json.items.length : 0} profiles.`);
    } catch (e: any) {
      show(e?.message || "Seeding failed.");
    } finally {
      setLoading(false);
    }
  }

  async function createProfile() {
    if (!mustHaveAdminKey()) return;

    const ageNum = parseInt(form.age || "0", 10);
    if (!form.displayName.trim()) return show("displayName is required.");
    if (!ageNum || ageNum < 18) return show("age must be 18+.");
    if (!form.city.trim()) return show("city is required.");
    if (!form.stateUS.trim()) return show("stateUS is required.");
    if (!form.intention.trim()) return show("intention is required.");
    if (!form.identityPreview.trim()) return show("identityPreview is required.");

    const tags = (form.tags || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 25);

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/create-profile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": adminKey.trim(),
        },
        body: JSON.stringify({
          owner_user_id: form.owner_user_id.trim() || undefined,
          displayName: form.displayName.trim(),
          age: ageNum,
          city: form.city.trim(),
          stateUS: form.stateUS.trim(),
          photo: form.photo.trim() || null,
          intention: form.intention.trim(),
          identityPreview: form.identityPreview.trim(),
          tags,
          isAvailable: true,
        }),
      });

      if (!res.ok) throw new Error(await safeReadErrorDetail(res));

      const prof = (await res.json()) as ApiProfile;
      setCreated((curr) => [prof, ...curr]);
      show("Created 1 profile.");
    } catch (e: any) {
      show(e?.message || "Create failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", padding: "2rem", display: "grid", placeItems: "start center" }}>
      <div style={{ width: "100%", maxWidth: 1100 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0 }}>Admin</h1>
            <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
              Create seed profiles for testing. Protected by <code>ADMIN_KEY</code>.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/discover" style={navBtnStyle}>Discover</Link>
            <Link href="/profile" style={navBtnStyle}>My Profile</Link>
          </div>
        </div>

        {status && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid #ddd", background: "white" }}>
            {status}
          </div>
        )}

        <div style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 14, padding: 14, background: "white" }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Admin Key</div>
          <input
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="Paste your ADMIN_KEY here"
            type="password"
            style={{ width: "100%", padding: "0.75rem", borderRadius: 12, border: "1px solid #ccc" }}
          />
          <div style={{ marginTop: 8, color: "#777", fontSize: 13 }}>
            This key is stored only on Render (backend). The admin page just sends it as a header.
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {/* Seed */}
          <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14, background: "white" }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Seed profiles</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                Count:
                <input
                  value={seedCount}
                  onChange={(e) => setSeedCount(parseInt(e.target.value || "10", 10))}
                  style={{ width: 90, padding: "0.6rem", borderRadius: 12, border: "1px solid #ccc" }}
                />
              </label>
              <button
                onClick={seedProfiles}
                disabled={loading}
                style={{
                  padding: "0.75rem 1rem",
                  borderRadius: 12,
                  border: "1px solid #111",
                  background: "#111",
                  color: "white",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "Working..." : "Generate seed profiles"}
              </button>
            </div>
            <div style={{ marginTop: 8, color: "#777", fontSize: 13 }}>
              These profiles are created in the database and will appear in Discover right away.
            </div>
          </div>

          {/* Create One */}
          <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14, background: "white" }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Create 1 profile</div>

            <div style={{ display: "grid", gap: 10 }}>
              <input
                value={form.owner_user_id}
                onChange={(e) => setForm((p) => ({ ...p, owner_user_id: e.target.value }))}
                placeholder="(Optional) owner_user_id"
                style={{ padding: "0.7rem", borderRadius: 12, border: "1px solid #ccc" }}
              />

              <input
                value={form.displayName}
                onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
                placeholder="displayName"
                style={{ padding: "0.7rem", borderRadius: 12, border: "1px solid #ccc" }}
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <input
                  value={form.age}
                  onChange={(e) => setForm((p) => ({ ...p, age: e.target.value }))}
                  placeholder="age"
                  style={{ padding: "0.7rem", borderRadius: 12, border: "1px solid #ccc" }}
                />
                <input
                  value={form.stateUS}
                  onChange={(e) => setForm((p) => ({ ...p, stateUS: e.target.value }))}
                  placeholder="stateUS"
                  style={{ padding: "0.7rem", borderRadius: 12, border: "1px solid #ccc" }}
                />
              </div>

              <input
                value={form.city}
                onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                placeholder="city"
                style={{ padding: "0.7rem", borderRadius: 12, border: "1px solid #ccc" }}
              />

              <input
                value={form.photo}
                onChange={(e) => setForm((p) => ({ ...p, photo: e.target.value }))}
                placeholder="photo URL (optional)"
                style={{ padding: "0.7rem", borderRadius: 12, border: "1px solid #ccc" }}
              />

              <input
                value={form.intention}
                onChange={(e) => setForm((p) => ({ ...p, intention: e.target.value }))}
                placeholder="intention"
                style={{ padding: "0.7rem", borderRadius: 12, border: "1px solid #ccc" }}
              />

              <textarea
                value={form.identityPreview}
                onChange={(e) => setForm((p) => ({ ...p, identityPreview: e.target.value }))}
                placeholder="identityPreview"
                style={{ padding: "0.7rem", borderRadius: 12, border: "1px solid #ccc", minHeight: 120 }}
              />

              <input
                value={form.tags}
                onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
                placeholder="tags (comma-separated)"
                style={{ padding: "0.7rem", borderRadius: 12, border: "1px solid #ccc" }}
              />

              <button
                onClick={createProfile}
                disabled={loading}
                style={{
                  padding: "0.75rem 1rem",
                  borderRadius: 12,
                  border: "1px solid #ccc",
                  background: "white",
                  fontWeight: 800,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "Working..." : "Create profile"}
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 14, padding: 14, background: "white" }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Created profiles (most recent)</div>

          {created.length === 0 ? (
            <div style={{ color: "#777" }}>None yet.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {created.map((p) => (
                <div key={p.id} style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{p.displayName}</div>
                  <div style={{ color: "#666", fontSize: 13 }}>
                    {p.city}, {p.stateUS} · {p.age}
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Link href={`/profiles/${p.id}`} style={navBtnStyle}>View</Link>
                    <div style={{ fontSize: 12, color: "#777" }}>
                      profile_id: <code>{p.id}</code>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 14, color: "#777", fontSize: 13 }}>
          Tip: After seeding, go to <b>Discover</b> and you’ll immediately see profiles to Like/Save.
        </div>
      </div>
    </main>
  );
}

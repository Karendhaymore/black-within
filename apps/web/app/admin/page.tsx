"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

async function safeReadErrorDetail(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (j?.detail) return String(j.detail);
  } catch {}
  try {
    const t = await res.text();
    if (t) return t;
  } catch {}
  return `Request failed (${res.status}).`;
}

type AdminProfileRow = {
  profile_id: string;
  owner_user_id: string;
  displayName: string;
  age: number;
  city: string;
  stateUS: string;
  photo?: string | null;
  photo2?: string | null;
  isAvailable: boolean;
  is_banned: boolean;
  banned_reason?: string | null;
  likes_count: number;
  saved_count: number;
};

type ProfilesOut = { items: AdminProfileRow[] };

type AdminReportRow = {
  id: string;
  reporter_user_id: string;
  reported_user_id: string;
  reported_profile_id?: string | null;
  thread_id?: string | null;
  reason: string;
  details?: string | null;
  status: string;
  created_at: string;
};

type ReportsOut = { items: AdminReportRow[] };

function getAdminToken() {
  return (typeof window !== "undefined" && window.localStorage.getItem("bw_admin_token")) || "";
}

export default function AdminDashboard() {
  const router = useRouter();

  const [q, setQ] = useState("");
  const [profiles, setProfiles] = useState<AdminProfileRow[]>([]);
  const [reports, setReports] = useState<AdminReportRow[]>([]);
  const [tab, setTab] = useState<"profiles" | "reports">("profiles");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  }

  async function adminFetch(path: string, init?: RequestInit) {
    const token = getAdminToken();
    if (!token) {
      router.replace("/admin/login");
      throw new Error("Missing admin token.");
    }
    const res = await fetch(`${API_BASE}${path}`, {
      ...(init || {}),
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    return res;
  }

  async function loadProfiles() {
    const res = await adminFetch(`/admin/profiles?limit=200&q=${encodeURIComponent(q || "")}`);
    if (!res.ok) throw new Error(await safeReadErrorDetail(res));
    const json = (await res.json()) as ProfilesOut;
    setProfiles(Array.isArray(json?.items) ? json.items : []);
  }

  async function loadReports() {
    const res = await adminFetch(`/admin/reports?limit=200`);
    if (!res.ok) throw new Error(await safeReadErrorDetail(res));
    const json = (await res.json()) as ReportsOut;
    setReports(Array.isArray(json?.items) ? json.items : []);
  }

  useEffect(() => {
    const token = getAdminToken();
    if (!token) router.replace("/admin/login");
  }, [router]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        await Promise.all([loadProfiles(), loadReports()]);
      } catch (e: any) {
        setErr(e?.message || "Could not load admin data.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredProfiles = useMemo(() => profiles, [profiles]);

  async function patchProfile(profileId: string, patch: any) {
    setErr(null);
    try {
      const res = await adminFetch(`/admin/profiles/${encodeURIComponent(profileId)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await safeReadErrorDetail(res));
      showToast("Updated.");
      await loadProfiles();
    } catch (e: any) {
      setErr(e?.message || "Update failed.");
    }
  }

  async function clearPhoto(profileId: string, slot: 1 | 2) {
    setErr(null);
    try {
      const res = await adminFetch(`/admin/profiles/${encodeURIComponent(profileId)}/clear-photo`, {
        method: "POST",
        body: JSON.stringify({ slot }),
      });
      if (!res.ok) throw new Error(await safeReadErrorDetail(res));
      showToast(`Cleared photo ${slot}.`);
      await loadProfiles();
    } catch (e: any) {
      setErr(e?.message || "Clear photo failed.");
    }
  }

  async function updateReportStatus(id: string, status: string) {
    setErr(null);
    try {
      const res = await adminFetch(`/admin/reports/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await safeReadErrorDetail(res));
      showToast("Report updated.");
      await loadReports();
    } catch (e: any) {
      setErr(e?.message || "Report update failed.");
    }
  }

  async function createFreeUser() {
    setErr(null);
    try {
      const res = await adminFetch(`/admin/users/create`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(await safeReadErrorDetail(res));
      const json = await res.json();
      const claim = `${window.location.origin}/auth/claim?token=${encodeURIComponent(json.claim_token)}`;
      await navigator.clipboard.writeText(claim);
      showToast("Claim link copied to clipboard.");
    } catch (e: any) {
      setErr(e?.message || "Could not create user.");
    }
  }

  function logout() {
    window.localStorage.removeItem("bw_admin_token");
    window.localStorage.removeItem("bw_admin_role");
    window.localStorage.removeItem("bw_admin_email");
    router.replace("/admin/login");
  }

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", padding: "2rem" }}>
        <p>Loading admin dashboard…</p>
        <p style={{ color: "#777", fontSize: 12 }}>API: {API_BASE}</p>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", padding: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginTop: 0 }}>Admin Dashboard</h1>
          <div style={{ color: "#777", fontSize: 12 }}>API: {API_BASE}</div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={createFreeUser}
            style={{ padding: "0.6rem 0.9rem", borderRadius: 10, border: "1px solid #111", background: "#111", color: "white", fontWeight: 900 }}
          >
            Add user free (copy claim link)
          </button>
          <button onClick={logout} style={{ padding: "0.6rem 0.9rem", borderRadius: 10, border: "1px solid #ccc", background: "white" }}>
            Logout
          </button>
          <Link href="/discover" style={{ padding: "0.6rem 0.9rem", borderRadius: 10, border: "1px solid #ccc", background: "white", textDecoration: "none", color: "inherit" }}>
            Back to app
          </Link>
        </div>
      </div>

      {err ? (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 12, border: "1px solid #f0c9c9", background: "#fff7f7", color: "#7a2d2d", whiteSpace: "pre-wrap" }}>
          <b>Error:</b> {err}
        </div>
      ) : null}

      {toast ? (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 12, border: "1px solid #cfe7cf", background: "#f6fff6" }}>{toast}</div>
      ) : null}

      <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
        <button
          onClick={() => setTab("profiles")}
          style={{ padding: "0.5rem 0.8rem", borderRadius: 999, border: "1px solid #ccc", background: tab === "profiles" ? "#111" : "white", color: tab === "profiles" ? "white" : "#111" }}
        >
          Profiles
        </button>
        <button
          onClick={() => setTab("reports")}
          style={{ padding: "0.5rem 0.8rem", borderRadius: 999, border: "1px solid #ccc", background: tab === "reports" ? "#111" : "white", color: tab === "reports" ? "white" : "#111" }}
        >
          Reports
        </button>
      </div>

      {tab === "profiles" ? (
        <section style={{ marginTop: 14 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search (name, city, state, owner_user_id)"
              style={{ padding: "0.7rem", borderRadius: 12, border: "1px solid #ccc", width: 420, maxWidth: "100%" }}
            />
            <button
              onClick={async () => {
                setLoading(true);
                try {
                  await loadProfiles();
                } finally {
                  setLoading(false);
                }
              }}
              style={{ padding: "0.7rem 0.9rem", borderRadius: 12, border: "1px solid #ccc", background: "white" }}
            >
              Refresh
            </button>
          </div>

          <div style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 16, overflow: "hidden" }}>
            <div style={{ padding: 12, background: "#fafafa", borderBottom: "1px solid #eee", fontWeight: 900 }}>
              Profiles ({filteredProfiles.length})
            </div>

            {filteredProfiles.map((p) => (
              <div key={p.profile_id} style={{ padding: 12, borderBottom: "1px solid #f1f1f1", display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>
                      {p.displayName}{" "}
                      <span style={{ color: "#777", fontWeight: 600 }}>
                        ({p.age}) • {p.city}, {p.stateUS}
                      </span>
                    </div>
                    <div style={{ color: "#777", fontSize: 12 }}>
                      profile_id: <code>{p.profile_id}</code> • owner_user_id: <code>{p.owner_user_id}</code>
                    </div>
                    <div style={{ color: "#555", fontSize: 12, marginTop: 4 }}>
                      likes: <b>{p.likes_count}</b> • saved: <b>{p.saved_count}</b>
                      {p.is_banned ? (
                        <span style={{ marginLeft: 10, color: "#a10000", fontWeight: 900 }}>BANNED</span>
                      ) : null}
                      {!p.isAvailable ? (
                        <span style={{ marginLeft: 10, color: "#555", fontWeight: 900 }}>HIDDEN</span>
                      ) : (
                        <span style={{ marginLeft: 10, color: "#0a5411", fontWeight: 900 }}>VISIBLE</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      onClick={() => patchProfile(p.profile_id, { isAvailable: !p.isAvailable })}
                      style={{ padding: "0.55rem 0.8rem", borderRadius: 10, border: "1px solid #ccc", background: "white", fontWeight: 800 }}
                    >
                      Toggle Visible
                    </button>
                    <button
                      onClick={() => patchProfile(p.profile_id, { is_banned: !p.is_banned, banned_reason: !p.is_banned ? "Admin ban" : "" })}
                      style={{ padding: "0.55rem 0.8rem", borderRadius: 10, border: "1px solid #ccc", background: "white", fontWeight: 800 }}
                    >
                      {p.is_banned ? "Unban" : "Ban"}
                    </button>

                    <button onClick={() => clearPhoto(p.profile_id, 1)} style={{ padding: "0.55rem 0.8rem", borderRadius: 10, border: "1px solid #ccc", background: "white" }}>
                      Remove photo1
                    </button>
                    <button onClick={() => clearPhoto(p.profile_id, 2)} style={{ padding: "0.55rem 0.8rem", borderRadius: 10, border: "1px solid #ccc", background: "white" }}>
                      Remove photo2
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {p.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photo} alt="photo1" style={{ width: 72, height: 72, borderRadius: 14, objectFit: "cover", border: "1px solid #eee" }} />
                  ) : (
                    <div style={{ width: 72, height: 72, borderRadius: 14, background: "#f3f3f3", border: "1px solid #eee", display: "grid", placeItems: "center", color: "#777", fontWeight: 900 }}>
                      1
                    </div>
                  )}

                  {p.photo2 ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photo2} alt="photo2" style={{ width: 72, height: 72, borderRadius: 14, objectFit: "cover", border: "1px solid #eee" }} />
                  ) : (
                    <div style={{ width: 72, height: 72, borderRadius: 14, background: "#f3f3f3", border: "1px solid #eee", display: "grid", placeItems: "center", color: "#777", fontWeight: 900 }}>
                      2
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section style={{ marginTop: 14 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={async () => {
                setLoading(true);
                try {
                  await loadReports();
                } finally {
                  setLoading(false);
                }
              }}
              style={{ padding: "0.7rem 0.9rem", borderRadius: 12, border: "1px solid #ccc", background: "white" }}
            >
              Refresh reports
            </button>
          </div>

          <div style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 16, overflow: "hidden" }}>
            <div style={{ padding: 12, background: "#fafafa", borderBottom: "1px solid #eee", fontWeight: 900 }}>
              Reports ({reports.length})
            </div>

            {reports.map((r) => (
              <div key={r.id} style={{ padding: 12, borderBottom: "1px solid #f1f1f1", display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>
                      {r.reason}{" "}
                      <span style={{ color: "#777", fontWeightl>
                      </span>
                    </div>
                    <div style={{ color: "#777", fontSize: 12 }}>
                      report_id: <code>{r.id}</code> • status: <b>{r.status}</b> • {r.created_at}
                    </div>
                    <div style={{ color: "#777", fontSize: 12 }}>
                      reporter: <code>{r.reporter_user_id}</code> • reported: <code>{r.reported_user_id}</code> • profile:{" "}
                      <code>{r.reported_profile_id || ""}</code>
                    </div>
                    {r.details ? <div style={{ marginTop: 6, color: "#555", whiteSpace: "pre-wrap" }}>{r.details}</div> : null}
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {["open", "reviewing", "resolved", "dismissed"].map((st) => (
                      <button
                        key={st}
                        onClick={() => updateReportStatus(r.id, st)}
                        style={{
                          padding: "0.55rem 0.8rem",
                          borderRadius: 10,
                          border: "1px solid #ccc",
                          background: r.status === st ? "#111" : "white",
                          color: r.status === st ? "white" : "#111",
                          fontWeight: 800,
                        }}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

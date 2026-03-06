"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

type AdminProfileRow = {
  profile_id: string;
  owner_user_id: string;

  displayName: string;
  age: number;
  city: string;
  stateUS: string;

  // ✅ Added optional fields for “full profile edit”
  identityPreview?: string | null;
  intention?: string | null;
  tags?: string[] | null;

  photo?: string | null;
  photo2?: string | null;

  isAvailable: boolean;

  is_banned?: boolean;
  banned_reason?: string | null;

  likes_count?: number;
  saved_count?: number;
  threads_count?: number;
};

type AdminProfilesResponse = {
  items: AdminProfileRow[];
};

type ReportItem = {
  id: string;
  created_at: string;
  reporter_user_id: string;
  reported_user_id?: string | null;
  profile_id?: string | null;
  reported_profile_id?: string | null;
  thread_id?: string | null;
  message_id?: string | null;
  category: string;
  reason: string;
  details?: string | null;
  status: string;
};

async function safeReadErrorDetail(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (j?.detail) return String(j.detail);
    if (j?.message) return String(j.message);
  } catch {}
  try {
    const t = await res.text();
    if (t) return t;
  } catch {}
  return `Request failed (${res.status}).`;
}

function getAdminToken(): string {
  if (typeof window === "undefined") return "";
  const keys = ["bw_admin_token", "admin_token", "bw_admin_session", "bw_admin_key"];
  for (const k of keys) {
    const v = window.localStorage.getItem(k);
    if (v && v.trim()) return v.trim();
  }
  return "";
}

function setAdminToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("bw_admin_token", token);
}

function clearAdminToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("bw_admin_token");
  window.localStorage.removeItem("admin_token");
  window.localStorage.removeItem("bw_admin_session");
  window.localStorage.removeItem("bw_admin_key");
}

function buildAdminHeaders(token: string): Record<string, string> {
  const t = (token || "").trim();
  return {
    "Content-Type": "application/json",
    "X-Admin-Token": t,
    Authorization: `Bearer ${t}`,
  };
}

// ---- Admin API helpers ----

async function apiAdminListProfiles(token: string): Promise<AdminProfileRow[]> {
  const res = await fetch(`${API_BASE}/admin/profiles?limit=200`, {
    method: "GET",
    headers: buildAdminHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await safeReadErrorDetail(res));
  const json = (await res.json()) as AdminProfilesResponse;
  return Array.isArray(json?.items) ? json.items : [];
}

async function apiAdminMe(token: string) {
  const res = await fetch(`${API_BASE}/admin/me`, {
    method: "GET",
    headers: buildAdminHeaders(token),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(await safeReadErrorDetail(res));
  return res.json() as Promise<{ email: string; role: "admin" | "moderator" }>;
}

// ✅ Expanded patch body to support full profile edits
type AdminProfilePatchBody = {
  // existing
  isAvailable?: boolean;
  is_banned?: boolean;
  banned_reason?: string | null;

  // profile fields
  displayName?: string;
  age?: number;
  city?: string;
  stateUS?: string;

  intention?: string | null;
  identityPreview?: string | null;
  tags?: string[];

  photo?: string | null;
  photo2?: string | null;
};

async function apiAdminPatchProfile(token: string, profile_id: string, body: AdminProfilePatchBody) {
  const res = await fetch(`${API_BASE}/admin/profiles/${encodeURIComponent(profile_id)}`, {
    method: "PATCH",
    headers: buildAdminHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await safeReadErrorDetail(res));
  return res.json().catch(() => ({}));
}

async function apiAdminSetAvailable(token: string, profile_id: string, isAvailable: boolean) {
  return apiAdminPatchProfile(token, profile_id, { isAvailable });
}

async function apiAdminRemovePhoto(token: string, profile_id: string, slot: 1 | 2) {
  const res = await fetch(`${API_BASE}/admin/profiles/${encodeURIComponent(profile_id)}/clear-photo`, {
    method: "POST",
    headers: buildAdminHeaders(token),
    body: JSON.stringify({ slot }),
  });
  if (!res.ok) throw new Error(await safeReadErrorDetail(res));
  return res.json().catch(() => ({}));
}

async function apiAdminUploadPhoto(
  token: string,
  profile_id: string,
  slot: 1 | 2,
  file: File
): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append("slot", String(slot));
  fd.append("file", file);

  const res = await fetch(
    `${API_BASE}/admin/profiles/${encodeURIComponent(profile_id)}/upload-photo`,
    {
      method: "POST",
      headers: {
        // IMPORTANT: do NOT set Content-Type when using FormData
        "X-Admin-Token": token,
        Authorization: `Bearer ${token}`,
      },
      body: fd,
    }
  );

  if (!res.ok) throw new Error(await safeReadErrorDetail(res));
  return res.json();
}
async function apiAdminBan(token: string, profile_id: string, banned: boolean, reason?: string) {
  return apiAdminPatchProfile(token, profile_id, {
    is_banned: banned,
    banned_reason: banned ? (reason || "").trim() || null : null,
  });
}

async function apiAdminSendMessage(token: string, user_id: string, subject: string, body: string) {
  const res = await fetch(`${API_BASE}/admin/messages/send`, {
    method: "POST",
    headers: buildAdminHeaders(token),
    body: JSON.stringify({
      user_id,
      subject,
      body,
    }),
  });
  if (!res.ok) throw new Error(await safeReadErrorDetail(res));
  return res.json().catch(() => ({}));
}

// ---- Reports API helpers ----

async function apiAdminReportsCount(adminToken: string) {
  const res = await fetch(`${API_BASE}/admin/reports/counts`, {
    headers: {
      "X-Admin-Token": adminToken,
      Authorization: `Bearer ${adminToken}`,
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await safeReadErrorDetail(res));
  return res.json() as Promise<{ open: number; resolved: number }>;
}

async function apiAdminResolveReport(adminToken: string, reportId: string, note?: string) {
  const res = await fetch(`${API_BASE}/admin/reports/${reportId}/resolve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Token": adminToken,
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ note: note || "" }),
  });
  if (!res.ok) throw new Error(await safeReadErrorDetail(res));
}

// ---- tiny helpers ----
function tagsToString(tags: any): string {
  if (!Array.isArray(tags)) return "";
  return tags.filter(Boolean).join(", ");
}
function parseTags(s: string): string[] {
  return (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 40);
}
function normalizeUrl(s: string): string {
  const v = (s || "").trim();
  if (!v) return "";
  return v;
}

export default function AdminDashboardPage() {
  const router = useRouter();

  const [token, setToken] = useState<string>("");
  const [tokenInput, setTokenInput] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AdminProfileRow[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [workingId, setWorkingId] = useState<string | null>(null);

  // ✅ Message modal state
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgTargetProfile, setMsgTargetProfile] = useState<AdminProfileRow | null>(null);
  const [msgText, setMsgText] = useState("");
  const [msgSending, setMsgSending] = useState(false);
  const [msgSubject, setMsgSubject] = useState("Admin message");

  // ✅ Edit modal state (Option A)
  const [editOpen, setEditOpen] = useState(false);
  const [editTargetProfile, setEditTargetProfile] = useState<AdminProfileRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [editDisplayName, setEditDisplayName] = useState("");
  const [editAge, setEditAge] = useState<string>("");
  const [editCity, setEditCity] = useState("");
  const [editStateUS, setEditStateUS] = useState("");
  const [editIsAvailable, setEditIsAvailable] = useState(true);

  // ✅ new editable fields
  const [editIntention, setEditIntention] = useState("");
  const [editIdentityPreview, setEditIdentityPreview] = useState("");
  const [editTags, setEditTags] = useState(""); // comma separated
  const [editPhoto, setEditPhoto] = useState("");
  const [editPhoto2, setEditPhoto2] = useState("");

  const [uploadingSlot, setUploadingSlot] = useState<null | 1 | 2>(null);
  const fileInputP1Ref = useRef<HTMLInputElement | null>(null);
  const fileInputP2Ref = useRef<HTMLInputElement | null>(null);
  
  // ---- Reports state + polling ----
  const [reportCounts, setReportCounts] = useState<{ open: number; resolved: number }>({
    open: 0,
    resolved: 0,
  });
  const [openReports, setOpenReports] = useState<ReportItem[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const reportsLoadingRef = useRef(false);

  const adminToken = token;

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }

  useEffect(() => {
    const t = getAdminToken();
    if (!t) {
      router.replace("/admin/login");
      return;
    }

    (async () => {
      try {
        const me = await apiAdminMe(t);
        setToken(t);
        setTokenInput(t);
        showToast(`Signed in as ${me.email} (${me.role})`);
      } catch {
        clearAdminToken();
        router.replace("/admin/login");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function refresh(tOverride?: string) {
    const t = (tOverride ?? token).trim();
    if (!t) return;

    setLoading(true);
    setApiError(null);

    try {
      const rows = await apiAdminListProfiles(t);
      setItems(rows);
    } catch (e: any) {
      setApiError(e?.message || "Failed to load admin data.");

      const msg = String(e?.message || "");
      if (msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("forbidden")) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }
    } finally {
      setLoading(false);
    }
  }

  async function refreshReports() {
    if (reportsLoadingRef.current) return;
    reportsLoadingRef.current = true;

    setReportsLoading(true);
    setReportsError(null);

    try {
      const t = (adminToken || "").trim();
      if (!t) return;

      const res = await fetch(`${API_BASE}/admin/report-alerts`, {
        method: "GET",
        headers: buildAdminHeaders(t),
        cache: "no-store",
      });

      if (!res.ok) throw new Error(await safeReadErrorDetail(res));
      const data = await res.json();

      setReportCounts((prev) => ({
        open: typeof data?.openCount === "number" ? data.openCount : prev.open,
        resolved: prev.resolved,
      }));

      setOpenReports(Array.isArray(data?.recent) ? data.recent : []);
    } catch (e: any) {
      setReportsError(e?.message || "Failed to refresh reports.");
    } finally {
      setReportsLoading(false);
      reportsLoadingRef.current = false;
    }
  }

  async function refreshReportCountsOnly() {
    const t = (adminToken || "").trim();
    if (!t) return;
    try {
      const counts = await apiAdminReportsCount(t);
      setReportCounts(counts);
    } catch {
      // keep quiet
    }
  }

  useEffect(() => {
    if (!token) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!adminToken) return;

    refreshReportCountsOnly();
    refreshReports();

    const t = window.setInterval(() => {
      refreshReportCountsOnly();
      refreshReports();
    }, 10000);

    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) => {
      return (
        (p.displayName || "").toLowerCase().includes(q) ||
        (p.city || "").toLowerCase().includes(q) ||
        (p.stateUS || "").toLowerCase().includes(q) ||
        (p.owner_user_id || "").toLowerCase().includes(q) ||
        (p.profile_id || "").toLowerCase().includes(q)
      );
    });
  }, [items, query]);

  const stats = useMemo(() => {
    const total = items.length;
    const available = items.filter((x) => x.isAvailable).length;
    const banned = items.filter((x) => x.is_banned).length;
    return { total, available, banned };
  }, [items]);

  const card: React.CSSProperties = {
    border: "1px solid #eee",
    borderRadius: 14,
    padding: "1.1rem",
    background: "white",
  };

  const btn: React.CSSProperties = {
    padding: "0.5rem 0.75rem",
    borderRadius: 10,
    border: "1px solid #ccc",
    background: "white",
    cursor: "pointer",
    fontWeight: 700,
  };

  const dangerBtn: React.CSSProperties = {
    ...btn,
    border: "1px solid #f0c9c9",
    background: "#fff7f7",
  };

  const primaryBtn: React.CSSProperties = {
    ...btn,
    border: "1px solid #111",
    background: "#111",
    color: "white",
  };

  function openEditModal(p: AdminProfileRow) {
    setEditTargetProfile(p);

    setEditDisplayName(p.displayName || "");
    setEditAge(String(p.age ?? ""));
    setEditCity(p.city || "");
    setEditStateUS(p.stateUS || "");
    setEditIsAvailable(!!p.isAvailable);

    setEditIntention((p.intention || "").trim());
    setEditIdentityPreview((p.identityPreview || "").trim());
    setEditTags(tagsToString(p.tags));
    setEditPhoto((p.photo || "").trim());
    setEditPhoto2((p.photo2 || "").trim());

    setEditOpen(true);
  }

  async function saveEditModal() {
    if (!editTargetProfile) return;

    const profileId = editTargetProfile.profile_id;

    const displayName = editDisplayName.trim();
    const city = editCity.trim();
    const stateUS = editStateUS.trim().toUpperCase();
    const intention = editIntention.trim();
    const identityPreview = editIdentityPreview.trim();
    const tags = parseTags(editTags);
    const photo = normalizeUrl(editPhoto);
    const photo2 = normalizeUrl(editPhoto2);

    const parsedAge = Number(editAge);
    if (!displayName) return alert("Please enter a display name.");
    if (!Number.isFinite(parsedAge) || parsedAge <= 0 || parsedAge > 120) return alert("Please enter a valid age.");
    if (!city) return alert("Please enter a city.");
    if (!stateUS) return alert("Please enter a state (ex: GA, CA).");

    try {
      setEditSaving(true);
      setApiError(null);

      await apiAdminPatchProfile(token, profileId, {
        displayName,
        age: parsedAge,
        city,
        stateUS,
        isAvailable: editIsAvailable,

        intention: intention || null,
        identityPreview: identityPreview || null,
        tags,

        // photo URLs (optional)
        photo: photo || null,
        photo2: photo2 || null,
      });

      showToast("Profile updated.");
      setEditOpen(false);
      setEditTargetProfile(null);
      await refresh();
    } catch (e: any) {
      const msg = e?.message || "Failed to update profile.";
      setApiError(msg);
      alert(msg);
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <>
      <main
        style={{
          minHeight: "100vh",
          padding: "2rem",
          background: "#fff",
          display: "grid",
          placeItems: "start center",
        }}
      >
        <div style={{ width: "100%", maxWidth: 1100 }}>
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
              <h1 style={{ fontSize: "2.2rem", marginBottom: 6 }}>Admin Dashboard</h1>
              <div style={{ color: "#666" }}>
                Profiles: <b>{stats.total}</b> • Visible: <b>{stats.available}</b> • Banned: <b>{stats.banned}</b>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/discover" style={{ ...btn, textDecoration: "none", color: "inherit" }}>
                Discover
              </Link>
              <Link href="/profile" style={{ ...btn, textDecoration: "none", color: "inherit" }}>
                My Profile
              </Link>

              <Link
                href="/admin/users/create-free"
                style={{
                  padding: "8px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 10,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Create Free User
              </Link>

              <Link
                href="/admin/reports"
                style={{
                  padding: "8px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 10,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                View Reports
              </Link>

              <button type="button" style={btn} onClick={() => refresh()} disabled={loading}>
                {loading ? "Loading..." : "Refresh"}
              </button>

              <button
                type="button"
                style={dangerBtn}
                onClick={() => {
                  clearAdminToken();
                  showToast("Signed out.");
                  router.replace("/admin/login");
                }}
              >
                Sign out
              </button>
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
              <b>Admin API notice:</b> {apiError}
            </div>
          )}

          {toast && (
            <div
              style={{
                marginTop: "0.9rem",
                padding: "0.75rem",
                borderRadius: 10,
                border: "1px solid #cfe7cf",
                background: "#f6fff6",
              }}
            >
              {toast}
            </div>
          )}

          {/* -------- Reports card -------- */}
          <div style={{ border: "1px solid #eee", borderRadius: 16, padding: "1rem", marginTop: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>Reports</div>
                <div style={{ color: "#666", marginTop: 4 }}>
                  Open: <b>{reportCounts.open}</b> • Resolved: <b>{reportCounts.resolved}</b>
                </div>
                {reportsError ? <div style={{ marginTop: 8, color: "#b00020", fontWeight: 700 }}>{reportsError}</div> : null}
              </div>

              <button
                onClick={(e) => {
                  e.preventDefault();
                  refreshReports();
                }}
                disabled={reportsLoading}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: reportsLoading ? "#f3f3f3" : "white",
                  cursor: reportsLoading ? "not-allowed" : "pointer",
                  fontWeight: 700,
                }}
              >
                {reportsLoading ? "Refreshing..." : "Refresh reports"}
              </button>
            </div>

            {openReports.length > 0 ? (
              <div style={{ marginTop: 12, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#666", fontSize: 12 }}>
                      <th style={{ padding: "10px 8px" }}>When</th>
                      <th style={{ padding: "10px 8px" }}>Category</th>
                      <th style={{ padding: "10px 8px" }}>Reason</th>
                      <th style={{ padding: "10px 8px" }}>Target</th>
                      <th style={{ padding: "10px 8px" }}>Details</th>
                      <th style={{ padding: "10px 8px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {openReports.map((r) => (
                      <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
                        <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>{new Date(r.created_at).toLocaleString()}</td>
                        <td style={{ padding: "10px 8px" }}>{r.category}</td>
                        <td style={{ padding: "10px 8px" }}>{r.reason}</td>
                        <td style={{ padding: "10px 8px", fontSize: 12, color: "#444" }}>
                          {r.reported_user_id ? (
                            <>
                              user: <b>{r.reported_user_id}</b>
                            </>
                          ) : null}
                          {r.reported_profile_id ? (
                            <div>
                              profile: <b>{r.reported_profile_id}</b>
                            </div>
                          ) : null}
                          {r.thread_id ? (
                            <div>
                              thread: <b>{r.thread_id}</b>
                            </div>
                          ) : null}
                          {r.message_id ? (
                            <div>
                              msg: <b>{r.message_id}</b>
                            </div>
                          ) : null}
                        </td>
                        <td style={{ padding: "10px 8px", maxWidth: 420 }}>
                          <div style={{ fontSize: 12, color: "#333", whiteSpace: "pre-wrap" }}>{r.details || "—"}</div>
                        </td>
                        <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
                          <button
                            onClick={async () => {
                              const note = window.prompt("Resolve note (optional):", "");
                              try {
                                await apiAdminResolveReport(adminToken, r.id, note || "");
                                await refreshReports();
                                await refreshReportCountsOnly();
                              } catch (e: any) {
                                alert(e?.message || "Resolve failed");
                              }
                            }}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #ddd",
                              background: "white",
                              fontWeight: 800,
                              cursor: "pointer",
                            }}
                          >
                            Resolve
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ marginTop: 12, color: "#666" }}>No open reports 🎉</div>
            )}
          </div>

          <div style={{ ...card, marginTop: "1.25rem" }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Admin Token (stored locally)</div>
            <div style={{ color: "#666", fontSize: 13, marginBottom: 10 }}>
              This page sends your token as <code>X-Admin-Token</code> and <code>Authorization</code>.
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Admin token…"
                style={{
                  flex: 1,
                  minWidth: 280,
                  padding: "0.65rem 0.75rem",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                }}
              />
              <button
                type="button"
                style={btn}
                onClick={() => {
                  const t = tokenInput.trim();
                  if (!t) return;
                  setAdminToken(t);
                  setToken(t);
                  showToast("Token updated.");
                }}
              >
                Save token
              </button>
            </div>
          </div>

          <div style={{ ...card, marginTop: "1.25rem" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontWeight: 800 }}>Profiles</div>
              <div style={{ flex: 1 }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, city, state, user_id, profile_id…"
                style={{
                  width: 420,
                  maxWidth: "100%",
                  padding: "0.65rem 0.75rem",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                }}
              />
            </div>

            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: "left" }}>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid #eee" }}>User</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid #eee" }}>Profile</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid #eee" }}>Visible</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid #eee" }}>Photos</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid #eee" }}>Activity</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid #eee" }}>Ban</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid #eee" }}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((p) => {
                    const busy = workingId === p.profile_id;
                    const likes = p.likes_count ?? 0;
                    const saved = p.saved_count ?? 0;
                    const threads = p.threads_count ?? 0;

                    return (
                      <tr
                        key={p.profile_id}
                        id={`profile-row-${p.profile_id}`}
                      >
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3" }}>
                          <div style={{ fontWeight: 800 }}>{p.displayName}</div>
                          <div style={{ color: "#666", fontSize: 12 }}>{p.owner_user_id}</div>
                        </td>

                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3" }}>
                          <div>
                            {p.age}, {p.city}, {p.stateUS}
                          </div>
                          <div style={{ color: "#666", fontSize: 12 }}>{p.profile_id}</div>
                          {p.is_banned ? (
                            <div style={{ color: "#7a2d2d", fontSize: 12, marginTop: 4 }}>
                              <b>BANNED</b>
                              {p.banned_reason ? ` — ${p.banned_reason}` : ""}
                            </div>
                          ) : null}
                        </td>

                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3" }}>
                          <button
                            type="button"
                            style={{
                              ...btn,
                              border: "1px solid #111",
                              background: p.isAvailable ? "#111" : "white",
                              color: p.isAvailable ? "white" : "#111",
                              opacity: busy ? 0.7 : 1,
                              cursor: busy ? "not-allowed" : "pointer",
                            }}
                            disabled={busy}
                            onClick={async () => {
                              try {
                                setApiError(null);
                                setWorkingId(p.profile_id);
                                await apiAdminSetAvailable(token, p.profile_id, !p.isAvailable);
                                showToast(p.isAvailable ? "Hidden in Discover." : "Shown in Discover.");
                                await refresh();
                              } catch (e: any) {
                                setApiError(e?.message || "Could not update availability.");
                              } finally {
                                setWorkingId(null);
                              }
                            }}
                          >
                            {p.isAvailable ? "Visible" : "Hidden"}
                          </button>
                        </td>

                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3" }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            {p.photo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={p.photo}
                                alt="p1"
                                style={{
                                  width: 42,
                                  height: 42,
                                  borderRadius: 10,
                                  objectFit: "cover",
                                  border: "1px solid #eee",
                                }}
                              />
                            ) : (
                              <div style={{ width: 42, height: 42, borderRadius: 10, border: "1px dashed #ccc" }} />
                            )}

                            {p.photo2 ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={p.photo2}
                                alt="p2"
                                style={{
                                  width: 42,
                                  height: 42,
                                  borderRadius: 10,
                                  objectFit: "cover",
                                  border: "1px solid #eee",
                                }}
                              />
                            ) : (
                              <div style={{ width: 42, height: 42, borderRadius: 10, border: "1px dashed #ccc" }} />
                            )}
                          </div>

                          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              style={dangerBtn}
                              disabled={busy || !p.photo}
                              onClick={async () => {
                                const ok = window.confirm("Remove Photo 1 from this profile?");
                                if (!ok) return;

                                try {
                                  setApiError(null);
                                  setWorkingId(p.profile_id);
                                  await apiAdminRemovePhoto(token, p.profile_id, 1);
                                  showToast("Photo 1 removed.");
                                  await refresh();
                                } catch (e: any) {
                                  setApiError(e?.message || "Could not remove photo 1.");
                                } finally {
                                  setWorkingId(null);
                                }
                              }}
                            >
                              Remove P1
                            </button>

                            <button
                              type="button"
                              style={dangerBtn}
                              disabled={busy || !p.photo2}
                              onClick={async () => {
                                const ok = window.confirm("Remove Photo 2 from this profile?");
                                if (!ok) return;

                                try {
                                  setApiError(null);
                                  setWorkingId(p.profile_id);
                                  await apiAdminRemovePhoto(token, p.profile_id, 2);
                                  showToast("Photo 2 removed.");
                                  await refresh();
                                } catch (e: any) {
                                  setApiError(e?.message || "Could not remove photo 2.");
                                } finally {
                                  setWorkingId(null);
                                }
                              }}
                            >
                              Remove P2
                            </button>
                          </div>
                        </td>

                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3" }}>
                          <div style={{ color: "#333" }}>
                            Likes: <b>{likes}</b>
                          </div>
                          <div style={{ color: "#333" }}>
                            Saved: <b>{saved}</b>
                          </div>
                          <div style={{ color: "#333" }}>
                            Threads: <b>{threads}</b>
                          </div>
                        </td>

                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3" }}>
                          <button
                            type="button"
                            style={p.is_banned ? btn : dangerBtn}
                            disabled={busy}
                            onClick={async () => {
                              try {
                                setApiError(null);
                                setWorkingId(p.profile_id);

                                if (!p.is_banned) {
                                  const reason =
                                    window.prompt("Ban reason (optional):", "Violation of community guidelines") || "";
                                  await apiAdminBan(token, p.profile_id, true, reason);
                                  showToast("User banned.");
                                } else {
                                  const ok = window.confirm("Unban this user?");
                                  if (!ok) return;
                                  await apiAdminBan(token, p.profile_id, false, "");
                                  showToast("User unbanned.");
                                }

                                await refresh();
                              } catch (e: any) {
                                setApiError(e?.message || "Could not update ban.");
                              } finally {
                                setWorkingId(null);
                              }
                            }}
                          >
                            {p.is_banned ? "Unban" : "Ban"}
                          </button>
                        </td>

                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3" }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              style={btn}
                              disabled={busy}
                              onClick={() => {
                                setMsgTargetProfile(p);
                                setMsgText("");
                                setMsgSubject("Admin message");
                                setMsgOpen(true);
                              }}
                            >
                              Message
                            </button>

                            <button type="button" style={btn} disabled={busy} onClick={() => openEditModal(p)}>
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {!loading && filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: "14px 8px", color: "#666" }}>
                        No results.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {loading ? <div style={{ marginTop: 12, color: "#666" }}>Loading…</div> : null}
          </div>

          <div style={{ marginTop: "1rem", color: "#777", fontSize: 12 }}>
            If any button errors, paste the exact endpoint error message and we’ll align instantly.
          </div>
        </div>
      </main>

      {/* ✅ Edit Modal (Option A) */}
      {editOpen && editTargetProfile ? (
        <div
          onClick={() => {
            if (editSaving) return;
            setEditOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "grid",
            placeItems: "center",
            padding: 20,
            zIndex: 60,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 760,
              background: "white",
              borderRadius: 16,
              border: "1px solid #eee",
              padding: 16,
              boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>Edit Profile</div>
                <div style={{ color: "#666", fontSize: 13, marginTop: 6 }}>
                  Profile: <code>{editTargetProfile.profile_id}</code>
                  <div style={{ marginTop: 4 }}>
                    User ID: <code>{editTargetProfile.owner_user_id}</code>
                  </div>
                </div>
              </div>

              <button type="button" style={dangerBtn} onClick={() => setEditOpen(false)} disabled={editSaving}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 12, color: "#333", marginBottom: 6 }}>Display Name</div>
                <input
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ccc", fontSize: 14 }}
                />
              </div>

              <div>
                <div style={{ fontWeight: 800, fontSize: 12, color: "#333", marginBottom: 6 }}>Age</div>
                <input
                  value={editAge}
                  onChange={(e) => setEditAge(e.target.value)}
                  inputMode="numeric"
                  style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ccc", fontSize: 14 }}
                />
              </div>

              <div>
                <div style={{ fontWeight: 800, fontSize: 12, color: "#333", marginBottom: 6 }}>City</div>
                <input
                  value={editCity}
                  onChange={(e) => setEditCity(e.target.value)}
                  style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ccc", fontSize: 14 }}
                />
              </div>

              <div>
                <div style={{ fontWeight: 800, fontSize: 12, color: "#333", marginBottom: 6 }}>State (ex: GA)</div>
                <input
                  value={editStateUS}
                  onChange={(e) => setEditStateUS(e.target.value)}
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 12,
                    border: "1px solid #ccc",
                    fontSize: 14,
                    textTransform: "uppercase",
                  }}
                />
              </div>

              <div>
                <div style={{ fontWeight: 800, fontSize: 12, color: "#333", marginBottom: 6 }}>Intention</div>
                <input
                  value={editIntention}
                  onChange={(e) => setEditIntention(e.target.value)}
                  placeholder="ex: Conscious companionship"
                  style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ccc", fontSize: 14 }}
                />
              </div>

              <div>
                <div style={{ fontWeight: 800, fontSize: 12, color: "#333", marginBottom: 6 }}>Tags (comma separated)</div>
                <input
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="ex: African-Centered, Spiritual, Conscious"
                  style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ccc", fontSize: 14 }}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontWeight: 800, fontSize: 12, color: "#333", marginBottom: 6 }}>Identity Preview</div>
                <textarea
                  value={editIdentityPreview}
                  onChange={(e) => setEditIdentityPreview(e.target.value)}
                  placeholder="Short identity description shown on Discover…"
                  style={{
                    width: "100%",
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #ccc",
                    fontSize: 14,
                    minHeight: 90,
                    resize: "vertical",
                  }}
                />
              </div>

              {/* ---------- Photos (P1 + P2) ---------- */}
<div>
  <div style={{ fontWeight: 800, fontSize: 12, color: "#333", marginBottom: 6 }}>Photo 1</div>

  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
    <input
      value={editPhoto}
      onChange={(e) => setEditPhoto(e.target.value)}
      placeholder="https://… (or use Upload)"
      style={{
        flex: 1,
        minWidth: 220,
        padding: 10,
        borderRadius: 12,
        border: "1px solid #ccc",
        fontSize: 14,
      }}
    />

    <input
      ref={fileInputP1Ref}
      type="file"
      accept="image/*"
      style={{ display: "none" }}
      onChange={async (e) => {
        const f = e.target.files?.[0];
        if (!f || !editTargetProfile) return;

        try {
          setUploadingSlot(1);
          const out = await apiAdminUploadPhoto(token, editTargetProfile.profile_id, 1, f);
          if (!out?.url) throw new Error("Upload succeeded but no url returned.");
          setEditPhoto(out.url);
          showToast("Photo 1 uploaded.");
        } catch (err: any) {
          alert(err?.message || "Photo 1 upload failed.");
        } finally {
          setUploadingSlot(null);
          if (fileInputP1Ref.current) fileInputP1Ref.current.value = "";
        }
      }}
    />

    <button
      type="button"
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid #ddd",
        background: uploadingSlot === 1 ? "#f3f3f3" : "white",
        cursor: uploadingSlot === 1 ? "not-allowed" : "pointer",
        fontWeight: 800,
      }}
      disabled={editSaving || uploadingSlot !== null}
      onClick={() => fileInputP1Ref.current?.click()}
    >
      {uploadingSlot === 1 ? "Uploading..." : "Upload P1"}
    </button>
  </div>

  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
    <button
      type="button"
      style={dangerBtn}
      disabled={editSaving || !editTargetProfile.photo}
      onClick={async () => {
        const ok = window.confirm("Remove Photo 1 from this profile?");
        if (!ok) return;
        try {
          await apiAdminRemovePhoto(token, editTargetProfile.profile_id, 1);
          setEditPhoto("");
          showToast("Photo 1 removed.");
          await refresh();
        } catch (e: any) {
          alert(e?.message || "Could not remove photo 1.");
        }
      }}
    >
      Remove P1
    </button>
  </div>
</div>

<div style={{ marginTop: 14 }}>
  <div style={{ fontWeight: 800, fontSize: 12, color: "#333", marginBottom: 6 }}>Photo 2</div>

  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
    <input
      value={editPhoto2}
      onChange={(e) => setEditPhoto2(e.target.value)}
      placeholder="https://… (or use Upload)"
      style={{
        flex: 1,
        minWidth: 220,
        padding: 10,
        borderRadius: 12,
        border: "1px solid #ccc",
        fontSize: 14,
      }}
    />

    <input
      ref={fileInputP2Ref}
      type="file"
      accept="image/*"
      style={{ display: "none" }}
      onChange={async (e) => {
        const f = e.target.files?.[0];
        if (!f || !editTargetProfile) return;

        try {
          setUploadingSlot(2);
          const out = await apiAdminUploadPhoto(token, editTargetProfile.profile_id, 2, f);
          if (!out?.url) throw new Error("Upload succeeded but no url returned.");
          setEditPhoto2(out.url);
          showToast("Photo 2 uploaded.");
        } catch (err: any) {
          alert(err?.message || "Photo 2 upload failed.");
        } finally {
          setUploadingSlot(null);
          if (fileInputP2Ref.current) fileInputP2Ref.current.value = "";
        }
      }}
    />

    <button
      type="button"
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid #ddd",
        background: uploadingSlot === 2 ? "#f3f3f3" : "white",
        cursor: uploadingSlot === 2 ? "not-allowed" : "pointer",
        fontWeight: 800,
      }}
      disabled={editSaving || uploadingSlot !== null}
      onClick={() => fileInputP2Ref.current?.click()}
    >
      {uploadingSlot === 2 ? "Uploading..." : "Upload P2"}
    </button>
  </div>

  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
    <button
      type="button"
      style={dangerBtn}
      disabled={editSaving || !editTargetProfile.photo2}
      onClick={async () => {
        const ok = window.confirm("Remove Photo 2 from this profile?");
        if (!ok) return;
        try {
          await apiAdminRemovePhoto(token, editTargetProfile.profile_id, 2);
          setEditPhoto2("");
          showToast("Photo 2 removed.");
          await refresh();
        } catch (e: any) {
          alert(e?.message || "Could not remove photo 2.");
        }
      }}
    >
      Remove P2
    </button>
  </div>
</div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}>
                  <input type="checkbox" checked={editIsAvailable} onChange={(e) => setEditIsAvailable(e.target.checked)} />
                  <span style={{ fontWeight: 900, color: "#111" }}>Visible in Discover</span>
                  <span style={{ color: "#666", fontSize: 12 }}>(Turning this off hides them from Discover.)</span>
                </label>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
              <button
                type="button"
                style={btn}
                onClick={() => {
                  if (!editTargetProfile || editSaving) return;
                  openEditModal(editTargetProfile);
                }}
                disabled={editSaving}
              >
                Reset
              </button>

              <button type="button" style={primaryBtn} onClick={saveEditModal} disabled={editSaving}>
                {editSaving ? "Saving..." : "Save changes"}
              </button>
            </div>

            <div style={{ marginTop: 10, color: "#777", fontSize: 12 }}>Tip: click outside this box to close.</div>
          </div>
        </div>
      ) : null}

      {/* ✅ Message Modal */}
      {msgOpen && msgTargetProfile ? (
        <div
          onClick={() => setMsgOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "grid",
            placeItems: "center",
            padding: 20,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 560,
              background: "white",
              borderRadius: 16,
              border: "1px solid #eee",
              padding: 16,
              boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>Send Admin Message</div>
                <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
                  To: <b>{msgTargetProfile.displayName}</b>
                  <div style={{ marginTop: 4 }}>
                    User ID: <code>{msgTargetProfile.owner_user_id}</code>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    Profile: <code>{msgTargetProfile.profile_id}</code>
                  </div>
                </div>
              </div>

              <button type="button" style={dangerBtn} onClick={() => setMsgOpen(false)}>
                Close
              </button>
            </div>

            <input
              value={msgSubject}
              onChange={(e) => setMsgSubject(e.target.value)}
              placeholder="Subject…"
              style={{ width: "100%", marginTop: 12, padding: 10, borderRadius: 12, border: "1px solid #ccc", fontSize: 14 }}
            />

            <textarea
              value={msgText}
              onChange={(e) => setMsgText(e.target.value)}
              placeholder="Write your message…"
              style={{
                width: "100%",
                marginTop: 12,
                minHeight: 140,
                padding: 12,
                borderRadius: 12,
                border: "1px solid #ccc",
                resize: "vertical",
                fontSize: 14,
              }}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
              <button
                type="button"
                style={btn}
                disabled={msgSending || !msgText.trim()}
                onClick={async () => {
                  try {
                    setMsgSending(true);

                    const userId = (msgTargetProfile.owner_user_id || "").trim();
                    const subject = (msgSubject || "Admin message").trim();
                    const body = msgText.trim();

                    if (!userId) return alert("Missing user_id for this profile. Refresh the page and try again.");
                    if (!subject) return alert("Please enter a subject.");
                    if (!body) return alert("Please enter a message.");

                    await apiAdminSendMessage(token, userId, subject, body);

                    showToast("Message sent.");
                    setMsgOpen(false);
                  } catch (e: any) {
                    alert(e?.message || "Failed to send message.");
                  } finally {
                    setMsgSending(false);
                  }
                }}
              >
                {msgSending ? "Sending..." : "Send"}
              </button>
            </div>

            <div style={{ marginTop: 10, color: "#777", fontSize: 12 }}>Tip: click outside this box to close.</div>
          </div>
        </div>
      ) : null}
    </>
  );
}

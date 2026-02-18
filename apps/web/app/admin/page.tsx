"use client";

import React, { useEffect, useMemo, useState } from "react";
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

// ---- Admin API helpers (aligned to backend routes) ----

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

async function apiAdminPatchProfile(
  token: string,
  profile_id: string,
  body: { isAvailable?: boolean; is_banned?: boolean; banned_reason?: string | null }
) {
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

async function apiAdminBan(token: string, profile_id: string, banned: boolean, reason?: string) {
  return apiAdminPatchProfile(token, profile_id, {
    is_banned: banned,
    banned_reason: banned ? (reason || "").trim() || null : null,
  });
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

  // ---- Reports state + polling ----
  const [reportCounts, setReportCounts] = useState<{ open: number; resolved: number }>({
    open: 0,
    resolved: 0,
  });
  const [openReports, setOpenReports] = useState<ReportItem[]>([]);

  // ✅ REQUIRED STATES (added)
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);

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
    } catch (e: any) {
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

  // ✅ REPLACE refreshReports WITH THIS (updated to setOpenReports)
  async function refreshReports() {
  if (reportsLoading) return;
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
  }
}

  // keep counts updating (so "Open/Resolved" stays accurate)
  async function refreshReportCountsOnly() {
    const t = (adminToken || "").trim();
    if (!t) return;
    try {
      const counts = await apiAdminReportsCount(t);
      setReportCounts(counts);
    } catch (e: any) {
      // don't clobber reportsError here; keep it tied to refreshReports
    }
  }

  useEffect(() => {
    if (!token) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!adminToken) return;

    // initial
    refreshReportCountsOnly();
    refreshReports();

    // polling
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

  return (
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
              Profiles: <b>{stats.total}</b> • Visible: <b>{stats.available}</b> • Banned:{" "}
              <b>{stats.banned}</b>
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

              {/* ✅ error display (updated) */}
              {reportsError ? (
                <div style={{ marginTop: 8, color: "#b00020", fontWeight: 700 }}>{reportsError}</div>
              ) : null}
            </div>

            {/* ✅ clickable + visible loading (updated) */}
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
                      <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
                        {new Date(r.created_at).toLocaleString()}
                      </td>
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
                        <div style={{ fontSize: 12, color: "#333", whiteSpace: "pre-wrap" }}>
                          {r.details || "—"}
                        </div>
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
                </tr>
              </thead>

              <tbody>
                {filtered.map((p) => {
                  const busy = workingId === p.profile_id;
                  const likes = p.likes_count ?? 0;
                  const saved = p.saved_count ?? 0;
                  const threads = p.threads_count ?? 0;

                  return (
                    <tr key={p.profile_id}>
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
                                  window.prompt(
                                    "Ban reason (optional):",
                                    "Violation of community guidelines"
                                  ) || "";
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
                    </tr>
                  );
                })}

                {!loading && filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "14px 8px", color: "#666" }}>
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
  );
}

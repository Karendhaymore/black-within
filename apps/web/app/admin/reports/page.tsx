"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

/**
 * Change this if your public profile URL is different.
 * Examples:
 *  - `/discover/` (default below)
 *  - `/profile/`
 *  - `/profiles/`
 */
const PUBLIC_PROFILE_PATH_PREFIX = "/discover/";

type ReportItem = {
  id: string;
  created_at: string;

  reporter_user_id?: string | null;

  reported_user_id?: string | null;
  target_user_id?: string | null;

  profile_id?: string | null;
  reported_profile_id?: string | null;
  target_profile_id?: string | null;

  thread_id?: string | null;
  target_thread_id?: string | null;

  message_id?: string | null;
  target_message_id?: string | null;

  category?: string | null;
  reason?: string | null;
  details?: string | null;
  status?: string | null;

  admin_note?: string | null;
  resolved_at?: string | null;

  // Some backends include flags like this. If yours does, we'll use it.
  target_user_suspended?: boolean | null;
};

type UserAdminStatus = {
  suspended?: boolean;
  suspended_until?: string | null;
  suspended_reason?: string | null;
};

function getAdminToken(): string {
  if (typeof window === "undefined") return "";

  const keys = ["bw_admin_key", "bw_admin_token", "admin_token", "bw_admin_session"];

  for (const k of keys) {
    const v = window.localStorage.getItem(k);
    if (v && v.trim()) return v.trim();
  }
  return "";
}

function buildAdminHeaders(token: string): Record<string, string> {
  const t = (token || "").trim();
  return {
    "Content-Type": "application/json",
    "X-Admin-Token": t,
    "X-Admin-Key": t,
    Authorization: `Bearer ${t}`,
  };
}

async function safeReadErrorDetail(res: Response): Promise<string> {
  try {
    const j: any = await res.json();

    if (j?.detail) {
      if (typeof j.detail === "string") return j.detail;

      if (Array.isArray(j.detail)) {
        const lines = j.detail
          .map((d: any) => {
            const loc = Array.isArray(d?.loc) ? d.loc.join(" > ") : "";
            const msg = d?.msg || d?.message || JSON.stringify(d);
            return loc ? `${loc}: ${msg}` : String(msg);
          })
          .join("\n");
        return lines || `Request failed (${res.status}).`;
      }

      return JSON.stringify(j.detail);
    }

    if (j?.message) return String(j.message);
    if (j?.error) return String(j.error);

    return JSON.stringify(j);
  } catch {}

  try {
    const t = await res.text();
    if (t) return t;
  } catch {}

  return `Request failed (${res.status}).`;
}

/**
 * Our UI uses Open/Closed language.
 * Your backend currently uses open/resolved.
 * So: closed === resolved
 */
function normalizeRowStatus(s?: string | null): "open" | "closed" {
  const v = (s || "open").toLowerCase().trim();
  if (v === "resolved" || v === "closed") return "closed";
  return "open";
}

function pickTargetUser(r: ReportItem): string | null {
  return (r.reported_user_id || r.target_user_id || null) as any;
}

function pickTargetProfile(r: ReportItem): string | null {
  return (r.reported_profile_id || r.profile_id || r.target_profile_id || null) as any;
}

export default function AdminReportsPage() {
  const router = useRouter();

  const [token, setToken] = useState("");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [reports, setReports] = useState<ReportItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<"open" | "resolved" | "all">("open");

  const [workingId, setWorkingId] = useState<string | null>(null);

  // Admin note drafts keyed by report id
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  // Per-user suspension status (best-effort)
  const [userStatus, setUserStatus] = useState<Record<string, UserAdminStatus>>({});
  const fetchedUserIdsRef = useRef<Set<string>>(new Set());

  const openCount = useMemo(() => {
    return reports.filter((r) => normalizeRowStatus(r.status) === "open").length;
  }, [reports]);

  async function fetchReportsByStatus(t: string, status: "open" | "resolved") {
    const res = await fetch(
      `${API_BASE}/admin/reports?status=${encodeURIComponent(status)}&limit=50`,
      {
        method: "GET",
        headers: buildAdminHeaders(t),
        cache: "no-store",
      }
    );

    if (!res.ok) throw new Error(await safeReadErrorDetail(res));

    const data = await res.json().catch(() => ({}));
    const items = Array.isArray((data as any)?.items)
      ? (data as any).items
      : Array.isArray(data)
      ? data
      : [];

    return items as ReportItem[];
  }

  async function loadReports(nextStatus?: "open" | "resolved" | "all") {
    const t = token.trim();
    if (!t) return;

    const status = (nextStatus || statusFilter).trim() as "open" | "resolved" | "all";

    setLoading(true);
    setErr(null);

    try {
      let nextItems: ReportItem[] = [];

      if (status === "all") {
        const [openItems, resolvedItems] = await Promise.all([
          fetchReportsByStatus(t, "open"),
          fetchReportsByStatus(t, "resolved"),
        ]);

        nextItems = [...openItems, ...resolvedItems].sort((a, b) => {
          const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
          return bd - ad;
        });
      } else {
        nextItems = await fetchReportsByStatus(t, status);
      }

      setReports(nextItems);

      // Initialize drafts for any reports missing in noteDrafts
      setNoteDrafts((prev) => {
        const copy = { ...prev };
        for (const r of nextItems) {
          if (copy[r.id] === undefined) copy[r.id] = (r.admin_note || "").toString();
        }
        return copy;
      });

      // Best-effort: fetch suspension status for involved users
      queueFetchUserStatuses(nextItems);
    } catch (e: any) {
      setErr(e?.message || "Failed to load reports.");
      setReports([]);
    } finally {
      setLoading(false);
    }
  }

  /**
   * ✅ Re-opening enabled:
   * We call the SAME backend endpoint /resolve, but pass status=open or status=resolved.
   */
  async function setReportUiStatus(reportId: string, nextUiStatus: "open" | "closed") {
    const t = token.trim();
    if (!t) return;

    const current = reports.find((x) => x.id === reportId);
    const currentUiStatus = normalizeRowStatus(current?.status);

    if (currentUiStatus === nextUiStatus) return;

    setWorkingId(reportId);
    setErr(null);

    // optimistic UI
    setReports((prev) =>
      prev.map((x) =>
        x.id === reportId ? { ...x, status: nextUiStatus === "closed" ? "resolved" : "open" } : x
      )
    );

    try {
      const backendStatus = nextUiStatus === "closed" ? "resolved" : "open";

      const res = await fetch(`${API_BASE}/admin/reports/${encodeURIComponent(reportId)}/resolve`, {
        method: "POST",
        headers: buildAdminHeaders(t),
        body: JSON.stringify({
          status: backendStatus,
          admin_note: (noteDrafts[reportId] ?? "").toString(),
          note: (noteDrafts[reportId] ?? "").toString(), // some backends use "note"
        }),
      });

      if (!res.ok) throw new Error(await safeReadErrorDetail(res));

      await loadReports();
    } catch (e: any) {
      // revert
      setReports((prev) =>
        prev.map((x) => (x.id === reportId ? { ...x, status: current?.status ?? "open" } : x))
      );
      setErr(e?.message || "Status update failed.");
    } finally {
      setWorkingId(null);
    }
  }

  /**
   * Save admin note (without changing report status)
   * Uses the same /resolve endpoint with the current status, but updates admin_note.
   */
  async function saveAdminNote(reportId: string) {
    const t = token.trim();
    if (!t) return;

    const current = reports.find((x) => x.id === reportId);
    const currentUiStatus = normalizeRowStatus(current?.status);
    const backendStatus = currentUiStatus === "closed" ? "resolved" : "open";

    setWorkingId(reportId);
    setErr(null);

    try {
      const res = await fetch(`${API_BASE}/admin/reports/${encodeURIComponent(reportId)}/resolve`, {
        method: "POST",
        headers: buildAdminHeaders(t),
        body: JSON.stringify({
          status: backendStatus,
          admin_note: (noteDrafts[reportId] ?? "").toString(),
          note: (noteDrafts[reportId] ?? "").toString(),
        }),
      });

      if (!res.ok) throw new Error(await safeReadErrorDetail(res));

      await loadReports();
    } catch (e: any) {
      setErr(e?.message || "Saving note failed.");
    } finally {
      setWorkingId(null);
    }
  }

  /**
   * Best-effort: fetch a user's admin status so we can show Suspend vs Unsuspend.
   * If your backend doesn't have GET /admin/users/:id, this will silently fail and we’ll default to "Suspend user".
   */
  async function fetchUserAdminStatus(userId: string) {
    const t = token.trim();
    if (!t) return;

    // prevent refetch spam
    if (fetchedUserIdsRef.current.has(userId)) return;
    fetchedUserIdsRef.current.add(userId);

    try {
      const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(userId)}`, {
        method: "GET",
        headers: buildAdminHeaders(t),
        cache: "no-store",
      });

      if (!res.ok) return;

      const data: any = await res.json().catch(() => ({}));

      // Try a few common shapes
      const suspended =
        typeof data?.suspended === "boolean"
          ? data.suspended
          : typeof data?.is_suspended === "boolean"
          ? data.is_suspended
          : typeof data?.disabled === "boolean"
          ? data.disabled
          : undefined;

      const status: UserAdminStatus = {
        suspended,
        suspended_until: data?.suspended_until ?? data?.suspension_end ?? null,
        suspended_reason: data?.suspended_reason ?? data?.suspension_reason ?? null,
      };

      setUserStatus((prev) => ({ ...prev, [userId]: status }));
    } catch {
      // ignore (best-effort)
    }
  }

  function queueFetchUserStatuses(items: ReportItem[]) {
    const ids = Array.from(
      new Set(
        items
          .map((r) => pickTargetUser(r))
          .filter(Boolean)
          .map((x) => String(x))
      )
    );

    // fire-and-forget best effort
    for (const id of ids) {
      void fetchUserAdminStatus(id);
    }
  }

  /**
   * Suspend / Unsuspend actions.
   * (Requires backend routes /admin/users/:id/suspend and /admin/users/:id/unsuspend)
   */
  async function suspendUser(userId: string, reportId: string) {
    const t = token.trim();
    if (!t) return;

    const ok = window.confirm(
      `Suspend this user?\n\nUser: ${userId}\nReport: ${reportId}\n\nThey will not be able to use the app until unsuspended.`
    );
    if (!ok) return;

    setWorkingId(reportId);
    setErr(null);

    try {
      const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(userId)}/suspend`, {
        method: "POST",
        headers: buildAdminHeaders(t),
        body: JSON.stringify({
          reason: `Suspended from report ${reportId}`,
        }),
      });

      if (!res.ok) throw new Error(await safeReadErrorDetail(res));

      // Update local status immediately
      setUserStatus((prev) => ({ ...prev, [userId]: { ...(prev[userId] || {}), suspended: true } }));

      alert("User suspended.");
    } catch (e: any) {
      setErr(e?.message || "Suspend failed.");
    } finally {
      setWorkingId(null);
    }
  }

  async function unsuspendUser(userId: string, reportId: string) {
    const t = token.trim();
    if (!t) return;

    const ok = window.confirm(`Unsuspend this user?\n\nUser: ${userId}\nReport: ${reportId}`);
    if (!ok) return;

    setWorkingId(reportId);
    setErr(null);

    try {
      const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(userId)}/unsuspend`, {
        method: "POST",
        headers: buildAdminHeaders(t),
        body: JSON.stringify({
          reason: `Unsuspended from report ${reportId}`,
        }),
      });

      if (!res.ok) throw new Error(await safeReadErrorDetail(res));

      setUserStatus((prev) => ({ ...prev, [userId]: { ...(prev[userId] || {}), suspended: false } }));

      alert("User unsuspended.");
    } catch (e: any) {
      setErr(e?.message || "Unsuspend failed.");
    } finally {
      setWorkingId(null);
    }
  }

  useEffect(() => {
    const t = getAdminToken();

    if (!t) {
      router.replace("/admin/login");
      return;
    }

    setToken(t);

    (async () => {
      setLoading(true);
      try {
        const items = await fetchReportsByStatus(t, "open");
        setReports(items);
        setStatusFilter("open");
        setErr(null);

        setNoteDrafts((prev) => {
          const copy = { ...prev };
          for (const r of items) {
            if (copy[r.id] === undefined) copy[r.id] = (r.admin_note || "").toString();
          }
          return copy;
        });

        queueFetchUserStatuses(items);
      } catch (e: any) {
        setErr(e?.message || "Failed to load reports.");
        setReports([]);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const card: React.CSSProperties = {
    border: "1px solid #eee",
    borderRadius: 14,
    padding: "1.1rem",
    background: "white",
  };

  const btnBase: React.CSSProperties = {
    padding: "0.5rem 0.75rem",
    borderRadius: 10,
    border: "1px solid #ccc",
    background: "white",
    cursor: "pointer",
    fontWeight: 700,
    textDecoration: "none",
    color: "inherit",
    display: "inline-block",
  };

  const primaryBtn: React.CSSProperties = {
    ...btnBase,
    border: "1px solid #111",
    background: "#111",
    color: "white",
  };

  const dangerBtn: React.CSSProperties = {
    ...btnBase,
    border: "1px solid #f0c9c9",
    background: "#fff7f7",
  };

  const subtleBtn: React.CSSProperties = {
    ...btnBase,
    border: "1px solid #e6e6e6",
    background: "#fafafa",
    fontWeight: 800,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "white",
    fontWeight: 700,
  };

  const textareaStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 70,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "white",
    fontWeight: 600,
    resize: "vertical",
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
      <div style={{ width: "100%", maxWidth: 1200 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "2.2rem", marginBottom: 6 }}>Reports</h1>
            <div style={{ color: "#666" }}>
              Filter: <b>{statusFilter}</b> • Showing: <b>{reports.length}</b>
              {statusFilter !== "resolved" ? (
                <>
                  {" "}
                  • Open in this list: <b>{openCount}</b>
                </>
              ) : null}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Link href="/admin" style={btnBase}>
              Back to Admin
            </Link>

            <select
              value={statusFilter}
              onChange={(e) => {
                const v = e.target.value as "open" | "resolved" | "all";
                setStatusFilter(v);
                loadReports(v);
              }}
              style={inputStyle}
              disabled={loading}
            >
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="all">All</option>
            </select>

            <button type="button" style={primaryBtn} onClick={() => loadReports()} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {err ? (
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
            <b>Error:</b> {err}
          </div>
        ) : null}

        <div style={{ ...card, marginTop: "1.25rem" }}>
          {loading ? (
            <div style={{ color: "#666" }}>Loading reports…</div>
          ) : reports.length === 0 ? (
            <div style={{ color: "#666" }}>No reports found for this filter.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#666", fontSize: 12 }}>
                    <th style={{ padding: "10px 8px" }}>When</th>
                    <th style={{ padding: "10px 8px" }}>Category / Reason</th>
                    <th style={{ padding: "10px 8px" }}>Details</th>
                    <th style={{ padding: "10px 8px" }}>Target</th>
                    <th style={{ padding: "10px 8px" }}>Reporter</th>
                    <th style={{ padding: "10px 8px" }}>Admin note</th>
                    <th style={{ padding: "10px 8px" }}>Actions</th>
                    <th style={{ padding: "10px 8px" }}>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {reports.map((r) => {
                    const uiStatus = normalizeRowStatus(r.status);
                    const busy = workingId === r.id;

                    const targetUser = pickTargetUser(r);
                    const targetProfile = pickTargetProfile(r);

                    const publicProfileUrl = targetProfile
                      ? `${PUBLIC_PROFILE_PATH_PREFIX}${encodeURIComponent(targetProfile)}`
                      : null;

                    // Determine suspended state (best effort)
                    const suspendedFromRow =
                      typeof r.target_user_suspended === "boolean" ? r.target_user_suspended : undefined;
                    const suspendedFromUserStatus =
                      targetUser && typeof userStatus[targetUser]?.suspended === "boolean"
                        ? userStatus[targetUser]!.suspended
                        : undefined;

                    const isSuspended =
                      suspendedFromRow !== undefined
                        ? suspendedFromRow
                        : suspendedFromUserStatus !== undefined
                        ? suspendedFromUserStatus
                        : false;

                    const noteVal = (noteDrafts[r.id] ?? "").toString();
                    const originalNote = (r.admin_note ?? "").toString();
                    const noteDirty = noteVal !== originalNote;

                    return (
                      <tr key={r.id} style={{ borderTop: "1px solid #eee", verticalAlign: "top" }}>
                        <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
                          {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                          <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
                            status: <b>{uiStatus}</b>
                          </div>
                          <div style={{ marginTop: 6, fontSize: 11, color: "#777" }}>
                            id: <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{r.id}</span>
                          </div>
                        </td>

                        <td style={{ padding: "10px 8px" }}>
                          <div style={{ fontWeight: 900 }}>{r.category || "—"}</div>
                          <div style={{ fontSize: 12, color: "#333", marginTop: 4 }}>{r.reason || "—"}</div>
                        </td>

                        <td style={{ padding: "10px 8px", maxWidth: 520 }}>
                          <div style={{ fontSize: 12, color: "#333", whiteSpace: "pre-wrap" }}>{r.details || "—"}</div>
                        </td>

                        <td style={{ padding: "10px 8px", fontSize: 12, color: "#444" }}>
                          {targetUser ? (
                            <div>
                              user: <b>{targetUser}</b>
                              {isSuspended ? (
                                <span
                                  style={{
                                    marginLeft: 8,
                                    padding: "2px 8px",
                                    borderRadius: 999,
                                    border: "1px solid #f0c9c9",
                                    background: "#fff7f7",
                                    color: "#7a2d2d",
                                    fontWeight: 900,
                                    fontSize: 11,
                                  }}
                                  title="This is best-effort based on admin user lookup (if available)."
                                >
                                  suspended
                                </span>
                              ) : null}
                            </div>
                          ) : null}

                          {targetProfile ? (
                            <div style={{ marginTop: 6 }}>
                              profile: <b>{targetProfile}</b>
                              {publicProfileUrl ? (
                                <>
                                  {" "}
                                  •{" "}
                                  <a
                                    href={publicProfileUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ fontWeight: 900, textDecoration: "underline" }}
                                  >
                                    View profile
                                  </a>
                                </>
                              ) : null}
                            </div>
                          ) : null}
                        </td>

                        <td style={{ padding: "10px 8px", fontSize: 12, color: "#444" }}>
                          {r.reporter_user_id ? <b>{r.reporter_user_id}</b> : "—"}
                        </td>

                        {/* Admin note */}
                        <td style={{ padding: "10px 8px", minWidth: 260 }}>
                          <textarea
                            value={noteVal}
                            onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                            style={{
                              ...textareaStyle,
                              opacity: busy ? 0.8 : 1,
                            }}
                            disabled={busy}
                            placeholder="Add internal admin note…"
                          />
                          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                            <button
                              type="button"
                              style={{
                                ...primaryBtn,
                                padding: "0.45rem 0.7rem",
                                opacity: busy ? 0.7 : noteDirty ? 1 : 0.6,
                                cursor: busy ? "not-allowed" : noteDirty ? "pointer" : "not-allowed",
                              }}
                              onClick={() => saveAdminNote(r.id)}
                              disabled={busy || !noteDirty}
                              title="Save admin note"
                            >
                              Save note
                            </button>

                            {noteDirty ? <span style={{ fontSize: 12, color: "#666" }}>Unsaved changes</span> : null}
                          </div>
                        </td>

                        {/* Actions */}
                        <td style={{ padding: "10px 8px", whiteSpace: "nowrap", minWidth: 240 }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {publicProfileUrl ? (
                              <a
                                href={publicProfileUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{ ...subtleBtn, textAlign: "center" }}
                                title="Open the user’s public profile in a new tab"
                              >
                                View profile
                              </a>
                            ) : (
                              <span style={{ fontSize: 12, color: "#666" }}>—</span>
                            )}

                            {targetUser ? (
                              isSuspended ? (
                                <button
                                  type="button"
                                  style={{
                                    ...btnBase,
                                    border: "1px solid #cfe7d3",
                                    background: "#f6fff7",
                                    cursor: busy ? "not-allowed" : "pointer",
                                    opacity: busy ? 0.7 : 1,
                                  }}
                                  onClick={() => unsuspendUser(targetUser, r.id)}
                                  disabled={busy}
                                  title="Unsuspend the reported user"
                                >
                                  Unsuspend user
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  style={{
                                    ...dangerBtn,
                                    cursor: busy ? "not-allowed" : "pointer",
                                    opacity: busy ? 0.7 : 1,
                                  }}
                                  onClick={() => suspendUser(targetUser, r.id)}
                                  disabled={busy}
                                  title="Suspend the reported user"
                                >
                                  Suspend user
                                </button>
                              )
                            ) : (
                              <span style={{ fontSize: 12, color: "#666" }}>—</span>
                            )}

                            {/* Re-open action (explicit button) */}
                            {uiStatus === "closed" ? (
                              <button
                                type="button"
                                style={{
                                  ...subtleBtn,
                                  cursor: busy ? "not-allowed" : "pointer",
                                  opacity: busy ? 0.7 : 1,
                                }}
                                onClick={() => setReportUiStatus(r.id, "open")}
                                disabled={busy}
                                title="Re-open this report"
                              >
                                Re-open report
                              </button>
                            ) : (
                              <button
                                type="button"
                                style={{
                                  ...subtleBtn,
                                  cursor: busy ? "not-allowed" : "pointer",
                                  opacity: busy ? 0.7 : 1,
                                }}
                                onClick={() => setReportUiStatus(r.id, "closed")}
                                disabled={busy}
                                title="Close (resolve) this report"
                              >
                                Close report
                              </button>
                            )}
                          </div>

                          {busy ? <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>Working…</div> : null}
                        </td>

                        {/* Status (keep dropdown too) */}
                        <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
                          <select
                            value={uiStatus}
                            disabled={busy}
                            onChange={(e) => setReportUiStatus(r.id, e.target.value as "open" | "closed")}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #ddd",
                              background: "white",
                              fontWeight: 800,
                              opacity: busy ? 0.7 : 1,
                              cursor: busy ? "not-allowed" : "pointer",
                            }}
                            title="Change this report status."
                          >
                            <option value="open">Open</option>
                            <option value="closed">Closed</option>
                          </select>

                          {uiStatus === "closed" && r.resolved_at ? (
                            <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                              resolved: {new Date(r.resolved_at).toLocaleString()}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, color: "#777", fontSize: 12 }}>
          This page pulls from <code>/admin/reports</code>. Status changes + admin notes call{" "}
          <code>/admin/reports/&lt;id&gt;/resolve</code>. Suspend/unsuspend uses{" "}
          <code>/admin/users/&lt;id&gt;/suspend</code> and <code>/admin/users/&lt;id&gt;/unsuspend</code>.
        </div>
      </div>
    </main>
  );
}

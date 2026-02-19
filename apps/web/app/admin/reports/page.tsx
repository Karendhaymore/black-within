"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

type ReportItem = {
  id: string;
  created_at: string;

  reporter_user_id?: string | null;

  // Some backends use different names for the "reported" user/profile
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

  // Sometimes present on resolved items
  admin_note?: string | null;
  resolved_at?: string | null;
};

function getAdminToken(): string {
  if (typeof window === "undefined") return "";

  /**
   * ✅ Put the most likely “real” admin key first.
   * If you know EXACTLY what key name you store under, put it at the top.
   */
  const keys = [
    "bw_admin_key", // <-- common “admin key” storage name
    "bw_admin_token",
    "admin_token",
    "bw_admin_session",
  ];

  for (const k of keys) {
    const v = window.localStorage.getItem(k);
    if (v && v.trim()) return v.trim();
  }
  return "";
}

/**
 * Sends BOTH header styles so whichever your API expects will work.
 * (You’re already able to fetch reports, so auth is basically fine.)
 */
function buildAdminHeaders(token: string): Record<string, string> {
  const t = (token || "").trim();
  return {
    "Content-Type": "application/json",
    "X-Admin-Token": t,
    "X-Admin-Key": t,
    Authorization: `Bearer ${t}`,
  };
}

/**
 * ✅ Makes API error messages human-readable instead of "[object Object]"
 */
async function safeReadErrorDetail(res: Response): Promise<string> {
  // Try JSON first
  try {
    const j: any = await res.json();

    // FastAPI often returns { detail: "..." } OR { detail: [...] }
    if (j?.detail) {
      if (typeof j.detail === "string") return j.detail;

      // detail as array of validation errors
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

      // detail as object
      return JSON.stringify(j.detail);
    }

    if (j?.message) return String(j.message);
    if (j?.error) return String(j.error);

    // Fallback: stringify whole JSON
    return JSON.stringify(j);
  } catch {
    // If it wasn't JSON, try text
  }

  try {
    const t = await res.text();
    if (t) return t;
  } catch {}

  return `Request failed (${res.status}).`;
}

export default function AdminReportsPage() {
  const router = useRouter();

  const [token, setToken] = useState("");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [reports, setReports] = useState<ReportItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<"open" | "resolved" | "all">("open");

  // For nice UX when resolving
  const [workingId, setWorkingId] = useState<string | null>(null);

  const openCount = useMemo(() => {
    return reports.filter((r) => (r.status || "open").toLowerCase() === "open").length;
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
      if (status === "all") {
        // ✅ Many backends do NOT support status=all reliably.
        // So we fetch open + resolved and combine.
        const [openItems, resolvedItems] = await Promise.all([
          fetchReportsByStatus(t, "open"),
          fetchReportsByStatus(t, "resolved"),
        ]);

        // Combine & sort newest first
        const combined = [...openItems, ...resolvedItems].sort((a, b) => {
          const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
          return bd - ad;
        });

        setReports(combined);
      } else {
        const items = await fetchReportsByStatus(t, status);
        setReports(items);
      }
    } catch (e: any) {
      setErr(e?.message || "Failed to load reports.");
      setReports([]);
    } finally {
      setLoading(false);
    }
  }

  async function resolveReport(reportId: string) {
    const t = token.trim();
    if (!t) return;

    const note = window.prompt("Optional note to reporter:", "") || "";

    setWorkingId(reportId);
    setErr(null);

    try {
      /**
       * ✅ The 422 error is very likely because the backend expects "admin_note"
       * but we were sending "note".
       * So we send BOTH to be safe.
       */
      const payload =
        note.trim().length > 0
          ? { admin_note: note.trim(), note: note.trim() }
          : { admin_note: "", note: "" };

      const res = await fetch(`${API_BASE}/admin/reports/${encodeURIComponent(reportId)}/resolve`, {
        method: "POST",
        headers: buildAdminHeaders(t),
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await safeReadErrorDetail(res));

      await loadReports(); // reload current filter view
    } catch (e: any) {
      setErr(e?.message || "Resolve failed.");
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

    // Load open by default
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      setLoading(true);
      try {
        const items = await fetchReportsByStatus(t, "open");
        setReports(items);
        setStatusFilter("open");
        setErr(null);
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
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "white",
                fontWeight: 700,
              }}
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
                    <th style={{ padding: "10px 8px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => {
                    const status = (r.status || "open").toLowerCase();
                    const busy = workingId === r.id;

                    const targetUser = r.reported_user_id || r.target_user_id;
                    const targetProfile = r.reported_profile_id || r.profile_id || r.target_profile_id;
                    const targetThread = r.thread_id || r.target_thread_id;
                    const targetMessage = r.message_id || r.target_message_id;

                    return (
                      <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
                        <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
                          {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                          <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
                            status: <b>{status}</b>
                          </div>
                        </td>

                        <td style={{ padding: "10px 8px" }}>
                          <div style={{ fontWeight: 900 }}>{r.category || "—"}</div>
                          <div style={{ fontSize: 12, color: "#333", marginTop: 4 }}>
                            {r.reason || "—"}
                          </div>
                        </td>

                        <td style={{ padding: "10px 8px", maxWidth: 520 }}>
                          <div style={{ fontSize: 12, color: "#333", whiteSpace: "pre-wrap" }}>
                            {r.details || "—"}
                          </div>
                        </td>

                        <td style={{ padding: "10px 8px", fontSize: 12, color: "#444" }}>
                          {targetUser ? (
                            <div>
                              user: <b>{targetUser}</b>
                            </div>
                          ) : null}

                          {targetProfile ? (
                            <div>
                              profile: <b>{targetProfile}</b>
                            </div>
                          ) : null}

                          {targetThread ? (
                            <div>
                              thread: <b>{targetThread}</b>
                            </div>
                          ) : null}

                          {targetMessage ? (
                            <div>
                              message: <b>{targetMessage}</b>
                            </div>
                          ) : null}
                        </td>

                        <td style={{ padding: "10px 8px", fontSize: 12, color: "#444" }}>
                          {r.reporter_user_id ? <b>{r.reporter_user_id}</b> : "—"}
                        </td>

                        <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
                          {status === "open" ? (
                            <button
                              type="button"
                              style={{
                                ...(busy ? btnBase : dangerBtn),
                                cursor: busy ? "not-allowed" : "pointer",
                                opacity: busy ? 0.7 : 1,
                              }}
                              onClick={() => resolveReport(r.id)}
                              disabled={busy}
                              title="Resolve this report"
                            >
                              {busy ? "Resolving..." : "Resolve"}
                            </button>
                          ) : (
                            <span style={{ fontSize: 12, color: "#666" }}>—</span>
                          )}
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
          This page pulls from <code>/admin/reports</code>. Resolving calls{" "}
          <code>/admin/reports/&lt;id&gt;/resolve</code>.
        </div>
      </div>
    </main>
  );
}

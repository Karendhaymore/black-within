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
 * Backend uses open/resolved.
 * So: closed === resolved
 */
function normalizeRowStatus(s?: string | null): "open" | "closed" {
  const v = (s || "open").toLowerCase().trim();
  if (v === "resolved" || v === "closed") return "closed";
  return "open";
}

export default function AdminReportsPage() {
  const router = useRouter();

  const [token, setToken] = useState("");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [reports, setReports] = useState<ReportItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<"open" | "resolved" | "all">("open");

  // For nice UX when changing status
  const [workingId, setWorkingId] = useState<string | null>(null);

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
      if (status === "all") {
        const [openItems, resolvedItems] = await Promise.all([
          fetchReportsByStatus(t, "open"),
          fetchReportsByStatus(t, "resolved"),
        ]);

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

  /**
   * ✅ Dropdown status changer (Open/Closed)
   * Uses backend endpoint:
   * POST /admin/reports/{id}/status
   * with body: { status: "open" | "resolved", admin_note?: "" }
   */
  async function setReportUiStatus(reportId: string, nextUiStatus: "open" | "closed") {
    const t = token.trim();
    if (!t) return;

    const current = reports.find((x) => x.id === reportId);
    const currentUiStatus = normalizeRowStatus(current?.status);

    // If no real change, do nothing
    if (currentUiStatus === nextUiStatus) return;

    setWorkingId(reportId);
    setErr(null);

    // Optimistic UI update (update dropdown immediately)
    setReports((prev) =>
      prev.map((x) =>
        x.id === reportId
          ? { ...x, status: nextUiStatus === "closed" ? "resolved" : "open" }
          : x
      )
    );

    try {
      // UI "closed" => backend "resolved"
      const backendStatus = nextUiStatus === "closed" ? "resolved" : "open";

      const res = await fetch(
        `${API_BASE}/admin/reports/${encodeURIComponent(reportId)}/status`,
        {
          method: "POST",
          headers: buildAdminHeaders(t),
          body: JSON.stringify({
            status: backendStatus,
            admin_note: "",
          }),
        }
      );

      if (!res.ok) throw new Error(await safeReadErrorDetail(res));

      await loadReports(); // keep UI consistent with backend
    } catch (e: any) {
      // revert if failed
      setReports((prev) =>
        prev.map((x) => (x.id === reportId ? { ...x, status: current?.status ?? "open" } : x))
      );
      setErr(e?.message || "Status update failed.");
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
                    <th style={{ padding: "10px 8px" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => {
                    const uiStatus = normalizeRowStatus(r.status);
                    const busy = workingId === r.id;

                    const targetUser = r.reported_user_id || r.target_user_id;
                    const targetProfile =
                      r.reported_profile_id || r.profile_id || r.target_profile_id;
                    const targetThread = r.thread_id || r.target_thread_id;
                    const targetMessage = r.message_id || r.target_message_id;

                    return (
                      <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
                        <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
                          {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                          <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
                            status: <b>{uiStatus}</b>
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
                          <select
                            value={uiStatus}
                            disabled={busy}
                            onChange={(e) =>
                              setReportUiStatus(r.id, e.target.value as "open" | "closed")
                            }
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

                          {busy ? (
                            <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                              Updating…
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
          This page pulls from <code>/admin/reports</code>. Status changes call{" "}
          <code>/admin/reports/&lt;id&gt;/status</code>.
        </div>
      </div>
    </main>
  );
}

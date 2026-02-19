"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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

  // Backends may use different naming; support both.
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
};

function getAdminToken(): string {
  if (typeof window === "undefined") return "";
  const keys = ["bw_admin_token", "admin_token", "bw_admin_session", "bw_admin_key"];
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
    // Send both header styles so backend can accept either.
    "X-Admin-Token": t,
    Authorization: `Bearer ${t}`,
  };
}

async function safeReadErrorDetail(res: Response): Promise<string> {
  // Prefer JSON detail/message, otherwise text, otherwise status.
  try {
    const j = await res.json();
    if (j?.detail) return String(j.detail);
    if (j?.message) return String(j.message);
    return JSON.stringify(j);
  } catch {}
  try {
    const t = await res.text();
    if (t) return t;
  } catch {}
  return `Request failed (${res.status}).`;
}

export default function AdminReportsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [reports, setReports] = useState<ReportItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<"open" | "resolved" | "all">("open");

  // For nice UX when resolving
  const [workingId, setWorkingId] = useState<string | null>(null);

  // Keep token in a ref so ALL functions always have the latest value
  const tokenRef = useRef<string>("");

  // Derived open count from what we loaded (reliable)
  const openCount = useMemo(() => {
    return reports.filter((r) => (r.status || "open") === "open").length;
  }, [reports]);

  async function loadReports(nextStatus?: "open" | "resolved" | "all") {
    // Always pull token fresh (prevents “state timing” bugs)
    const t = getAdminToken().trim() || tokenRef.current.trim();
    tokenRef.current = t;

    if (!t) {
      router.replace("/admin/login");
      return;
    }

    const status = (nextStatus || statusFilter).trim();

    setLoading(true);
    setErr(null);

    try {
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
      const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      setReports(items);
    } catch (e: any) {
      setErr(e?.message || "Failed to load reports.");
      setReports([]);
    } finally {
      setLoading(false);
    }
  }

  async function resolveReport(reportId: string) {
    const t = getAdminToken().trim() || tokenRef.current.trim();
    tokenRef.current = t;

    if (!t) {
      router.replace("/admin/login");
      return;
    }

    const note = window.prompt("Optional note to reporter:", "") || "";

    setWorkingId(reportId);
    setErr(null);

    try {
      const res = await fetch(`${API_BASE}/admin/reports/${encodeURIComponent(reportId)}/resolve`, {
        method: "POST",
        headers: buildAdminHeaders(t),
        body: JSON.stringify({ note }),
        cache: "no-store",
      });

      if (!res.ok) throw new Error(await safeReadErrorDetail(res));

      // reload the current filter view
      await loadReports();
    } catch (e: any) {
      setErr(e?.message || "Resolve failed.");
    } finally {
      setWorkingId(null);
    }
  }

  useEffect(() => {
    const t = getAdminToken().trim();
    if (!t) {
      router.replace("/admin/login");
      return;
    }

    tokenRef.current = t;

    // Initial load: load using the same function (one source of truth)
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    loadReports("open");
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
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
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

            <button
              type="button"
              style={primaryBtn}
              onClick={() => {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                loadReports();
              }}
              disabled={loading}
            >
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

                    const targetUser = r.target_user_id ?? r.reported_user_id ?? null;
                    const targetProfile = r.target_profile_id ?? r.reported_profile_id ?? r.profile_id ?? null;
                    const targetThread = r.target_thread_id ?? r.thread_id ?? null;
                    const targetMessage = r.target_message_id ?? r.message_id ?? null;

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
                          <div style={{ fontSize: 12, color: "#333", marginTop: 4 }}>{r.reason || "—"}</div>
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
                              onClick={() => {
                                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                                resolveReport(r.id);
                              }}
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
          This page pulls from <code>/admin/reports</code>. Resolving calls <code>/admin/reports/&lt;id&gt;/resolve</code>.
        </div>
      </div>
    </main>
  );
}

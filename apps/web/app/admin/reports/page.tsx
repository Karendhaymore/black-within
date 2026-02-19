"use client";

import React, { useEffect, useState } from "react";
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
  reported_user_id?: string | null;
  reported_profile_id?: string | null;
  profile_id?: string | null;
  thread_id?: string | null;
  message_id?: string | null;
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
    "X-Admin-Token": t,
    Authorization: `Bearer ${t}`,
  };
}

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

export default function AdminReportsPage() {
  const router = useRouter();

  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [openCount, setOpenCount] = useState<number>(0);
  const [reports, setReports] = useState<ReportItem[]>([]);

  async function loadReports(tOverride?: string) {
    const t = (tOverride ?? token).trim();
    if (!t) return;

    setLoading(true);
    setErr(null);

    try {
      // Option A: uses your existing backend route
      // GET /admin/report-alerts -> { openCount, recent: [...] }
      const res = await fetch(`${API_BASE}/admin/report-alerts`, {
        method: "GET",
        headers: buildAdminHeaders(t),
        cache: "no-store",
      });

      if (!res.ok) throw new Error(await safeReadErrorDetail(res));

      const data = await res.json();

      setOpenCount(typeof data?.openCount === "number" ? data.openCount : 0);
      setReports(Array.isArray(data?.recent) ? data.recent : []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = getAdminToken();
    if (!t) {
      router.replace("/admin/login");
      return;
    }
    setToken(t);
    loadReports(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

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
    textDecoration: "none",
    color: "inherit",
    display: "inline-block",
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
              Open reports: <b>{openCount}</b>
              {reports?.length ? (
                <>
                  {" "}
                  • Showing latest: <b>{reports.length}</b>
                </>
              ) : null}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/admin" style={btn}>
              Back to Admin
            </Link>

            <button
              type="button"
              style={{
                ...btn,
                border: "1px solid #111",
                background: "#111",
                color: "white",
              }}
              onClick={() => loadReports()}
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
            <div style={{ color: "#666" }}>No recent open reports found.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#666", fontSize: 12 }}>
                    <th style={{ padding: "10px 8px" }}>When</th>
                    <th style={{ padding: "10px 8px" }}>Reason</th>
                    <th style={{ padding: "10px 8px" }}>Details</th>
                    <th style={{ padding: "10px 8px" }}>Target</th>
                    <th style={{ padding: "10px 8px" }}>Reporter</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
                      <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
                        {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                      </td>

                      <td style={{ padding: "10px 8px" }}>
                        <div style={{ fontWeight: 800 }}>{r.reason || r.category || "—"}</div>
                        <div style={{ color: "#666", fontSize: 12 }}>{r.status || "open"}</div>
                      </td>

                      <td style={{ padding: "10px 8px", maxWidth: 520 }}>
                        <div style={{ fontSize: 12, color: "#333", whiteSpace: "pre-wrap" }}>
                          {r.details || "—"}
                        </div>
                      </td>

                      <td style={{ padding: "10px 8px", fontSize: 12, color: "#444" }}>
                        {r.reported_user_id ? (
                          <div>
                            user: <b>{r.reported_user_id}</b>
                          </div>
                        ) : null}

                        {(r.reported_profile_id || r.profile_id) ? (
                          <div>
                            profile: <b>{r.reported_profile_id || r.profile_id}</b>
                          </div>
                        ) : null}

                        {r.thread_id ? (
                          <div>
                            thread: <b>{r.thread_id}</b>
                          </div>
                        ) : null}

                        {r.message_id ? (
                          <div>
                            message: <b>{r.message_id}</b>
                          </div>
                        ) : null}
                      </td>

                      <td style={{ padding: "10px 8px", fontSize: 12, color: "#444" }}>
                        {r.reporter_user_id ? <b>{r.reporter_user_id}</b> : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, color: "#777", fontSize: 12 }}>
          This page is pulling from <code>/admin/report-alerts</code> and showing the latest 10.
        </div>
      </div>
    </main>
  );
}

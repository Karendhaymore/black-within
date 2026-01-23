export const dynamic = "force-dynamic";

async function getApiHealth(apiUrl: string) {
  try {
    const res = await fetch(`${apiUrl}/health`, { cache: "no-store" });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const data = await res.json().catch(() => ({}));
    return { ok: data?.status === "ok", detail: data?.status ?? "unknown" };
  } catch (e: any) {
    return { ok: false, detail: e?.message ?? "request failed" };
  }
}

export default async function Home() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
  const health = apiUrl ? await getApiHealth(apiUrl) : { ok: false, detail: "API URL missing" };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 720, width: "100%", textAlign: "center" }}>
        <h1 style={{ fontSize: 56, margin: 0, letterSpacing: -1 }}>Black Within</h1>

        <p style={{ fontSize: 18, marginTop: 14, marginBottom: 28, opacity: 0.85 }}>
          An intentional, culturally conscious dating experience rooted in identity, lineage, and alignment.
        </p>

        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderRadius: 999,
            border: "1px solid rgba(0,0,0,0.12)",
            background: "rgba(0,0,0,0.03)",
            fontSize: 14,
            marginBottom: 18,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: health.ok ? "green" : "crimson",
              display: "inline-block",
            }}
          />
          <strong>System status:</strong>{" "}
          <span>{health.ok ? "Online" : "Offline"}</span>
        </div>

        <p style={{ margin: 0, fontSize: 14, opacity: 0.7 }}>
          {apiUrl ? (
            <>
              Connected to: <code>{apiUrl}</code>
            </>
          ) : (
            <>Missing environment variable: <code>NEXT_PUBLIC_API_URL</code></>
          )}
        </p>

        <div style={{ marginTop: 28, paddingTop: 18, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
  <p style={{ margin: 0, fontSize: 14, opacity: 0.75 }}>
    MVP is live. Profiles and messaging are coming next.
  </p>

  <div style={{ marginTop: 16, display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
    <a
      href="mailto:karendhaymore@gmail.com?subject=Black%20Within%20Waitlist"
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        textDecoration: "none",
        border: "1px solid rgba(0,0,0,0.12)",
        background: "rgba(0,0,0,0.06)",
        fontSize: 14,
      }}
    >
      /auth

    </a>

    <a
      href="mailto:karendhaymore@gmail.com?subject=Black%20Within%20Support"
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        textDecoration: "none",
        border: "1px solid rgba(0,0,0,0.12)",
        background: "white",
        fontSize: 14,
      }}
    >
      Contact
    </a>
  </div>
</div>

      </div>
    </main>
  );
}

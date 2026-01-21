export default async function Home() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  let apiStatus = "offline";

  try {
    const res = await fetch(`${apiBaseUrl}/health`, {
      cache: "no-store",
    });

    if (res.ok) {
      const data = await res.json();
      apiStatus = data?.status ?? "unknown";
    } else {
      apiStatus = "offline";
    }
  } catch (e) {
    apiStatus = "offline";
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: "520px" }}>
        <h1 style={{ fontSize: "2.5rem", fontWeight: "bold" }}>Black Within</h1>

        <p style={{ marginTop: "1rem", fontSize: "1.1rem" }}>
          An intentional, culturally conscious dating experience.
        </p>

        <p style={{ marginTop: "0.75rem", opacity: 0.7 }}>Coming soon.</p>

        <div
          style={{
            marginTop: "1.5rem",
            padding: "0.75rem 1rem",
            border: "1px solid #ddd",
            borderRadius: "10px",
            display: "inline-block",
          }}
        >
          <strong>API Status:</strong>{" "}
          <span style={{ color: apiStatus === "ok" ? "green" : "red" }}>
            {apiStatus}
          </span>
        </div>

        <div style={{ marginTop: "0.75rem", fontSize: "0.9rem", opacity: 0.7 }}>
          API: {apiBaseUrl}
        </div>
      </div>
    </main>
  );
}

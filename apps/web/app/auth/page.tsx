export default function AuthHub() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem" }}>
      <div style={{ textAlign: "center", maxWidth: 560 }}>
        <h1 style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>Sign Up / Log In</h1>

        <p style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>
          Account creation is opening soon.
        </p>

        <p style={{ color: "#555", marginBottom: "1.5rem" }}>
          Black Within is being released intentionally to honor depth, safety, and alignment.
        </p>

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
          <a
            href="/auth/signup"
            style={{
              padding: "0.6rem 1.2rem",
              borderRadius: 8,
              border: "1px solid #ccc",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            Create Account
          </a>

          <a
            href="/auth/login"
            style={{
              padding: "0.6rem 1.2rem",
              borderRadius: 8,
              border: "1px solid #ccc",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            Log In
          </a>
        </div>
      </div>
    </main>
  );
}

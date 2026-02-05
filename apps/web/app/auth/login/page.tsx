"use client";

import { useEffect } from "react";

export default function AuthLoginRedirect() {
  useEffect(() => {
    window.location.replace("/auth");
  }, []);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      Redirecting…
    </main>
  );
}

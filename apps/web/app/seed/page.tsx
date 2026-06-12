"use client";

import { useEffect } from "react";

export default function SeedPage() {
  useEffect(() => {
    window.location.href = "/auth/login";
  }, []);

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Access Restricted</h1>
      <p>This page is not available.</p>
    </main>
  );
}

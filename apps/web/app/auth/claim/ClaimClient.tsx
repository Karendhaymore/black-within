"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://black-within-api.onrender.com";

export default function ClaimClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const [msg, setMsg] = useState("Processing claim…");

  useEffect(() => {
    const token = sp.get("token");
    if (!token) {
      setMsg("Missing claim token.");
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!res.ok) throw new Error("Claim failed");

        setMsg("Claim successful! Redirecting…");
        setTimeout(() => router.replace("/discover"), 900);
      } catch {
        setMsg("Claim failed.");
      }
    })();
  }, [sp, router]);

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Claim</h1>
      <p>{msg}</p>
    </main>
  );
}

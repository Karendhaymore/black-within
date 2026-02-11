import { Suspense } from "react";
import ClaimClient from "./ClaimClient";

export const dynamic = "force-dynamic";

export default function ClaimPage() {
  return (
    <Suspense fallback={<div style={{ padding: "2rem" }}>Loading…</div>}>
      <ClaimClient />
    </Suspense>
  );
}

"use client";

import { Suspense } from "react";
import ResetContent from "./reset-content";

export default function ResetPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ResetContent />
    </Suspense>
  );
}

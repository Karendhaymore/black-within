"use client";

import { useSearchParams } from "next/navigation";

export default function ResetContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  return (
    <div>
      {/* your existing reset password UI */}
    </div>
  );
}

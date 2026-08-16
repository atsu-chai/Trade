"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function LoopAutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => router.refresh(), 15000);
    return () => window.clearInterval(interval);
  }, [active, router]);

  return null;
}

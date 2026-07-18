"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppSelector, type RootState } from "@/store";

export default function DashboardIndex() {
  const router = useRouter();
  const { activeMode } = useAppSelector((s: RootState) => s.auth);

  useEffect(() => {
    if (activeMode === "specialist") {
      router.replace("/dashboard/specialist");
    } else {
      router.replace("/dashboard/client");
    }
  }, [activeMode, router]);

  return (
    <div className="flex items-center justify-center min-h-full">
      <div className="w-6 h-6 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
    </div>
  );
}
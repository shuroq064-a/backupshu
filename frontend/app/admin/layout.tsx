"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppSelector, useAppDispatch, type RootState } from "@/store";
import { AdminSidebar } from "@/components/sidebar/AdminSidebar";
import { fetchAdminStats } from "@/store/slices/adminSlice";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { user, isHydrated } = useAppSelector((s: RootState) => s.auth);

  // Client-side guard (middleware handles SSR layer)
  useEffect(() => {
    if (!isHydrated) return;
    if (!user) {
      router.replace("/auth");
      return;
    }
    if (user.role !== "admin") {
      router.replace("/dashboard");
      return;
    }
    // Load stats on mount so sidebar badge is populated
    dispatch(fetchAdminStats());
  }, [isHydrated, user, router, dispatch]);

  if (!isHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="w-8 h-8 border-2 border-gray-700 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || user.role !== "admin") return null;

  return (
    <div className="flex min-h-screen bg-gray-950">
      <AdminSidebar />
      <main className="flex-1 overflow-auto bg-gray-950">{children}</main>
    </div>
  );
}
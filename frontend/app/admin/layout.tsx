"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppSelector, useAppDispatch, type RootState } from "@/store";
import { AdminSidebar } from "@/components/sidebar/AdminSidebar";
import { fetchAdminStats } from "@/store/slices/adminSlice";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const { user, isHydrated } = useAppSelector((s: RootState) => s.auth);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

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
      <AdminSidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <main className="flex-1 overflow-auto bg-gray-950">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 h-14 px-4 bg-gray-900 border-b border-gray-800 sticky top-0 z-30">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="p-2 -ml-2 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
            aria-label="Open menu"
          >
            <span className="text-xl">☰</span>
          </button>
          <span className="text-base font-bold text-gray-100">ShuroqX Admin</span>
        </div>
        {children}
      </main>
    </div>
  );
}
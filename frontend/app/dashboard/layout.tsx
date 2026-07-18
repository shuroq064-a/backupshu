"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppSelector } from "@/store";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { LocationPermissionPrompt } from "@/components/location/LocationPermissionPrompt";
import { clearSession } from "@/lib/auth";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, isHydrated, specialistProfile } = useAppSelector((s) => s.auth);
  const [redirecting, setRedirecting] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();
  const isOnboarding = pathname.startsWith("/dashboard/specialist/onboarding");

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Let pages with their own header (e.g. onboarding) open the mobile drawer.
  useEffect(() => {
    function openMobileNav() {
      setMobileNavOpen(true);
    }
    window.addEventListener("shuroqx-open-mobile-nav", openMobileNav);
    return () => window.removeEventListener("shuroqx-open-mobile-nav", openMobileNav);
  }, []);

  // Client-side auth guard (middleware handles SSR).
  // If the cookie says authenticated but the client store has no user
  // (stale / desynced session: cookie present, localStorage cleared), clear
  // the stale session and go to login. Otherwise the layout would render blank
  // and middleware would bounce straight back here (redirect loop).
  useEffect(() => {
    if (redirecting) return;
    if (isHydrated && !user) {
      clearSession();
      document.cookie = "shuroqx_session=; path=/; max-age=0";
      setRedirecting(true);
      router.replace("/auth");
    }
  }, [isHydrated, user, router, redirecting]);

  // Never render blank: show a loader while rehydrating or resolving auth.
  if (!isHydrated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-container-lowest">
        <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <LocationPermissionPrompt />
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile top bar (hidden on the onboarding route, which has its own header) */}
        {!isOnboarding && (
          <div className="md:hidden flex items-center gap-3 h-14 px-4 bg-surface-container-lowest border-b border-outline-variant sticky top-0 z-30">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="p-2 -ml-2 rounded-lg text-on-surface hover:bg-primary/5 transition-colors"
              aria-label="Open menu"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <span className="text-lg font-bold text-primary tracking-tight">ShuroqX</span>
          </div>
        )}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

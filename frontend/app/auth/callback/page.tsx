"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Suspense } from "react";
import { persistSession } from "@/lib/auth";
import { useAppDispatch } from "@/store";
import { hydrateAuth } from "@/store/slices/authSlice";

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
        </div>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}

function AuthCallbackInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (status === "loading") return;

    if (status === "unauthenticated" || !session) {
      router.replace("/auth");
      return;
    }

    const backendToken =
      (session as Record<string, unknown>).backendToken as string | undefined;
    const userId = session.user?.id as string | undefined;

    if (!backendToken) {
      router.replace("/auth");
      return;
    }

    const user = { id: userId || "", email: session.user?.email || "", name: session.user?.name || "", role: "user" as const };

    // Persist to localStorage so Redux hydrateAuth can pick it up
    persistSession({
      user,
      token: backendToken,
      activeMode: "client",
      specialistProfile: null,
    });

    // Also set the cookie for middleware
    const sessionData = JSON.stringify({
      token: backendToken,
      user: { id: userId, role: "user" },
    });
    document.cookie = `shuroqx_session=${encodeURIComponent(
      sessionData
    )}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;

    // Re-hydrate Redux so dashboard sees the user immediately
    dispatch(hydrateAuth());

    // New OAuth signups land on the premium profile setup wizard; the
    // onboarding page redirects users who already completed it to the dashboard.
    router.replace("/onboarding");
  }, [session, status, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-100">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Signing you in...</p>
      </div>
    </div>
  );
}

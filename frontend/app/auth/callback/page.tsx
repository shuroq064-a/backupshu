"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

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
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";

  useEffect(() => {
    if (status === "loading") return;

    if (status === "unauthenticated" || !session) {
      router.replace("/auth");
      return;
    }

    // Extract backend token and user info from NextAuth session
    const backendToken =
      (session as Record<string, unknown>).backendToken as string | undefined;
    const userId = session.user?.id as string | undefined;

    if (!backendToken) {
      router.replace("/auth");
      return;
    }

    // Set the shuroqx_session cookie so middleware can read it
    const role = "user";
    const sessionData = JSON.stringify({
      token: backendToken,
      user: { id: userId, role },
    });
    document.cookie = `shuroqx_session=${encodeURIComponent(
      sessionData
    )}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;

    router.replace(redirect);
  }, [session, status, router, redirect]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-100">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Signing you in...</p>
      </div>
    </div>
  );
}

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector, store } from "@/store";
import { setActiveMode, fetchSpecialistProfile, setSpecialistAvailability } from "@/store/slices/authSlice";
import type { ActiveMode } from "@/types";
import { workerApi } from "@/lib/api";

// ─────────────────────────────────────────────
//  useMode
//  Handles the client ↔ specialist toggle.
//  Automatically routes to onboarding if the
//  user hasn't set up a specialist profile yet.
// ─────────────────────────────────────────────

export function useMode() {
  const dispatch = useAppDispatch();
  const router = useRouter();

  const { activeMode, specialistProfile, user } = useAppSelector((s: { auth: any; }) => s.auth);

  const isClientMode = activeMode === "client";
  const isSpecialistMode = activeMode === "specialist";
  const hasSpecialistProfile = !!specialistProfile;
  const isVerified = specialistProfile?.isVerified ?? false;
  const isPending = specialistProfile?.verificationStatus === "pending";
  const isRejected = specialistProfile?.verificationStatus === "rejected";

  const switchMode = useCallback(
    async (mode: ActiveMode) => {
      if (mode === activeMode) return;

      if (mode === "specialist") {
        // 1. Check in-memory state first
        if (!specialistProfile && user) {
          // 2. Try fetching from backend
          await dispatch(fetchSpecialistProfile(user.id));

          // 3. Re-check store after fetch
          const freshProfile = store.getState().auth.specialistProfile;
          if (!freshProfile) {
            // No profile exists → send to onboarding
            router.push("/dashboard/specialist/onboarding");
            return;
          }
        }
        dispatch(setActiveMode("specialist"));
        router.push("/dashboard/specialist");
      } else {
        if (specialistProfile?.id && specialistProfile.isAvailable) {
          try {
            await workerApi.updateAvailability(specialistProfile.id, false);
          } catch {
            // Keep the client transition even if the availability update fails.
          }
        }
        dispatch(setSpecialistAvailability(false));
        dispatch(setActiveMode("client"));
        router.push("/dashboard/client");
      }
    },
    [activeMode, specialistProfile, user, dispatch, router]
  );

  const switchToClient = useCallback(
    () => switchMode("client"),
    [switchMode]
  );

  const switchToSpecialist = useCallback(
    () => switchMode("specialist"),
    [switchMode]
  );

  return {
    activeMode,
    isClientMode,
    isSpecialistMode,
    hasSpecialistProfile,
    isVerified,
    isPending,
    isRejected,
    switchMode,
    switchToClient,
    switchToSpecialist,
  };
}
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  loginUser,
  registerUser,
  oauthLogin,
  logout,
  clearError,
} from "@/store/slices/authSlice";
import type { LoginRequest, RegisterRequest, OAuthLoginRequest } from "@/types";

// ─────────────────────────────────────────────
//  useAuth
//  Drop this anywhere in the app to get auth
//  state and all auth actions in one hook.
// ─────────────────────────────────────────────

export function useAuth() {
  const dispatch = useAppDispatch();
  const router = useRouter();

  const { user, token, activeMode, specialistProfile, isLoading, error, isHydrated } =
    useAppSelector((s: { auth: any; }) => s.auth);

  const isAuthenticated = !!user && !!token;
  const isAdmin = user?.role === "admin";
  const isSpecialist = !!specialistProfile;

  // ── Write session cookie (for middleware) ──
  function setCookie(token: string, role: string) {
    const value = encodeURIComponent(
      JSON.stringify({ token, user: { role } })
    );
    document.cookie = `shuroqx_session=${value}; path=/; max-age=${
      60 * 60 * 24 * 7
    }; SameSite=Lax`;
  }

  // ── Login ──────────────────────────────────
  const login = useCallback(
    async (payload: LoginRequest) => {
      const result = await dispatch(loginUser(payload));
      if (loginUser.fulfilled.match(result)) {
        const { access_token, token: t, role } = result.payload as any;
        setCookie(access_token || t || "", role || "user");
        if (role === "admin") {
          router.replace("/admin/specialists");
        } else {
          router.replace("/dashboard");
        }
        return { success: true };
      }
      return { success: false, error: result.payload as string };
    },
    [dispatch, router]
  );

  // ── Register ───────────────────────────────
  const register = useCallback(
    async (payload: RegisterRequest) => {
      const result = await dispatch(registerUser(payload));
      if (registerUser.fulfilled.match(result)) {
        const { access_token, token: t } = result.payload as any;
        setCookie(access_token || t || "", "user");
        router.replace("/dashboard");
        return { success: true };
      }
      return { success: false, error: result.payload as string };
    },
    [dispatch, router]
  );

  // ── OAuth ──────────────────────────────────
  const loginWithOAuth = useCallback(
    async (payload: OAuthLoginRequest) => {
      const result = await dispatch(oauthLogin(payload));
      if (oauthLogin.fulfilled.match(result)) {
        const { access_token, token: t } = result.payload as any;
        setCookie(access_token || t || "", "user");
        router.replace("/dashboard");
        return { success: true };
      }
      return { success: false, error: result.payload as string };
    },
    [dispatch, router]
  );

  // ── Logout ─────────────────────────────────
  const handleLogout = useCallback(() => {
    dispatch(logout());
    document.cookie = "shuroqx_session=; path=/; max-age=0";
    router.replace("/auth");
  }, [dispatch, router]);

  return {
    // State
    user,
    token,
    activeMode,
    specialistProfile,
    isLoading,
    error,
    isHydrated,
    isAuthenticated,
    isAdmin,
    isSpecialist,

    // Actions
    login,
    register,
    loginWithOAuth,
    logout: handleLogout,
    clearError: () => dispatch(clearError()),
  };
}
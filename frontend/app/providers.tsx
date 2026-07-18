"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Provider } from "react-redux";
import { SessionProvider } from "next-auth/react";
import { store, useAppDispatch } from "@/store";
import { hydrateAuth } from "@/store/slices/authSlice";
import { API_BASE_URL } from "@/lib/config";
import { ThemeProvider, useTheme } from "@/components/theme/ThemeProvider";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

function HydrationGate({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const hydrated = useRef(false);

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      dispatch(hydrateAuth());

      fetch(`${API_BASE_URL}/`)
        .catch(() => {});
    }
  }, [dispatch]);

  return <>{children}</>;
}

function RouteThemeGuard() {
  const pathname = usePathname();
  const { syncTheme } = useTheme();

  useEffect(() => {
    const isAppRoute =
      pathname.startsWith("/dashboard") || pathname.startsWith("/admin");

    if (isAppRoute) {
      syncTheme();
      return;
    }

    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "light";
  }, [pathname, syncTheme]);

  return null;
}

function ThemeToggleSlot() {
  const pathname = usePathname();
  const isAppRoute =
    pathname.startsWith("/dashboard") || pathname.startsWith("/admin");

  if (!isAppRoute) return null;
  return <ThemeToggle />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Provider store={store}>
        <ThemeProvider>
          <RouteThemeGuard />
          <HydrationGate>{children}</HydrationGate>
          <ThemeToggleSlot />
        </ThemeProvider>
      </Provider>
    </SessionProvider>
  );
}

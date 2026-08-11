"use client";

import { Suspense, useMemo, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useAppDispatch, useAppSelector, type RootState } from "@/store";
import { loginUser, registerUser, clearError } from "@/store/slices/authSlice";
import { Logo } from "@/components/ui";
import { sanitizeRedirect } from "@/lib/security";
import { AtSignIcon, ChevronLeftIcon } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useTheme } from "@/components/theme/ThemeProvider";

const Particles = dynamic(() => import("@/components/ui/Particles"), { ssr: false });

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-surface">
          <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      }
    >
      <AuthPageInner />
    </Suspense>
  );
}

function AuthPageInner() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = sanitizeRedirect(searchParams.get("redirect"));
  const nextAuthError = searchParams.get("error");
  const { resolvedTheme } = useTheme();
  const particleColors = useMemo(
    () => (resolvedTheme === "dark" ? ["#ffffff"] : ["#181a2e"]),
    [resolvedTheme]
  );

  const { isLoading, error, user } = useAppSelector((s: RootState) => s.auth);

  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) router.replace(redirect);
  }, [user, router, redirect]);

  useEffect(() => {
    dispatch(clearError());
  }, [tab, dispatch]);

  function setCookieFromToken(token: string, role: string) {
    document.cookie = `shuroqx_session=${encodeURIComponent(
      JSON.stringify({ token, user: { role } })
    )}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setPasswordError("");
    setFormError("");

    if (tab === "register") {
      if (!name.trim()) {
        setFormError("Please enter your name.");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setFormError("Please enter a valid email address.");
        return;
      }
      const pw = password.trim();
      if (pw.length < 8) {
        setPasswordError("Password must be at least 8 characters long.");
        return;
      }
      if (!/[A-Z]/.test(pw) || !/[a-z]/.test(pw) || !/\d/.test(pw)) {
        setPasswordError("Password must contain an uppercase letter, a lowercase letter, and a number.");
        return;
      }
    } else if (!email.trim() || !password.trim()) {
      setFormError("Please enter your email and password.");
      return;
    }

    setSubmitting(true);
    try {
      if (tab === "login") {
        const result = await dispatch(loginUser({ email: email.trim(), password: password.trim() }));
        if (loginUser.fulfilled.match(result)) {
          const token = result.payload.access_token || result.payload.token || "";
          const role = result.payload.role || "user";
          setCookieFromToken(token, role);
          router.replace(role === "admin" ? "/admin/specialists" : redirect);
        } else {
          setFormError(typeof result.payload === "string" ? result.payload : "Login failed. Please try again.");
        }
      } else {
        const result = await dispatch(registerUser({ email: email.trim(), password: password.trim(), name: name.trim() }));
        if (registerUser.fulfilled.match(result)) {
          const token = result.payload.access_token || result.payload.token || "";
          setCookieFromToken(token, "user");
          router.replace(redirect);
        } else {
          setFormError(typeof result.payload === "string" ? result.payload : "Unable to complete registration. Please try again.");
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSocialLogin(provider: "google" | "facebook" | "apple") {
    await signIn(provider, {
      callbackUrl: `/auth/callback?redirect=${encodeURIComponent(redirect)}`,
    });
  }

  const inputClass = "w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm text-on-surface placeholder:text-on-surface/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div className="relative min-h-screen flex bg-surface p-4 sm:p-6">
      {/* Particles background */}
      <div style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 0 }}>
        <Particles
          particleColors={particleColors}
          particleCount={600}
          particleSpread={10}
          speed={0.3}
          particleBaseSize={100}
          moveParticlesOnHover
          alphaParticles={false}
          disableRotation={false}
          pixelRatio={1}
        />
      </div>
      <ThemeToggle />
      <div className="relative z-10 m-auto w-full max-w-5xl overflow-hidden rounded-3xl shadow-2xl lg:grid lg:grid-cols-2">
        {/* Vertical divider between panels */}
        <div aria-hidden className="absolute inset-y-24 left-1/2 z-20 hidden w-px -translate-x-1/2 bg-outline-variant/70 lg:block" />
        {/* Left panel - Branding + Floating Paths */}
        <div className="relative hidden h-[680px] flex-col bg-surface-container-lowest p-12 lg:flex">
          <div className="absolute inset-0 z-10 bg-gradient-to-t from-surface-container-lowest via-transparent to-transparent" />
          <div className="z-10 flex items-center gap-2">
            <Logo size="md" />
          </div>
          <div className="z-10 mt-auto">
            <blockquote className="space-y-2">
              <p className="text-base text-on-surface">&ldquo;This platform has helped me save time and serve my clients faster than ever before.&rdquo;</p>
              <footer className="font-mono text-sm font-semibold text-on-surface/60">~ ShuroQX User</footer>
            </blockquote>
          </div>
          <div className="absolute inset-0">
            <FloatingPaths position={1} />
            <FloatingPaths position={-1} />
          </div>
        </div>

        {/* Right panel - Form */}
        <div className="relative flex min-h-[680px] flex-col justify-center bg-surface-container-lowest p-6 sm:p-12">
        <div aria-hidden className="absolute inset-0 isolate -z-10 opacity-30">
          <div className="absolute top-0 right-0 h-80 w-56 -translate-y-48 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.02)_50%,rgba(255,255,255,0.01)_80%)]" />
          <div className="absolute top-0 right-0 h-80 w-60 translate-x-2 -translate-y-1/2 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.01)_80%,transparent_100%)]" />
          <div className="absolute top-0 right-0 h-80 w-60 -translate-y-48 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.01)_80%,transparent_100%)]" />
        </div>

        <Link href="/" className="absolute top-7 left-5 flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-on-surface/60 transition-soft hover:text-on-surface">
          <ChevronLeftIcon className="me-2 h-4 w-4" />
          Home
        </Link>

        <div className="mx-auto w-full max-w-sm space-y-4">
          <div className="flex items-center gap-2 lg:hidden">
            <Logo size="md" />
          </div>

          <div className="flex flex-col space-y-1">
            <h1 className="font-headline-md text-headline-md font-bold tracking-wide text-on-surface">
              {tab === "login" ? "Welcome Back!" : "Create Account"}
            </h1>
            <p className="text-sm text-on-surface/60">
              {tab === "login" ? "Log in to your ShuroQX account." : "Sign up to get started with ShuroQX."}
            </p>
          </div>

          <div className="space-y-2">
            <button type="button" onClick={() => handleSocialLogin("google")} className="flex w-full items-center justify-center gap-2 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface transition-soft hover:bg-surface-container-lowest">
              <GoogleIcon className="me-2 h-4 w-4" />
              Continue with Google
            </button>
          </div>

          <AuthSeparator />

          <form onSubmit={handleSubmit} className="space-y-2">
            <p className="text-start text-xs text-on-surface/50">
              Enter your email address to sign in or create an account
            </p>

            {tab === "register" && (
              <div className="relative">
                <input type="text" placeholder="Full Name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
              </div>
            )}

            <div className="relative">
              <input type="email" placeholder="your.email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-outline-variant bg-surface-container-low py-3 ps-9 pe-4 text-sm text-on-surface placeholder:text-on-surface/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" required />
              <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-on-surface/40">
                <AtSignIcon className="h-4 w-4" />
              </div>
            </div>

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (passwordError) setPasswordError(""); }}
                className={`w-full rounded-xl border bg-surface-container-low px-4 py-3 text-sm text-on-surface placeholder:text-on-surface/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${passwordError ? "border-red-400" : "border-outline-variant"}`}
                required
              />
              {tab === "register" && passwordError && <p className="mt-1.5 text-xs text-red-400">{passwordError}</p>}
              {tab === "login" && (
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-primary hover:text-primary/80">
                  {showPassword ? "Hide" : "Forgot password?"}
                </button>
              )}
            </div>

            {(error || nextAuthError || formError) && (
              <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
                {formError || error || (nextAuthError === "OAuthAccountNotLinked" ? "This email is already linked to another login method." : nextAuthError === "OAuthCreateAccount" ? "Could not create account." : nextAuthError === "OAuthCallback" ? "Sign-in failed. Ensure backend is running." : `Sign-in error: ${nextAuthError}`)}
              </div>
            )}

            <button type="submit" disabled={isLoading || submitting} className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white transition-soft hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed">
              {isLoading || submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Please wait...
                </span>
              ) : tab === "login" ? "Log In" : "Create Account"}
            </button>
          </form>

          <p className="text-center text-sm text-on-surface/50">
            {tab === "login" ? (
              <>Don&apos;t have an account? <button onClick={() => setTab("register")} className="font-medium text-primary hover:underline">Sign Up</button></>
            ) : (
              <>Already have an account? <button onClick={() => setTab("login")} className="font-medium text-primary hover:underline">Log In</button></>
            )}
          </p>

          <p className="mt-8 text-xs text-on-surface/60">
            By clicking continue, you agree to our{" "}
            <a href="#" className="underline underline-offset-4 hover:text-on-surface">Terms of Service</a>{" "}and{" "}
            <a href="#" className="underline underline-offset-4 hover:text-on-surface">Privacy Policy</a>.
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}

function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    color: `rgba(255,255,255,${0.05 + i * 0.015})`,
    width: 0.5 + i * 0.03,
  }));

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <svg className="h-full w-full text-on-surface" viewBox="0 0 696 316" fill="none">
        <title>Background Paths</title>
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={0.1 + path.id * 0.03}
            initial={{ pathLength: 0.3, opacity: 0.6 }}
            animate={{ pathLength: 1, opacity: [0.3, 0.6, 0.3], pathOffset: [0, 1, 0] }}
            transition={{ duration: 20 + Math.random() * 10, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
          />
        ))}
      </svg>
    </div>
  );
}

function AuthSeparator() {
  return (
    <div className="flex w-full items-center justify-center">
      <div className="h-px w-full bg-outline-variant" />
      <span className="px-2 text-xs text-on-surface/40">OR</span>
      <div className="h-px w-full bg-outline-variant" />
    </div>
  );
}

function GoogleIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12.479,14.265v-3.279h11.049c0.108,0.571,0.164,1.247,0.164,1.979c0,2.46-0.672,5.502-2.84,7.669C18.744,22.829,16.051,24,12.483,24C5.869,24,0.308,18.613,0.308,12S5.869,0,12.483,0c3.659,0,6.265,1.436,8.223,3.307L18.392,5.62c-1.404-1.317-3.307-2.341-5.913-2.341C7.65,3.279,3.873,7.171,3.873,12s3.777,8.721,8.606,8.721c3.132,0,4.916-1.258,6.059-2.401c0.927-0.927,1.537-2.251,1.777-4.059L12.479,14.265z" />
    </svg>
  );
}
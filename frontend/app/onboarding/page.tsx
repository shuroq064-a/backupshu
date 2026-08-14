"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { userApi } from "@/lib/api";
import { clearSession } from "@/lib/auth";
import { useAppDispatch, useAppSelector } from "@/store";
import { patchUser } from "@/store/slices/authSlice";
import { useToast } from "@/components/ui/Toast";
import AnimatedStepper from "@/components/smoothui/components/animated-stepper";
import BasicDropdown, {
  type DropdownItem,
} from "@/components/smoothui/components/basic-dropdown";
import { Logo } from "@/components/ui";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { User } from "@/types";

const STEPS = [
  { n: 1, label: "Identity" },
  { n: 2, label: "Preferences" },
  { n: 3, label: "Ready" },
];

const stepperSteps = STEPS.map((s) => ({ label: s.label }));

const GENDER_OPTIONS: DropdownItem[] = [
  { id: "female", label: "Female" },
  { id: "male", label: "Male" },
  { id: "non-binary", label: "Non-binary" },
  { id: "prefer-not", label: "Prefer not to say" },
];

const LANGUAGES: DropdownItem[] = [
  { id: "english", label: "English" },
  { id: "hindi", label: "Hindi" },
  { id: "telugu", label: "Telugu" },
];

const inputClass =
  "w-full rounded-xl border border-midnight-light bg-midnight-light pl-10 pr-4 py-2.5 text-sm text-on-midnight placeholder:text-on-midnight-variant/30 focus:ring-2 focus:ring-mint focus:border-mint transition-all outline-none";

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-midnight">
          <div className="w-8 h-8 border-2 border-mint/20 border-t-mint rounded-full animate-spin" />
        </div>
      }
    >
      <OnboardingInner />
    </Suspense>
  );
}

function OnboardingInner() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { user, token, isLoading } = useAppSelector((s) => s.auth);
  const { showToast } = useToast();
  const { resolvedTheme } = useTheme();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const stepRef = useRef(step);
  stepRef.current = step;

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    profession: "",
    age: "",
    gender: "",
    language: "english",
    address: "",
  });

  // ── Load profile (fresh from server) + prefill from the session user ──
  useEffect(() => {
    if (!user) return;
    const base = {
      name: user.name || "",
      email: user.email || "",
      phone: (user as User).phone || "",
      address: (user as User).address || "",
    };
    setForm((f) => ({ ...f, ...base }));

    userApi
      .getProfile()
      .then((profile) => {
        if (profile.onboardingCompleted) {
          router.replace("/dashboard");
          return;
        }
        setForm((f) => ({
          ...f,
          name: profile.name || f.name,
          email: profile.email || f.email,
          phone: profile.phone || f.phone,
          address: profile.address || f.address,
          language: profile.language || "english",
          profession: profile.profession || "",
          age: profile.age ? String(profile.age) : "",
          gender: profile.gender || "",
        }));
      })
      .catch(() => {
        // Profile fetch failed (e.g. offline) — proceed with session prefill.
      });
  }, [user, router]);

  // ── Guards ───────────────────────────────────────────────
  useEffect(() => {
    if (isLoading) return;
    if (!user || !token) {
      router.replace("/auth?redirect=/onboarding");
      return;
    }
    if ((user as User).onboardingCompleted) {
      router.replace("/dashboard");
    }
  }, [user, token, isLoading, router]);

  // ── Browser back button walks through the wizard, then exits to sign-up ──
  useEffect(() => {
    const onPopState = () => {
      if (stepRef.current > 1) {
        // Stay inside the wizard: re-arm history so the next Back goes further.
        window.history.pushState({ onboarding: true }, "");
        setStep((s) => ((s > 1 ? s - 1 : s) as 1 | 2 | 3));
      } else {
        // Leaving from the first step → return to the sign-up screen.
        clearSession();
        document.cookie = "shuroqx_session=; path=/; max-age=0";
        router.replace("/auth?redirect=/onboarding&mode=register");
      }
    };
    window.history.pushState({ onboarding: true }, "");
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [router]);

  // ── Theme scope on <body> so the page (and portaled dropdowns) render in
  //    dark (midnight) or light based on the app theme ───────────────────
  useEffect(() => {
    const scope =
      resolvedTheme === "light" ? "onboarding-light" : "onboarding-midnight";
    document.body.classList.remove("onboarding-midnight", "onboarding-light");
    document.body.classList.add(scope);
    return () =>
      document.body.classList.remove("onboarding-midnight", "onboarding-light");
  }, [resolvedTheme]);

  if (!user || !token || (user as User).onboardingCompleted) {
    return null;
  }

  const patch = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  const saveStep = (payload: Parameters<typeof userApi.updateProfile>[0]) =>
    userApi.updateProfile(payload).then((updated) => {
      dispatch(
        patchUser({
          name: updated.name,
          phone: updated.phone,
          address: updated.address,
          age: updated.age,
          gender: updated.gender,
          profession: updated.profession,
          onboardingCompleted: updated.onboardingCompleted,
        })
      );
    });

  async function handleContinue(skipOptional = false) {
    if (step === 1) {
      if (!form.name.trim()) {
        showToast("Please enter your full name.", "info");
        return;
      }
      if (!form.phone.trim()) {
        showToast("Please enter your phone number.", "info");
        return;
      }
      const ageNum = form.age ? Number(form.age) : null;
      if (ageNum !== null && (ageNum < 13 || ageNum > 120)) {
        showToast("Age must be between 13 and 120.", "error");
        return;
      }
      if (!form.email.trim()) {
        showToast("Please enter your email address.", "info");
        return;
      }

      setSubmitting(true);
      try {
        await saveStep({
          name: form.name.trim(),
          phone: form.phone.trim(),
          ...(skipOptional
            ? {}
            : {
                profession: form.profession.trim() || undefined,
                age: ageNum ?? undefined,
                gender: form.gender || undefined,
              }),
        });
        setStep(2);
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : "Could not save your details.",
          "error"
        );
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (step === 2) {
      setSubmitting(true);
      try {
        await saveStep({
          language: form.language,
          address: form.address.trim() || undefined,
        });
        setStep(3);
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : "Could not save your preferences.",
          "error"
        );
      } finally {
        setSubmitting(false);
      }
      return;
    }
  }

  async function handleFinish() {
    setSubmitting(true);
    try {
      await saveStep({ onboarding_completed: true });
      showToast("Your premium profile is ready!", "success");
      router.replace("/dashboard");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not complete setup.",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-midnight text-on-midnight min-h-screen flex flex-col antialiased">
      {/* Top header — logo + theme toggle + help */}
      <header className="relative z-10 flex items-center justify-between w-full px-6 py-6 md:px-12 lg:px-20">
        <Logo size="lg" textColor={resolvedTheme === "dark" ? "light" : "dark"} />
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 text-sm text-on-midnight-variant">
            <span>Need help?</span>
            <button
              aria-label="Help"
              className="flex items-center justify-center p-2 rounded-full hover:bg-midnight-light transition-colors text-mint cursor-pointer"
            >
              <span className="material-symbols-outlined">help_outline</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main — single column, shifted toward the top */}
      <main className="flex-1 flex flex-col justify-start items-center p-6 md:p-10 lg:pt-8 lg:px-20 bg-midnight relative">
        <div className="w-full max-w-2xl">
          {/* AnimatedStepper — shared component from specialist onboarding */}
          <div className="mb-5">
            <AnimatedStepper currentStep={step - 1} steps={stepperSteps} />
          </div>

          <div className="mb-5">
            <motion.h2
              key={step}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="font-headline-lg text-2xl text-on-midnight mb-1"
            >
              {step === 1 && "Create Profile"}
              {step === 2 && "Set Preferences"}
              {step === 3 && "You're all set"}
            </motion.h2>
            <p className="text-on-midnight-variant">
              {step === 1 && "Tell us a bit about yourself."}
              {step === 2 && "Personalize how ShuroqX works for you."}
              {step === 3 && "Review your details and get started."}
            </p>
          </div>

          {/* ── STEP 1: Identity ── */}
          {step === 1 && (
            <motion.form
              key="step1"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              onSubmit={(e) => {
                e.preventDefault();
                handleContinue(false);
              }}
            >
              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1 md:col-span-2">
                    <label
                      className="text-xs text-on-midnight-variant"
                      htmlFor="fullName"
                    >
                      Full Name
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="material-symbols-outlined text-on-midnight-variant/50 text-[18px]">
                          badge
                        </span>
                      </div>
                      <input
                        id="fullName"
                        className={inputClass}
                        placeholder="Jane Doe"
                        value={form.name}
                        onChange={(e) => patch({ name: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label
                      className="text-xs text-on-midnight-variant"
                      htmlFor="email"
                    >
                      Email Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="material-symbols-outlined text-on-midnight-variant/50 text-[18px]">
                          mail
                        </span>
                      </div>
                      <input
                        id="email"
                        className={inputClass}
                        placeholder="jane@example.com"
                        type="email"
                        value={form.email}
                        onChange={(e) => patch({ email: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label
                      className="text-xs text-on-midnight-variant"
                      htmlFor="phone"
                    >
                      Phone Number
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="material-symbols-outlined text-on-midnight-variant/50 text-[18px]">
                          call
                        </span>
                      </div>
                      <input
                        id="phone"
                        className={inputClass}
                        placeholder="+1 (555) 000-0000"
                        type="tel"
                        value={form.phone}
                        onChange={(e) => patch({ phone: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label
                      className="text-xs text-on-midnight-variant"
                      htmlFor="profession"
                    >
                      Profession <span className="opacity-60">(optional)</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="material-symbols-outlined text-on-midnight-variant/50 text-[18px]">
                          work
                        </span>
                      </div>
                      <input
                        id="profession"
                        className={inputClass}
                        placeholder="e.g. Software Engineer"
                        value={form.profession}
                        onChange={(e) => patch({ profession: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label
                      className="text-xs text-on-midnight-variant"
                      htmlFor="age"
                    >
                      Age <span className="opacity-60">(optional)</span>
                    </label>
                    <input
                      id="age"
                      className="w-full px-3 py-2.5 bg-midnight-light border border-midnight-light rounded-xl text-sm text-on-midnight focus:ring-2 focus:ring-mint focus:border-mint transition-all outline-none placeholder:text-on-midnight-variant/30"
                      placeholder="Age"
                      type="number"
                      min={13}
                      max={120}
                      value={form.age}
                      onChange={(e) => patch({ age: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      className="text-xs text-on-midnight-variant"
                      htmlFor="gender"
                    >
                      Gender <span className="opacity-60">(optional)</span>
                    </label>
                    <BasicDropdown
                      className="w-full"
                      size="md"
                      items={GENDER_OPTIONS}
                      label="Select"
                      onChange={(item) => patch({ gender: String(item.id) })}
                      value={
                        form.gender
                          ? {
                              id: form.gender,
                              label:
                                GENDER_OPTIONS.find(
                                  (g) => g.id === form.gender
                                )?.label || form.gender,
                            }
                          : null
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleContinue(true)}
                  className="w-full sm:w-auto px-6 py-3.5 text-sm font-semibold text-on-midnight-variant hover:text-mint transition-colors rounded-xl disabled:opacity-50 cursor-pointer"
                >
                  Skip optional details
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto px-8 py-3 bg-mint text-[#051424] text-sm font-bold rounded-xl hover:bg-mint-dark transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {submitting ? "Saving..." : "Continue"}
                  {!submitting && (
                    <span className="material-symbols-outlined text-[20px]">
                      arrow_forward
                    </span>
                  )}
                </button>
              </div>
            </motion.form>
          )}

          {/* ── STEP 2: Preferences ── */}
          {step === 2 && (
            <motion.form
              key="step2"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              onSubmit={(e) => {
                e.preventDefault();
                handleContinue(false);
              }}
            >
              <div className="space-y-4 mb-6">
                <div className="space-y-1">
                  <label
                    className="text-xs text-on-midnight-variant"
                    htmlFor="language"
                  >
                    Preferred Language
                  </label>
                  <BasicDropdown
                    className="w-full"
                    size="md"
                    items={LANGUAGES}
                    label="Select a language"
                    onChange={(item) => patch({ language: String(item.id) })}
                    value={
                      form.language
                        ? {
                            id: form.language,
                            label:
                              LANGUAGES.find((l) => l.id === form.language)
                                ?.label || form.language,
                          }
                        : null
                    }
                  />
                </div>

                <div className="space-y-1">
                  <label
                    className="text-xs text-on-midnight-variant"
                    htmlFor="address"
                  >
                    Service Area / Address
                  </label>
                  <div className="relative">
                    <div className="absolute top-3 left-0 pl-3 flex items-start pointer-events-none">
                      <span className="material-symbols-outlined text-on-midnight-variant/50 text-[18px]">
                        location_on
                      </span>
                    </div>
                    <textarea
                      id="address"
                      className="w-full pl-10 pr-4 py-2.5 bg-midnight-light border border-midnight-light rounded-xl text-sm text-on-midnight focus:ring-2 focus:ring-mint focus:border-mint transition-all outline-none placeholder:text-on-midnight-variant/30 resize-none"
                      placeholder="Sector 45, Gurgaon, Haryana"
                      rows={2}
                      value={form.address}
                      onChange={(e) => patch({ address: e.target.value })}
                    />
                  </div>
                </div>

                <div className="bg-midnight-light border border-midnight-light rounded-xl p-4 flex items-center gap-3">
                  <span className="material-symbols-outlined text-mint text-xl">
                    verified
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-on-midnight">
                      Premium experience
                    </p>
                    <p className="text-xs text-on-midnight-variant">
                      Personalized matches, priority support, and exclusive
                      offers unlock once your profile is complete.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-full sm:w-auto px-6 py-2.5 text-sm font-semibold text-on-midnight-variant hover:text-mint transition-colors rounded-xl cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto px-8 py-3 bg-mint text-[#051424] text-sm font-bold rounded-xl hover:bg-mint-dark transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {submitting ? "Saving..." : "Continue"}
                  {!submitting && (
                    <span className="material-symbols-outlined text-[20px]">
                      arrow_forward
                    </span>
                  )}
                </button>
              </div>
            </motion.form>
          )}

          {/* ── STEP 3: Ready ── */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="space-y-4"
            >
              <div className="bg-midnight-light border border-midnight-light rounded-2xl p-4 space-y-1">
                {[
                  { label: "Name", value: form.name },
                  { label: "Email", value: form.email },
                  { label: "Phone", value: form.phone },
                  {
                    label: "Profession",
                    value: form.profession || "—",
                  },
                  {
                    label: "Age",
                    value: form.age ? `${form.age} years` : "—",
                  },
                  {
                    label: "Gender",
                    value:
                      GENDER_OPTIONS.find((g) => g.id === form.gender)
                        ?.label || "—",
                  },
                  {
                    label: "Language",
                    value:
                      LANGUAGES.find((l) => l.id === form.language)
                        ?.label || form.language,
                  },
                  { label: "Address", value: form.address || "—" },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-4 py-1 border-b border-midnight-light last:border-0"
                  >
                    <span className="text-xs text-on-midnight-variant">
                      {row.label}
                    </span>
                    <span className="text-sm font-semibold text-on-midnight text-right truncate max-w-[60%]">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="w-full sm:w-auto px-6 py-2.5 text-sm font-semibold text-on-midnight-variant hover:text-mint transition-colors rounded-xl cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleFinish}
                  disabled={submitting}
                  className="w-full sm:w-auto px-8 py-3 bg-mint text-[#051424] text-sm font-bold rounded-xl hover:bg-mint-dark transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {submitting ? "Finishing..." : "Finish & Go to Dashboard"}
                  {!submitting && (
                    <span className="material-symbols-outlined text-[20px]">
                      check_circle
                    </span>
                  )}
                </button>
              </div>
              </motion.div>
            )}
          </div>
      </main>
    </div>
  );
}

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
import { type JellyBlobMood } from "@/components/feral-blob";
import { FormCompanionBlob } from "@/components/ui/FormCompanionBlob";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { User } from "@/types";

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
  { id: "urdu", label: "Urdu" },
];

// `pickUnique` pulls a random line from a copy pool, avoiding immediate repeats.
function pickUnique(pool: string[], last: string | null): string {
  const options = pool.length > 1 && last ? pool.filter((m) => m !== last) : pool;
  return options[Math.floor(Math.random() * options.length)];
}

const COUNTRY_CODES = [
  { id: "+91", label: "+91 (IN)" },
  { id: "+1", label: "+1 (US)" },
  { id: "+44", label: "+44 (UK)" },
  { id: "+971", label: "+971 (AE)" },
  { id: "+966", label: "+966 (SA)" },
  { id: "+61", label: "+61 (AU)" },
  { id: "+86", label: "+86 (CN)" },
  { id: "+81", label: "+81 (JP)" },
  { id: "+49", label: "+49 (DE)" },
  { id: "+33", label: "+33 (FR)" },
];

// The companion blob's fun, English copy pools (per-field nudges + openers).
const BLOB_FIELDS: Record<string, string[]> = {
  name: [
    "Oh, you may have missed filling the name!",
    "I'd love to know your name — it's empty!",
    "Your name's missing — tell me what to call you!",
  ],
  phone: [
    "Let's start with your phone number — you got this!",
    "Your phone number is empty — I'll wait right here!",
    "Drop your digits so I can reach you later!",
  ],
  email: [
    "Just need your Gmail or Outlook email and we're good to go!",
    "Your email must be Gmail or Outlook — one quick line!",
    "Add your Gmail or Outlook email so I can keep in touch!",
  ],
  address: [
    "Drop your address so I can find the best helpers for you!",
    "I don't know where you are yet — add your address!",
    "Your address is missing — where should helpers go?",
  ],
};

const BLOB_OPENERS: Record<string, string[]> = {
  "3": [
    "Ooh, a blank slate! Love it — but I need a few things first!",
    "Fresh start! Just a few details and we're rolling.",
    "A totally empty form — my favorite! Let's fill it together.",
  ],
  "2": [
    "A couple things slipped through — no worries, we'll fix that!",
    "Two little gaps — you're super close!",
    "Almost done! Just two bits are missing.",
  ],
  "1": [
    "Psst — one little thing is missing!",
    "Just one field left to fill in!",
    "So close! A single blank is waiting for you.",
  ],
};

const EMAIL_OK_RE = /^[^\s@]+@(gmail\.com|outlook\.com|shuroqx\.com)$/i;

  const inputClass =
    "w-full rounded-xl border border-outline-variant bg-surface-container-low pl-10 pr-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface/40 focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none";
  const inputClassError =
    "w-full rounded-xl border border-red-500 bg-red-50 pl-10 pr-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface/40 focus:ring-2 focus:ring-red-400 focus:border-red-500 transition-all outline-none";

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-surface-container-lowest">
          <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
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
    phoneCountry: "+91",
    profession: "",
    age: "",
    gender: "",
    language: "english",
    address: "",
  });

  // Stepper labels (plain English).
  const STEPS = [
    { label: "Identity" },
    { label: "Preferences" },
    { label: "Ready" },
  ];

  const [activeField, setActiveField] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());
  const [validationSpeech, setValidationSpeech] = useState<string | null>(null);

  const [typing, setTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const validationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track last-shown copy so repeated nudges/errors don't repeat the same line.
  const currentHintFieldRef = useRef<string | null>(null);
  const lastHintRef = useRef<Record<string, string>>({});
  const lastOpenerRef = useRef<string | null>(null);
  const lastFieldMsgRef = useRef<Record<string, string | null>>({});
  const bumpTyping = () => {
    setTyping(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(false), 700);
  };

  // Clean up validation timer on unmount
  useEffect(() => {
    return () => {
      if (validationTimer.current) clearTimeout(validationTimer.current);
    };
  }, []);

  // ── Load profile (fresh from server) + prefill from the session user ──
  // Runs ONCE: re-running on every `user` change (which happens after each
  // save via patchUser) would refetch and overwrite in-progress edits.
  const didLoadRef = useRef(false);
  useEffect(() => {
    if (!user || didLoadRef.current) return;
    didLoadRef.current = true;

    const rawPhone = (user as User).phone || "";
    let phoneCountry = "+91";
    let phoneDigits = rawPhone;
    for (const c of COUNTRY_CODES) {
      if (rawPhone.startsWith(c.id)) {
        phoneCountry = c.id;
        phoneDigits = rawPhone.slice(c.id.length);
        break;
      }
    }

    const base = {
      name: user.name || "",
      email: user.email || "",
      phone: phoneDigits,
      phoneCountry,
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

        const profPhone = profile.phone || "";
        let profCountry = "+91";
        let profDigits = profPhone;
        for (const c of COUNTRY_CODES) {
          if (profPhone.startsWith(c.id)) {
            profCountry = c.id;
            profDigits = profPhone.slice(c.id.length);
            break;
          }
        }

        setForm((f) => ({
          ...f,
          name: profile.name || f.name,
          email: profile.email || f.email,
          phone: profDigits || f.phone,
          phoneCountry: profCountry,
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

  const patch = (p: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...p }));
    bumpTyping();
    // Clear any validation error for fields being edited
    const keys = Object.keys(p);
    if (keys.length) {
      setFieldErrors((prev) => {
        const next = new Set(prev);
        keys.forEach((k) => next.delete(k));
        return next;
      });
      setValidationSpeech(null);
    }
  };

  // Empty-field nudge: while the step still has any required field empty, the blob
  // speaks ONLY the nudge (focused-empty field first, else the first empty field) —
  // never the per-field focus lines. Focus lines return once the step is complete.
  const REQUIRED_NOW =
    step === 1 ? ["name", "phone", "email"] : step === 2 ? ["address"] : [];
  const isFieldEmpty = (f: string) => {
    const v = String(form[f as keyof typeof form] ?? "").trim();
    if (!v) return true;
    // Email must be a real Gmail/Outlook address, not just non-empty.
    if (f === "email") return !EMAIL_OK_RE.test(v);
    return false;
  };
  const stepHasEmpty = REQUIRED_NOW.some(isFieldEmpty);
  const focusEmpty =
    activeField && activeField !== "dropdown" && isFieldEmpty(activeField);
  const firstEmpty = REQUIRED_NOW.find(isFieldEmpty) ?? null;
  const hintField = stepHasEmpty ? (focusEmpty ? activeField : firstEmpty) : null;

  // Varied per-field nudge, stable while the same field stays focused.
  const getNudge = (field: string): string | null => {
    const pool = BLOB_FIELDS[field];
    if (!pool) return null;
    if (currentHintFieldRef.current === field && lastHintRef.current[field]) {
      return lastHintRef.current[field];
    }
    currentHintFieldRef.current = field;
    const msg = pickUnique(pool, lastHintRef.current[field] ?? null);
    lastHintRef.current = { ...lastHintRef.current, [field]: msg };
    return msg;
  };
  const liveHint = hintField ? getNudge(hintField) : null;

  // Friendly idle greeting — the blob greets in the chosen language.
  const idleGreeting = form.name.trim()
    ? `Hi ${form.name.trim()}!`
    : "Hi there! Let's set up your profile.";
  const companionMessage =
    validationSpeech ??
    liveHint ??
    (!activeField && !typing ? idleGreeting : null);

  const blobMood: JellyBlobMood = validationSpeech || liveHint
    ? "hmm"
    : !activeField && !typing
      ? "happy"
      : activeField === "dropdown"
        ? "hmm"
        : "happy";
  const blobGaze = companionMessage && !activeField
    ? { x: 0, y: 6 }
    : !activeField
      ? { x: 0, y: 0 }
      : activeField === "dropdown"
        ? { x: -6, y: -6 }
        : { x: 10, y: 20 };
  const blobNod = typing;

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
    // Cancel any pending Phase-2 blob message so it can't fire after we advance.
    if (validationTimer.current) {
      clearTimeout(validationTimer.current);
      validationTimer.current = null;
    }
    if (step === 1) {
      // Priority order: name -> phone -> email. We address ONE field at a time.
      const order = ["name", "phone", "email"] as const;
      const isEmpty = (f: (typeof order)[number]) =>
        f === "phone"
          ? !form.phone.trim() || form.phone.length !== 10
          : f === "email"
            ? !form.email.trim() || !EMAIL_OK_RE.test(form.email.trim())
            : !String(form[f]).trim();
      const missing = order.filter(isEmpty);

      if (missing.length > 0) {
        if (validationTimer.current) clearTimeout(validationTimer.current);
        const first = missing[0];
        // Only highlight the field we're currently prompting for.
        setFieldErrors(new Set([first]));

        const openerPool = BLOB_OPENERS[String(missing.length)] ?? BLOB_OPENERS["1"];
        const opener = pickUnique(openerPool, lastOpenerRef.current);
        lastOpenerRef.current = opener;

        const perFieldPool = BLOB_FIELDS[first] ?? BLOB_FIELDS.name;
        const perFieldMsg = pickUnique(
          perFieldPool,
          lastFieldMsgRef.current[first] ?? null
        );
        lastFieldMsgRef.current = {
          ...lastFieldMsgRef.current,
          [first]: perFieldMsg,
        };

        // Phase 1: fun opener (count-aware)
        setActiveField(null);
        setValidationSpeech(opener);
        // Phase 2: after 1.5s, point to the first empty field, fun & specific
        validationTimer.current = setTimeout(() => {
          setActiveField(first);
          setValidationSpeech(perFieldMsg);
          validationTimer.current = null;
        }, 1500);
        return;
      }

      const ageNum = form.age ? Number(form.age) : null;
      if (ageNum !== null && (ageNum < 13 || ageNum > 120)) {
        showToast("Age must be between 13 and 120.", "error");
        return;
      }

      setSubmitting(true);
      try {
        await saveStep({
          name: form.name.trim(),
          phone: `${form.phoneCountry}${form.phone.trim()}`,
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
      if (!form.address.trim()) {
        if (validationTimer.current) clearTimeout(validationTimer.current);
        setFieldErrors(new Set(["address"]));
        const openerPool = BLOB_OPENERS["1"];
        const opener = pickUnique(openerPool, lastOpenerRef.current);
        lastOpenerRef.current = opener;
        // Phase 1: fun opener
        setActiveField(null);
        setValidationSpeech(opener);
        // Phase 2: specific
        const addressPool = BLOB_FIELDS.address;
        const addressMsg = pickUnique(addressPool, lastFieldMsgRef.current.address ?? null);
        lastFieldMsgRef.current = {
          ...lastFieldMsgRef.current,
          address: addressMsg,
        };
        validationTimer.current = setTimeout(() => {
          setActiveField("address");
          setValidationSpeech(addressMsg);
          validationTimer.current = null;
        }, 1500);
        return;
      }
      setSubmitting(true);
      try {
        await saveStep({
          language: form.language,
          address: form.address.trim(),
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
          <div className="bg-surface-container-lowest text-on-surface min-h-screen flex flex-col antialiased">
      {/* Top header — logo + theme toggle + help */}
      <header className="relative z-10 flex items-center justify-between w-full px-6 py-6 md:px-12 lg:px-20">
              <Logo size="lg" textColor="dark" />
        <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-2 text-sm text-on-surface-variant">
            <span>Need help?</span>
            <button
              aria-label="Help"
              className="flex items-center justify-center p-2 rounded-full hover:bg-surface-container-low transition-colors text-primary cursor-pointer"
            >
              <span className="material-symbols-outlined">help_outline</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main — single column, shifted toward the top */}
      <main className="flex-1 flex flex-col justify-start items-center p-6 md:p-10 lg:pt-8 lg:px-20 bg-surface-container-lowest relative">
        <div
          className="w-full max-w-2xl"
          onFocusCapture={(e) => {
            const t = e.target as HTMLElement;
            setActiveField(t.tagName === "BUTTON" ? "dropdown" : t.id || "field");
          }}
          onBlurCapture={() => setActiveField(null)}
        >
          {/* AnimatedStepper — shared component from specialist onboarding */}
          <div className="mb-10">
            <AnimatedStepper currentStep={step - 1} steps={STEPS} />
          </div>

          <div className="mb-5">
            <div className="flex items-center gap-3">
              <motion.h2
                key={step}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="font-headline-lg text-2xl text-on-surface mb-1"
              >
                {step === 1 && "Create Profile"}
                {step === 2 && "Set Preferences"}
                {step === 3 && "You're all set"}
              </motion.h2>

              {/* Helmet — the onboarding mascot; sits right after the heading word and reacts to the focused field */}
              <FormCompanionBlob
                mood={blobMood}
                gaze={blobGaze}
                nod={blobNod}
                typing={typing}
                activeField={activeField}
                name={form.name}
                errorSpeech={companionMessage}
                debug={false}
                className="flex"
              />
            </div>
            <p className="text-on-surface-variant md:pr-32">
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
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                handleContinue(false);
              }}
            >
              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1 md:col-span-2">
                    <label
                        className="text-sm font-semibold text-on-surface-variant"
                      htmlFor="fullName"
                    >
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="material-symbols-outlined text-on-surface-variant/60 text-[18px]">
                          badge
                        </span>
                      </div>
                      <input
                        id="fullName"
                        className={fieldErrors.has("name") ? inputClassError : inputClass}
                        placeholder="Jane Doe"
                        value={form.name}
                        onChange={(e) => patch({ name: e.target.value })}
                        onFocus={() => setActiveField("name")}
                        onBlur={() => setActiveField(null)}
                        required
                      />
                    </div>
                  </div>

<div className="space-y-1">
                    <label
                        className="text-sm font-semibold text-on-surface-variant"
                      htmlFor="email"
                    >
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="material-symbols-outlined text-on-surface-variant/60 text-[18px]">
                          mail
                        </span>
                      </div>
                      <input
                        id="email"
                        className={
                          fieldErrors.has("email") ||
                          (form.email.length > 0 && !EMAIL_OK_RE.test(form.email))
                            ? inputClassError
                            : inputClass
                        }
                        placeholder="jane@example.com"
                        type="email"
                        value={form.email}
                        onChange={(e) => patch({ email: e.target.value })}
                        onFocus={() => setActiveField("email")}
                        onBlur={() => setActiveField(null)}
                        required
                      />
                    </div>
                    {form.email.length > 0 && !EMAIL_OK_RE.test(form.email) && (
                      <p className="text-xs text-amber-600 mt-1">Only Gmail, Outlook, or ShuroqX (@shuroqx.com) emails are accepted.</p>
                    )}
                  </div>

<div className="space-y-1">
                    <label
                        className="text-sm font-semibold text-on-surface-variant"
                      htmlFor="phone"
                    >
                      Phone Number <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      <div className="w-[120px] shrink-0">
                        <BasicDropdown
                          className="w-full"
                          size="md"
                          items={COUNTRY_CODES}
                          label="+91 (IN)"
                          onChange={(item) => patch({ phoneCountry: String(item.id) })}
                          value={{
                            id: form.phoneCountry,
                            label: COUNTRY_CODES.find((c) => c.id === form.phoneCountry)?.label || form.phoneCountry,
                          }}
                        />
                      </div>
                      <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <span className="material-symbols-outlined text-on-surface-variant/60 text-[18px]">
                            call
                          </span>
                        </div>
                        <input
                          id="phone"
                          className={fieldErrors.has("phone") ? inputClassError : inputClass}
                          placeholder="0000000000"
                          type="tel"
                          inputMode="numeric"
                          maxLength={10}
                          pattern="[0-9]{10}"
                          value={form.phone}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                            patch({ phone: digits });
                          }}
                          onFocus={() => setActiveField("phone")}
                          onBlur={() => setActiveField(null)}
                          required
                        />
                      </div>
                    </div>
                    {form.phone.length > 0 && form.phone.length < 10 && (
                      <p className="text-xs text-amber-600 mt-1">Phone number must be 10 digits</p>
                    )}
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label
                        className="text-sm font-semibold text-on-surface-variant"
                      htmlFor="profession"
                    >
                      Profession <span className="opacity-60">(optional)</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="material-symbols-outlined text-on-surface-variant/60 text-[18px]">
                          work
                        </span>
                      </div>
                      <input
                        id="profession"
                        className={inputClass}
                        placeholder=""
                        value={form.profession}
                        onChange={(e) => patch({ profession: e.target.value })}
                        onFocus={() => setActiveField("profession")}
                        onBlur={() => setActiveField(null)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label
                        className="text-sm font-semibold text-on-surface-variant"
                      htmlFor="age"
                    >
                      Age <span className="opacity-60">(optional)</span>
                    </label>
                    <input
                      id="age"
                        className="w-full px-3 py-2.5 bg-surface-container-low border border-outline-variant rounded-xl text-sm text-on-surface focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none placeholder:text-on-surface/40"
                      placeholder="Age"
                      type="number"
                      min={13}
                      max={120}
                      value={form.age}
                        onChange={(e) => patch({ age: e.target.value })}
                        onFocus={() => setActiveField("age")}
                        onBlur={() => setActiveField(null)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                        className="text-sm font-semibold text-on-surface-variant"
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
                  className="w-full sm:w-auto px-6 py-3.5 text-sm font-semibold text-on-surface-variant hover:text-primary transition-colors rounded-xl disabled:opacity-50 cursor-pointer"
                >
                  Skip optional details
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto px-8 py-3 bg-white text-primary border border-primary text-sm font-bold rounded-xl hover:bg-primary/10 dark:bg-surface-container-high dark:text-on-surface dark:border-outline-variant dark:hover:bg-surface-container-highest transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                handleContinue(false);
              }}
            >
              <div className="space-y-4 mb-6">
                <div className="space-y-1">
                  <label
                    className="text-sm font-semibold text-on-surface-variant"
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
                    className="text-sm font-semibold text-on-surface-variant"
                    htmlFor="address"
                  >
                    Service Area / Address <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute top-3 left-0 pl-3 flex items-start pointer-events-none">
                      <span className="material-symbols-outlined text-on-surface-variant/60 text-[18px]">
                        location_on
                      </span>
                    </div>
<textarea
                      id="address"
                       className={fieldErrors.has("address") ? "w-full pl-10 pr-4 py-2.5 bg-red-50 border border-red-500 rounded-xl text-sm text-on-surface focus:ring-2 focus:ring-red-400 focus:border-red-500 transition-all outline-none placeholder:text-on-surface/40 resize-none" : "w-full pl-10 pr-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-xl text-sm text-on-surface focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none placeholder:text-on-surface/40 resize-none"}
                      placeholder="Sector 45, Gurgaon, Haryana"
                      rows={2}
                      value={form.address}
                      onChange={(e) => patch({ address: e.target.value })}
                        onFocus={() => setActiveField("address")}
                        onBlur={() => setActiveField(null)}
                        required
                    />
                  </div>
                </div>

                <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary text-xl">
                    verified
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-on-surface">
                      Premium experience
                    </p>
                    <p className="text-sm font-semibold text-on-surface-variant">
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
                  className="w-full sm:w-auto px-6 py-2.5 text-sm font-semibold text-on-surface-variant hover:text-primary transition-colors rounded-xl cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto px-8 py-3 bg-white text-primary border border-primary text-sm font-bold rounded-xl hover:bg-primary/10 dark:bg-surface-container-high dark:text-on-surface dark:border-outline-variant dark:hover:bg-surface-container-highest transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
                <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-4 space-y-1">
                {[
                  { label: "Name", value: form.name },
                  { label: "Email", value: form.email },
                  { label: "Phone", value: form.phone ? `${form.phoneCountry}${form.phone}` : "—" },
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
                    className="flex items-center justify-between gap-4 py-1 border-b border-outline-variant last:border-0"
                  >
                    <span className="text-sm font-semibold text-on-surface-variant">
                      {row.label}
                    </span>
                    <span className="text-sm font-semibold text-on-surface text-right truncate max-w-[60%]">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="w-full sm:w-auto px-6 py-2.5 text-sm font-semibold text-on-surface-variant hover:text-primary transition-colors rounded-xl cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleFinish}
                  disabled={submitting}
                  className="w-full sm:w-auto px-8 py-3 bg-white text-primary border border-primary text-sm font-bold rounded-xl hover:bg-primary/10 dark:bg-surface-container-high dark:text-on-surface dark:border-outline-variant dark:hover:bg-surface-container-highest transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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

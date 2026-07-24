"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { servicesApi, userApi, workerApi } from "@/lib/api";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  switchToSpecialist,
  fetchSpecialistProfile,
  setActiveMode,
  patchUser,
} from "@/store/slices/authSlice";
import { useToast } from "@/components/ui/Toast";
import AnimatedStepper from "@/components/smoothui/components/animated-stepper";
import type { ServiceOption } from "@/types";

// Service → icon mapping
const SERVICE_ICONS: Record<string, string> = {
  Electrical: "bolt",
  Plumbing: "plumbing",
  Carpentry: "carpenter",
  Painting: "format_paint",
  "AC Repair": "ac_unit",
  Massage: "self_care",
  Cleaning: "cleaning_services",
  Gardening: "yard",
  "Appliance Repair": "kitchen",
};

const STEPS = [
  { n: 1, label: "Create profile" },
  { n: 2, label: "Choose your skills" },
  { n: 3, label: "Verification" },
  { n: 4, label: "Go online & earn" },
];

const stepperSteps = STEPS.map((s) => ({ label: s.label }));

interface SelectedSkill {
  service_id: string;
  name: string;
  price: string;
  experience: string;
}

export default function SpecialistOnboarding() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { user, activeMode, specialistProfile, isLoading, error } = useAppSelector((s) => s.auth);
  const { showToast } = useToast();

  const currentProfile = specialistProfile?.userId === user?.id ? specialistProfile : null;

  const [services, setServices] = useState<ServiceOption[]>([]);
  const [serviceError, setServiceError] = useState("");

  // Massage is not an offered category — exclude it from selection.
  const availableServices = services.filter((s) => s.name !== "Massage");

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [profile, setProfile] = useState({
    name: "",
    phone: "",
    address: "",
    email: "",
  });

  const [selected, setSelected] = useState<SelectedSkill[]>([]);
  const [availability, setAvailability] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // ── Load services + prefill profile from the existing user account ──
  useEffect(() => {
    servicesApi
      .getServices()
      .then(setServices)
      .catch((err) =>
        setServiceError(err instanceof Error ? err.message : "Unable to load services")
      );

    if (user) {
      setProfile({
        name: user.name || "",
        phone: (user as unknown as { phone?: string }).phone || "",
        address: (user as unknown as { address?: string }).address || "",
        email: user.email || "",
      });
    }
  }, [user]);

  // ── Guard: onboarding is a Specialist-only flow ──
  // Don't show it while the user is in client ("User") mode, and don't
  // show it to users who are already verified specialists. Rejected
  // profiles are allowed back in to update their documents.
  useEffect(() => {
    if (currentProfile?.verificationStatus === "approved") {
      router.replace("/dashboard/specialist");
    } else if (!currentProfile && activeMode === "client") {
      router.replace("/dashboard/client");
    }
  }, [currentProfile, activeMode, router]);

  if (currentProfile?.verificationStatus === "approved") {
    return null;
  }
  if (!currentProfile && activeMode === "client") {
    return null;
  }

  // ── Skill selection (multi-select, max 3) ──
  function toggleSkill(svc: ServiceOption) {
    setSelected((prev) => {
      if (prev.some((s) => s.service_id === svc.id)) {
        return prev.filter((s) => s.service_id !== svc.id);
      }
      if (prev.length >= 3) {
        showToast("You can select up to 3 skills.", "info");
        return prev;
      }
      return [
        ...prev,
        { service_id: svc.id, name: svc.name, price: "", experience: "" },
      ];
    });
  }

  function updateSkill(
    service_id: string,
    field: "price" | "experience",
    value: string
  ) {
    setSelected((prev) =>
      prev.map((s) => (s.service_id === service_id ? { ...s, [field]: value } : s))
    );
  }

  const canContinueStep1 = profile.name.trim().length > 0;
  const canContinueStep2 = selected.length > 0;

  // ── Submit for verification ──
  async function handleSubmit() {
    if (!user) return;
    if (selected.length === 0) {
      showToast("Please select at least one skill.", "error");
      setStep(2);
      return;
    }

    setSubmitting(true);
    try {
      // 1. Persist personal details on the existing user account
      const updated = await userApi.updateProfile({
        name: profile.name,
        phone: profile.phone,
        address: profile.address,
      });
      dispatch(patchUser({ name: updated.name, phone: updated.phone, address: updated.address }));

      // 2. Create the specialist profile with the primary skill
      const primary = selected[0];
      const res = await dispatch(
        switchToSpecialist({ userId: user.id, service_id: primary.service_id })
      ).unwrap();
      const workerId = res.workerId;

      // 3. Submit the remaining skills (allowed in bulk during onboarding)
      for (let i = 1; i < selected.length; i++) {
        const s = selected[i];
        await workerApi
          .addService(workerId, s.service_id, {
            price_override: s.price ? Number(s.price) : undefined,
            experience_years: s.experience ? Number(s.experience) : undefined,
          })
          .catch((e) => console.warn("Additional skill not added:", e));
      }

      // 4. Refresh store + enter specialist mode
      await dispatch(fetchSpecialistProfile(user.id));
      dispatch(setActiveMode("specialist"));

      showToast("Submitted for verification! Admin will review shortly.", "success");
      router.replace("/dashboard/specialist");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Submission failed. Please try again.",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  }

  // ── Save as draft (persist personal details only) ──
  async function handleSaveDraft() {
    if (!user) return;
    setSavingDraft(true);
    try {
      const updated = await userApi.updateProfile({
        name: profile.name,
        phone: profile.phone,
        address: profile.address,
      });
      dispatch(patchUser({ name: updated.name, phone: updated.phone, address: updated.address }));
      showToast("Draft saved. You can continue anytime.", "info");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save details.", "error");
    } finally {
      setSavingDraft(false);
    }
  }

  return (
    <div className="min-h-screen bg-background font-sans text-on-surface">

      {/* ── Main Content (sidebar is provided by the dashboard layout) ── */}
      <main className="flex-1 min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 border-b border-outline-variant bg-surface/80 backdrop-blur-md shadow-sm flex items-center justify-between px-4 sm:px-6 lg:px-10 lg:ml-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("shuroqx-open-mobile-nav"))}
              className="lg:hidden p-2 -ml-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-colors cursor-pointer"
              aria-label="Open menu"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <span className="font-bold text-primary">Specialist Portal</span>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-container/40 text-primary text-[11px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Onboarding in progress
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:block text-xs font-semibold text-on-surface-variant">
              Step {step} of 4
            </span>
            <button className="material-symbols-outlined text-on-surface-variant hover:text-primary transition-colors cursor-pointer">
              notifications
            </button>
            <button className="material-symbols-outlined text-on-surface-variant hover:text-primary transition-colors cursor-pointer">
              help_outline
            </button>
          </div>
        </header>

        <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-10 max-w-screen-2xl mx-auto space-y-8 sm:space-y-10">
          {/* Hero */}
          <section className="text-center mx-auto max-w-2xl">
            <h2 className="text-2xl font-extrabold text-on-surface">
              Become a ShuroqX Specialist
            </h2>
            <p className="text-sm text-on-surface-variant mt-1">
              Start earning by offering your skills to nearby customers.
            </p>
          </section>

          {/* Progress indicator */}
          <AnimatedStepper
            currentStep={step - 1}
            steps={stepperSteps}
            className="mb-2"
          />

          {/* ── STEP 1: Create profile ── */}
          {step === 1 && (
              <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 lg:p-8 shadow-sm space-y-5 max-w-2xl mx-auto">
              <h3 className="text-lg font-bold text-on-surface uppercase tracking-wide text-on-surface-variant text-xs">
                Personal Details
              </h3>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant">Full Name</label>
                <input
                  value={profile.name}
                  onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full bg-surface border border-outline-variant rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant">Email</label>
                <input
                  value={profile.email}
                  onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                  placeholder="you@example.com"
                  className="w-full bg-surface border border-outline-variant rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant">Phone Number</label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-outline-variant bg-surface-container text-on-surface-variant text-sm">
                    +91
                  </span>
                  <input
                    value={profile.phone}
                    onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="9876543210"
                    className="flex-1 min-w-0 bg-surface border border-outline-variant rounded-r-xl p-3 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant">
                  Service Area / Address
                </label>
                <textarea
                  value={profile.address}
                  onChange={(e) => setProfile((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Sector 45, Gurgaon, Haryana"
                  rows={2}
                  className="w-full bg-surface border border-outline-variant rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-none"
                />
              </div>
            </section>
          )}

          {/* ── STEP 2: Choose your skills ── */}
          {step === 2 && (
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-on-surface">Choose your services</h3>
                  {selected.length > 0 && (
                    <span className="px-3 py-1 bg-secondary-fixed text-on-secondary-fixed rounded-full text-xs font-bold">
                      {selected.length} Selected
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 items-start">
                  {availableServices.map((svc) => {
                    const isSel = selected.some((s) => s.service_id === svc.id);
                    return (
                      <div key={svc.id}>
                        <button
                          onClick={() => toggleSkill(svc)}
                          className={`w-full p-4 rounded-xl border text-left transition-all ${
                            isSel
                              ? "border-2 border-primary bg-primary-container/5"
                              : "border border-outline-variant hover:border-primary hover:bg-primary-container/5"
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div
                              className={`p-2 rounded-lg ${
                                isSel
                                  ? "bg-primary-container/20 text-primary"
                                  : "bg-surface-container text-on-surface-variant"
                              }`}
                            >
                              <span className="material-symbols-outlined">
                                {SERVICE_ICONS[svc.name] || "handyman"}
                              </span>
                            </div>
                            {isSel && (
                              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                <span className="material-symbols-outlined text-[14px] text-on-primary">
                                  check
                                </span>
                              </div>
                            )}
                          </div>
                          <p className="mt-3 font-semibold text-sm text-on-surface">{svc.name}</p>
                        </button>
                      </div>
                    );
                  })}

                  {!availableServices.length && (
                    <p className="col-span-full py-6 text-center text-sm text-on-surface-variant">
                      {serviceError || "Loading services..."}
                    </p>
                  )}
                </div>
              </div>

              {/* Live preview / summary */}
              <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm space-y-3 h-fit">
                <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
                  Selected Skills
                </h3>
                {selected.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">
                    No skills selected yet. Pick the services you offer.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {selected.map((s) => (
                      <li
                        key={s.service_id}
                        className="bg-surface-container rounded-xl p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm text-on-surface truncate">
                            {s.name}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              toggleSkill({ id: s.service_id, name: s.name } as ServiceOption)
                            }
                            className="text-on-surface-variant hover:text-error transition-colors shrink-0"
                            aria-label={`Remove ${s.name}`}
                          >
                            <span className="material-symbols-outlined text-[18px]">close</span>
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] uppercase tracking-wider text-outline">
                              Price (₹/hr)
                            </label>
                            <input
                              value={s.price}
                              onChange={(e) =>
                                updateSkill(
                                  s.service_id,
                                  "price",
                                  e.target.value.replace(/[^0-9]/g, "")
                                )
                              }
                              placeholder="450"
                              className="w-full bg-surface border border-outline-variant rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase tracking-wider text-outline">
                              Exp (Yrs)
                            </label>
                            <input
                              value={s.experience}
                              onChange={(e) =>
                                updateSkill(
                                  s.service_id,
                                  "experience",
                                  e.target.value.replace(/[^0-9]/g, "")
                                )
                              }
                              placeholder="5"
                              className="w-full bg-surface border border-outline-variant rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                            />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                 <p className="text-[11px] text-on-surface-variant pt-2">
                   You can add up to 3 skills. Each goes for admin approval.
                 </p>
              </div>
            </section>
          )}

          {/* ── STEP 3: Verification ── */}
          {step === 3 && (
              <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 lg:p-8 shadow-sm space-y-5 max-w-2xl mx-auto">
              <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
                Verification
              </h3>
              <div className="flex flex-col items-center justify-center text-center border-2 border-dashed border-outline-variant rounded-2xl p-10 space-y-4 bg-primary-container/5">
                <div className="w-14 h-14 rounded-full bg-primary-container/30 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-3xl">verified_user</span>
                </div>
                <p className="font-semibold text-base text-on-surface">
                  Your profile will be reviewed by our team
                </p>
                <p className="text-sm text-on-surface-variant max-w-md">
                  No document upload is required. Once you submit, our team verifies
                  your details and approves your specialist account. You&apos;ll be able
                  to accept requests as soon as you&apos;re approved.
                </p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                Verification usually takes ~24 hours. You can start accepting requests
                once approved.
              </div>
            </section>
          )}

          {/* ── STEP 4: Go online & earn ── */}
          {step === 4 && (
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm space-y-4">
                  <h3 className="text-lg font-bold text-on-surface">Review &amp; Confirm</h3>
                  <div className="divide-y divide-outline-variant/50 text-sm">
                    <div className="flex justify-between py-2">
                      <span className="text-on-surface-variant">Name</span>
                      <span className="font-semibold text-on-surface text-right">
                        {profile.name || user?.email}
                      </span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-on-surface-variant">Phone</span>
                      <span className="font-semibold text-on-surface text-right">
                        +91 {profile.phone || "—"}
                      </span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-on-surface-variant">Service Area</span>
                      <span className="font-semibold text-on-surface text-right max-w-[60%]">
                        {profile.address || "—"}
                      </span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-on-surface-variant">Skills</span>
                      <span className="font-semibold text-primary text-right">
                        {selected.map((s) => s.name).join(", ") || "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">power_settings_new</span>
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm text-on-surface">
                        Available for jobs
                      </span>
                      <span className="text-[10px] text-on-surface-variant italic">
                        Activates after verification
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setAvailability((v) => !v)}
                    className={`w-12 h-6 rounded-full relative transition-colors ${
                      availability ? "bg-primary" : "bg-outline-variant"
                    }`}
                  >
                    <div
                      className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        availability ? "left-7" : "left-1"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Footer actions */}
          <footer className="flex flex-col md:flex-row items-center justify-between gap-4 pt-4 border-t border-outline-variant">
            <div className="flex gap-3 w-full md:w-auto">
              {step > 1 && (
                <button
                  onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3 | 4)}
                  className="px-6 py-3 rounded-full border border-outline-variant text-on-surface-variant font-semibold hover:bg-surface-container-low transition-colors cursor-pointer"
                >
                  Back
                </button>
              )}
              <button
                onClick={handleSaveDraft}
                disabled={savingDraft}
                className="px-6 py-3 rounded-full border border-primary text-primary font-semibold hover:bg-primary-container/10 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {savingDraft ? "Saving..." : "Save as draft"}
              </button>
            </div>

            {step < 4 ? (
              <button
                onClick={() => {
                  if (step === 1 && !canContinueStep1) {
                    showToast("Please enter your name to continue.", "info");
                    return;
                  }
                  if (step === 2 && !canContinueStep2) {
                    showToast("Select at least one skill to continue.", "info");
                    return;
                  }
                  setStep((s) => (s + 1) as 1 | 2 | 3 | 4);
                }}
                className="w-full md:w-auto px-10 py-3 rounded-full bg-primary text-on-primary font-semibold shadow-lg shadow-primary-container/40 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
              >
                Continue
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting || isLoading}
                className="w-full md:w-auto px-10 py-3 rounded-full bg-primary text-on-primary font-semibold shadow-lg shadow-primary-container/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-60 cursor-pointer"
              >
                {submitting ? "Submitting..." : "Submit for Verification"}
              </button>
            )}
          </footer>

          {error && (
            <p className="text-sm font-medium text-red-600 text-center">{error}</p>
          )}
        </div>
      </main>
    </div>
  );
}

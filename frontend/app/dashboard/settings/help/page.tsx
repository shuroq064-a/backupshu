"use client";

import { useState } from "react";
import Link from "next/link";
import BackButton from "@/components/ui/BackButton";

const FAQS = [
  {
    q: "How do I book a specialist?",
    a: "Go to the Discover page or open the AI Service Assistant and describe what you need (e.g. 'My sink is leaking'). The assistant shows verified specialists near you with prices and ETAs — tap one to book instantly. You need a service location set and a complete profile to book.",
  },
  {
    q: "How are specialists verified?",
    a: "Every specialist goes through identity verification (ID proof and background check) before they can accept bookings. You can always check a specialist's rating, reviews, and verification badge on their profile card.",
  },
  {
    q: "What payment methods are accepted?",
    a: "Bookings are paid online through secure payment (UPI, cards, net banking) or by cash on completion, depending on the specialist's settings. You'll see the total before confirming.",
  },
  {
    q: "How do I track my specialist?",
    a: "Once a specialist accepts your booking, open My Bookings and tap the booking to see live status and map tracking — from 'on the way' to 'started' to 'completed'.",
  },
  {
    q: "How does the completion OTP work?",
    a: "When the job is done, the specialist asks for a 4-digit OTP that appears in your booking. Entering it confirms the work is complete and releases payment.",
  },
  {
    q: "Can I cancel a booking?",
    a: "Yes — open My Bookings and cancel an upcoming booking before the specialist reaches you. Cancellation is also available in the AI assistant ('cancel my booking').",
  },
  {
    q: "How do I change my service location?",
    a: "Tap the PIN chip in the assistant header (or the location card on the Discover page) to pick a new address or use your current GPS location. Specialists are matched within 5 km of that location.",
  },
  {
    q: "I forgot my password. What do I do?",
    a: "On the login screen choose 'Forgot password' to reset it. If you signed up with Google, keep using Sign in with Google — no password needed.",
  },
  {
    q: "How do I become a specialist?",
    a: "Switch to specialist mode from the sidebar and complete onboarding — add your services, home base location, and identity documents. Our team verifies your profile, usually within 24-48 hours.",
  },
];

const CONTACTS = [
  {
    icon: "mail",
    title: "Email us",
    detail: "support@shuroqx.com",
    href: "mailto:support@shuroqx.com",
    label: "Write to us",
  },
  {
    icon: "call",
    title: "Call support",
    detail: "+91 99999 99999",
    href: "tel:+919999999999",
    label: "Call now",
  },
  {
    icon: "chat",
    title: "WhatsApp",
    detail: "+91 99999 99999",
    href: "https://wa.me/919999999999",
    label: "Chat on WhatsApp",
  },
];

export default function HelpSupportPage() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 font-sans md:px-8">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <BackButton label="" fallback="/dashboard/settings" className="px-1.5 py-1.5 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-3xl font-bold tracking-tight text-on-surface">
              Help &amp; Support
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Answers to common questions, plus ways to reach our team.
            </p>
          </div>
        </div>
      </header>

      {/* Contact channels */}
      <section className="mb-8">
        <h3 className="mb-3 font-headline-md text-headline-md text-on-surface">
          Contact options
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {CONTACTS.map((c) => (
            <a
              key={c.icon}
              href={c.href}
              className="group flex flex-col gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm transition-soft hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-container/10 text-primary">
                <span className="material-symbols-outlined">{c.icon}</span>
              </span>
              <p className="mt-1 text-sm font-bold text-on-surface">{c.title}</p>
              <p className="text-sm text-on-surface-variant">{c.detail}</p>
              <span className="text-xs font-semibold text-primary group-hover:underline">
                {c.label}
              </span>
            </a>
          ))}
        </div>
        <p className="mt-3 text-xs text-on-surface-variant">
          Support hours: Monday - Saturday, 9:00 AM - 9:00 PM IST.
        </p>
      </section>

      {/* FAQ */}
      <section>
        <h3 className="mb-3 font-headline-md text-headline-md text-on-surface">
          Frequently asked questions
        </h3>
        <div className="space-y-3">
          {FAQS.map((faq, i) => {
            const isOpen = open === i;
            return (
              <div
                key={i}
                className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="min-w-0 font-label-md text-label-md text-on-surface">
                    {faq.q}
                  </span>
                  <span className="material-symbols-outlined shrink-0 text-on-surface-variant transition-transform duration-200">
                    {isOpen ? "expand_less" : "expand_more"}
                  </span>
                </button>
                {isOpen && (
                  <p className="px-5 pb-4 font-body-md text-body-md text-on-surface-variant">
                    {faq.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Useful links */}
      <section className="mt-8 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
        <h3 className="mb-3 font-headline-md text-headline-md text-on-surface">
          Useful links
        </h3>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/settings/privacy"
            className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-medium text-primary transition-soft hover:bg-primary-container/10"
          >
            Privacy Policy
          </Link>
          <Link
            href="/dashboard/settings/terms"
            className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-medium text-primary transition-soft hover:bg-primary-container/10"
          >
            Terms of Service
          </Link>
          <Link
            href="/dashboard/settings/about"
            className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-medium text-primary transition-soft hover:bg-primary-container/10"
          >
            About ShuroqX
          </Link>
        </div>
      </section>
    </div>
  );
}

import Link from "next/link";
import { Logo } from "@/components/ui";

const FEATURES = [
  {
    icon: "smart_toy",
    title: "AI-Powered Service Hub",
    desc: "Smart matching for everyday needs.",
  },
  {
    icon: "verified_user",
    title: "Verified Specialists",
    desc: "Trusted, background-checked pros.",
  },
  {
    icon: "shield",
    title: "Trust & Efficiency",
    desc: "Secure, fast, reliable solutions.",
  },
];

const LINKS = [
  { icon: "system_update", label: "Version 1.0.0", href: undefined },
  { icon: "description", label: "Privacy Policy", href: "/dashboard/settings/privacy" },
  { icon: "gavel", label: "Terms & Conditions", href: "/dashboard/settings/terms" },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 font-sans md:px-8">
      {/* ── Header ─────────────────────────── */}
      <header className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-3xl font-bold tracking-tight text-on-surface">
            About
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            The story, values, and people behind ShuroqX.
          </p>
        </div>
        <Link
          href="/dashboard/settings"
          className="flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-primary transition-soft hover:bg-primary-container/10"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          Settings
        </Link>
      </header>

      {/* ── Brand card ─────────────────────── */}
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm transition-soft hover:shadow-md">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-lg bg-primary-container/10 p-2 text-primary">
            <span className="material-symbols-outlined">rocket_launch</span>
          </div>
          <h4 className="font-headline-md text-headline-md">Meet ShuroqX</h4>
        </div>

        <div className="mb-6">
          <Logo size="md" />
        </div>

        <p className="font-body-md text-body-md text-on-surface-variant">
          We connect you with verified specialists for your everyday needs —
          trustworthy, efficient solutions powered by AI.
        </p>

        {/* Feature grid */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="flex flex-col items-center gap-2 rounded-xl border border-outline-variant/60 bg-surface p-4 text-center transition-soft hover:border-primary"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-container/10 text-primary">
                <span className="material-symbols-outlined">{f.icon}</span>
              </div>
              <p className="font-label-md text-label-md leading-tight">
                {f.title}
              </p>
              <p className="text-xs text-on-surface-variant">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Links ───────────────────────────── */}
      <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-2 shadow-sm">
        {LINKS.map((link) =>
          link.href ? (
            <Link
              key={link.label}
              href={link.href}
              className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-on-surface transition-soft hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined text-on-surface-variant">
                {link.icon}
              </span>
              <span className="flex-1">{link.label}</span>
              <span className="material-symbols-outlined text-outline">
                chevron_right
              </span>
            </Link>
          ) : (
            <div
              key={link.label}
              className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-on-surface"
            >
              <span className="material-symbols-outlined text-on-surface-variant">
                {link.icon}
              </span>
              <span className="flex-1">{link.label}</span>
            </div>
          )
        )}
      </div>

      {/* ── Contact ─────────────────────────── */}
      <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-lg bg-secondary-container/10 p-2 text-secondary">
            <span className="material-symbols-outlined">support_agent</span>
          </div>
          <h4 className="font-headline-md text-headline-md">Contact Us</h4>
        </div>
        <div className="flex gap-3">
          <a
            href="mailto:support@shuroqx.com"
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-container/10 text-primary transition-soft hover:bg-primary-container/20"
            aria-label="Email support"
          >
            <span className="material-symbols-outlined">mail</span>
          </a>
          <a
            href="tel:+919999999999"
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-container/10 text-primary transition-soft hover:bg-primary-container/20"
            aria-label="Call support"
          >
            <span className="material-symbols-outlined">call</span>
          </a>
          <a
            href="https://wa.me/919999999999"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-container/10 text-primary transition-soft hover:bg-primary-container/20"
            aria-label="WhatsApp support"
          >
            <span className="material-symbols-outlined">chat</span>
          </a>
        </div>
        <p className="mt-3 text-xs text-on-surface-variant">
          Monday - Saturday, 9:00 AM - 9:00 PM IST ·{" "}
          <Link href="/dashboard/settings/help" className="text-primary hover:underline">
            Visit Help &amp; Support
          </Link>
        </p>
      </div>
    </div>
  );
}

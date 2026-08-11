"use client";

import BackButton from "@/components/ui/BackButton";

const SECTIONS = [
  {
    title: "1. Acceptance of Terms",
    body: "By creating an account or using the ShuroqX platform, you agree to these Terms of Service. If you do not agree, please do not use the platform.",
  },
  {
    title: "2. Services",
    body: "ShuroqX connects customers with verified home-service specialists (plumbing, electrical, AC repair, carpentry, cleaning, painting, massage, gardening, and more). We facilitate bookings and payments but do not guarantee the workmanship of individual specialists; issues with completed work should be raised through the app's review and support channels.",
  },
  {
    title: "3. Accounts",
    body: "You are responsible for keeping your login credentials confidential and for all activity under your account. You must provide accurate profile information. One person may hold one customer account.",
  },
  {
    title: "4. Bookings & Payments",
    body: "Bookings are confirmed based on specialist availability. Prices and ETAs shown are estimates from real specialist data and may vary. Payments are processed online or in cash as agreed. Completed-work OTPs confirm job completion and release payment.",
  },
  {
    title: "5. Cancellations & Refunds",
    body: "Upcoming bookings can be cancelled before the specialist reaches you. Refunds, where applicable, are processed to the original payment method within 5-7 business days.",
  },
  {
    title: "6. Specialist Conduct",
    body: "Specialists agree to provide services in a professional manner, honor accepted bookings, and maintain the quality reflected in their profile. Violations may lead to suspension or removal.",
  },
  {
    title: "7. Acceptable Use",
    body: "You agree not to misuse the platform: no fraudulent bookings, harassment, abusive language, or attempts to transact outside the platform's payment flow.",
  },
  {
    title: "8. Intellectual Property",
    body: "All platform content, branding, and software are the property of ShuroqX. You may not copy, modify, or redistribute them without written permission.",
  },
  {
    title: "9. Limitation of Liability",
    body: "ShuroqX is a marketplace facilitator. To the maximum extent permitted by law, ShuroqX is not liable for indirect or consequential damages arising from services booked through the platform.",
  },
  {
    title: "10. Account Deletion",
    body: "You may delete your account at any time from Settings. Deletion requires verification via a one-time code sent to your registered email, after which your data is permanently removed.",
  },
  {
    title: "11. Changes to These Terms",
    body: "We may update these terms from time to time. Continued use of the platform after changes constitutes acceptance of the revised terms.",
  },
];

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 font-sans md:px-8">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <BackButton label="" fallback="/dashboard/settings" className="px-1.5 py-1.5 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-3xl font-bold tracking-tight text-on-surface">
              Terms of Service
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Last updated: August 2026
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-5">
        {SECTIONS.map((s) => (
          <section
            key={s.title}
            className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm"
          >
            <h3 className="mb-2 font-label-md text-label-md text-on-surface">
              {s.title}
            </h3>
            <p className="font-body-md text-body-md text-on-surface-variant">
              {s.body}
            </p>
          </section>
        ))}
      </div>

      <p className="mt-8 text-xs text-on-surface-variant">
        Questions about these terms? Email{" "}
        <a href="mailto:support@shuroqx.com" className="text-primary hover:underline">
          support@shuroqx.com
        </a>
        .
      </p>
    </div>
  );
}

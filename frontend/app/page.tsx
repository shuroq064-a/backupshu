import { Logo } from "@/components/ui";
import Link from "next/link";

export default function LandingPage() {
  const services = [
    { icon: "🔧", label: "Plumbing" },
    { icon: "⚡", label: "Electrical" },
    { icon: "❄️", label: "AC Repair" },
    { icon: "🪚", label: "Carpenter" },
    { icon: "🪷", label: "Massage" },
    { icon: "🧹", label: "Cleaning" },
    { icon: "🎨", label: "Painting" },
    { icon: "🌿", label: "Gardening" },
  ];

  const stats = [
    { value: "10,000+", label: "Verified Specialists" },
    { value: "50,000+", label: "Happy Clients" },
    { value: "4.8★", label: "Average Rating" },
    { value: "15 min", label: "Avg. Response Time" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-100">
      {/* ── Navbar ──────────────────────────── */}
      <nav className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto">
                  <div className="mb-8">
                    <Logo size="md" />
                  </div>
        <div className="flex items-center gap-3">
          <Link
            href="/auth"
            className="text-sm font-medium text-gray-600 hover:text-violet-700 transition-colors"
          >
            Log In
          </Link>
          <Link
            href="/auth"
            className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-xl text-sm font-semibold hover:from-violet-700 hover:to-purple-700 transition-all shadow-lg shadow-violet-200"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-8 pt-16 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-violet-100 border border-violet-200 rounded-full text-violet-700 text-sm font-medium mb-6">
          <span className="w-2 h-2 bg-violet-500 rounded-full animate-pulse" />
          AI-Powered Service Marketplace
        </div>

        <h1 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight mb-6 max-w-3xl mx-auto">
          Find trusted specialists{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-purple-600">
            near you, instantly
          </span>
        </h1>

        <p className="text-xl text-gray-500 mb-10 max-w-xl mx-auto leading-relaxed">
          Just describe your problem. Our AI connects you with verified local
          specialists in seconds.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/auth"
            className="px-8 py-4 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-2xl text-base font-semibold hover:from-violet-700 hover:to-purple-700 transition-all shadow-xl shadow-violet-300 hover:shadow-violet-400 hover:-translate-y-0.5"
          >
            Find a Specialist →
          </Link>
          <Link
            href="/auth"
            className="px-8 py-4 bg-surface-container-lowest text-violet-700 rounded-2xl text-base font-semibold border border-violet-200 hover:border-violet-400 hover:bg-violet-50 transition-all"
          >
            Offer Your Services
          </Link>
        </div>

        {/* Mock chat preview */}
        <div className="mt-16 max-w-2xl mx-auto bg-surface-container-lowest rounded-3xl shadow-2xl shadow-violet-200 border border-violet-100 p-6 text-left">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
              U
            </div>
            <div className="bg-gradient-to-br from-violet-600 to-purple-600 text-white px-4 py-2.5 rounded-2xl rounded-tl-sm text-sm">
              I need a plumber near me 🔧
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-base flex-shrink-0">
              🤖
            </div>
            <div className="bg-gray-50 border border-violet-100 rounded-2xl rounded-tl-sm p-4 text-sm flex-1">
              <p className="text-gray-500 mb-3 flex items-center gap-2">
                Searching for nearby specialists
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </span>
              </p>
              <div className="bg-surface-container-lowest rounded-xl p-3 border border-violet-100 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-amber-400 flex items-center justify-center text-white font-bold">
                    R
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">
                      Ramesh{" "}
                      <span className="text-gray-400 font-normal">(Matched specialist)</span>
                    </p>
                    <p className="text-xs text-gray-400">⭐ 4.8 · 1.2 km · 7 min away</p>
                  </div>
                </div>
                <p className="text-xs text-gray-600 mb-2">
                  Basic visit charge: <strong>₹70</strong>
                </p>
                <div className="flex gap-2">
                  <div className="flex-1 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-medium text-center">
                    📍 Track
                  </div>
                  <div className="flex-1 py-1.5 bg-violet-500 text-white rounded-lg text-xs font-medium text-center">
                    📞 Call
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ───────────────────────────── */}
      <section className="bg-white/60 backdrop-blur py-12 border-y border-violet-100">
        <div className="max-w-7xl mx-auto px-8 grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-3xl font-bold text-violet-700">{s.value}</p>
              <p className="text-sm text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Services ────────────────────────── */}
      <section className="max-w-7xl mx-auto px-8 py-20">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-3">
          Services we cover
        </h2>
        <p className="text-gray-500 text-center mb-10">
          From home repairs to wellness — find a specialist for anything
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {services.map((s) => (
            <Link
              href="/auth"
              key={s.label}
              className="flex flex-col items-center gap-3 p-6 bg-surface-container-lowest rounded-2xl border border-violet-100 hover:border-violet-300 hover:shadow-lg hover:shadow-violet-100 hover:-translate-y-1 transition-all group"
            >
              <span className="text-4xl group-hover:scale-110 transition-transform">
                {s.icon}
              </span>
              <span className="text-sm font-semibold text-gray-700">
                {s.label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── How it works ────────────────────── */}
      <section className="bg-white/60 backdrop-blur py-20 border-t border-violet-100">
        <div className="max-w-5xl mx-auto px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
            How it works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                icon: "💬",
                title: "Describe your problem",
                desc: "Type anything — our AI understands exactly what service you need.",
              },
              {
                step: "02",
                icon: "🤖",
                title: "AI finds a match",
                desc: "We instantly scan verified specialists near you and surface the best match.",
              },
              {
                step: "03",
                icon: "✅",
                title: "Job done",
                desc: "Track arrival, pay securely, and rate your specialist after.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center text-3xl mx-auto mb-4">
                  {item.icon}
                </div>
                <p className="text-xs font-bold text-violet-400 uppercase tracking-widest mb-1">
                  Step {item.step}
                </p>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer CTA ──────────────────────── */}
      <section className="py-20 text-center px-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          Ready to get started?
        </h2>
        <p className="text-gray-500 mb-8">
          Join thousands of clients and specialists on ShuroqX
        </p>
        <Link
          href="/auth"
          className="inline-flex px-10 py-4 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-2xl text-base font-semibold hover:from-violet-700 hover:to-purple-700 transition-all shadow-xl shadow-violet-300 hover:-translate-y-0.5"
        >
          Create Free Account →
        </Link>
      </section>

      {/* ── Footer ──────────────────────────── */}
      <footer className="border-t border-violet-100 py-8 px-8 text-center">
        <p className="text-sm text-gray-400">
          © 2026 ShuroqX. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
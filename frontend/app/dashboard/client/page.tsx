"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { useAppSelector } from "@/store";
import { marketplaceApi, bookingApi } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import type { SpecialistResult, ServiceLocation, BookingDetail } from "@/types";
import { SpecialistDetailsModal } from "@/components/dashboard/client/SpecialistDetailsModal";
import { SpecialistProfileCard } from "@/components/dashboard/client/SpecialistProfileCard";
import { SERVICE_LOCATION_KEY } from "@/components/location/ServiceLocationFlow";
import { getSpecialistAvatar } from "@/lib/avatar";

const CATEGORIES = [
  { id: "plumbing", name: "Plumbing", icon: "plumbing", iconClass: "bg-primary-container text-on-primary-container", query: "I need a plumber for repair" },
  { id: "electrical", name: "Electrical", icon: "bolt", iconClass: "bg-secondary-container text-on-secondary-container", query: "I need an electrician for wiring help" },
  { id: "ac_repair", name: "HVAC", icon: "ac_unit", iconClass: "bg-tertiary-fixed text-on-tertiary-fixed", query: "I need AC system repair and maintenance" },
  { id: "painting", name: "Design", icon: "brush", iconClass: "bg-primary-fixed text-on-primary-fixed-variant", query: "I need an interior wall designer" },
  { id: "carpenter", name: "Carpentry", icon: "construction", iconClass: "bg-secondary-fixed text-on-secondary-fixed-variant", query: "I need a custom carpentry specialist" },
  { id: "tech_support", name: "Tech Support", icon: "support_agent", iconClass: "bg-surface-variant text-on-surface-variant", query: "I need help with smart home hub setup" }
];

export default function ServiceDiscoveryPage() {
  const router = useRouter();
  const { user } = useAppSelector((s) => s.auth);
  const { showToast } = useToast();

  const [featured, setFeatured] = useState<SpecialistResult[]>([]);
  const [nearby, setNearby] = useState<SpecialistResult[]>([]);
  const [recentlyBooked, setRecentlyBooked] = useState<SpecialistResult[]>([]);
  const [activeTab, setActiveTab] = useState<"Featured" | "Nearby Specialists" | "Recently Booked">("Featured");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSpecialist, setSelectedSpecialist] = useState<SpecialistResult | null>(null);
  const [serviceLocation, setServiceLocation] = useState<ServiceLocation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [profileSpecialist, setProfileSpecialist] = useState<SpecialistResult | null>(null);
  const [transactions, setTransactions] = useState<BookingDetail[]>([]);
  const [txLoading, setTxLoading] = useState(true);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    router.push(`/dashboard/client/chat?query=${encodeURIComponent(q)}`);
  }

  useEffect(() => {
    // Read current service location (address + coords) from localStorage
    try {
      const rawLocation = localStorage.getItem(SERVICE_LOCATION_KEY);
      if (rawLocation) {
        const parsed = JSON.parse(rawLocation) as ServiceLocation;
        if (parsed.address) {
          setServiceLocation(parsed);
        }
      } else if (user?.location) {
        setServiceLocation({ address: user.location, source: "profile" });
      }
    } catch {}
  }, [user]);

  useEffect(() => {
    if (!user?.id) return;
    setTxLoading(true);
    bookingApi
      .getMyBookings(user.id)
      .then((data) => {
        const recent = data.slice(0, 4);
        setTransactions(recent);
        // Recently Booked tab = specialists from real bookings (deduped)
        const booked: SpecialistResult[] = [];
        const seen = new Set<string>();
        for (const tx of recent) {
          const workerId = (tx as BookingDetail).workerId || tx.id;
          if (seen.has(workerId)) continue;
          seen.add(workerId);
          booked.push({
            workerId,
            name: (tx as BookingDetail).specialist?.name || tx.serviceType,
            services: (tx as BookingDetail).specialist?.services || [],
            avatar: (tx as BookingDetail).specialist?.avatar || undefined,
            rating: (tx as BookingDetail).specialist?.rating,
            isVerified: true,
            isAvailable: true,
          });
        }
        setRecentlyBooked(booked);
      })
      .catch(() => {})
      .finally(() => setTxLoading(false));
  }, [user?.id]);

  useEffect(() => {
    async function fetchSpecialists() {
      setIsLoading(true);
      try {
        const locationAddress = serviceLocation?.address || "";
        const coords =
          serviceLocation?.latitude !== undefined && serviceLocation?.longitude !== undefined
            ? { latitude: serviceLocation.latitude, longitude: serviceLocation.longitude }
            : undefined;

        // Featured: all available specialists for the category, best-rated first.
        const featuredData = await marketplaceApi.searchSpecialists(
          "plumber",
          locationAddress || undefined
        );
        setFeatured(
          featuredData
            .slice()
            .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
            .slice(0, 6)
        );

        // Nearby: only specialists within the radius, nearest first (distanceKm
        // comes from the backend's find_nearby_workers_by_intent). When coords
        // are missing the backend geocodes the address server-side.
        const nearbyData = await marketplaceApi.searchSpecialists(
          "plumber",
          locationAddress || undefined,
          coords
        );
        setNearby(nearbyData.slice(0, 6));
      } catch (err) {
        console.error("Failed to load specialists:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchSpecialists();
  }, [serviceLocation]);

  function handleCategoryClick(query: string) {
    router.push(`/dashboard/client/chat?query=${encodeURIComponent(query)}`);
  }

  function handleBookNow(specialist: SpecialistResult) {
    const primaryService = specialist.services?.[0]?.service_name || "general helper";
    router.push(`/dashboard/client/chat?query=${encodeURIComponent(`I want to book ${specialist.name} for ${primaryService} service.`)}`);
  }

  const displayedSpecialists =
    activeTab === "Nearby Specialists"
      ? nearby
      : activeTab === "Recently Booked"
        ? recentlyBooked
        : featured;

  const hasCoords =
    serviceLocation?.latitude !== undefined && serviceLocation?.longitude !== undefined;

  const MotionDiv = motion.div;
  const MotionSection = motion.section;

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <MotionDiv 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8 sm:space-y-12 font-sans text-on-surface"
    >

      {/* Hero + Mode Toggle */}
      <MotionSection variants={itemVariants} className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-3">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-on-surface leading-tight">
              Find your service expert
            </h1>
            <p className="text-base text-on-surface-variant max-w-xl">
              Describe what you need and we&apos;ll match you with a vetted specialist in your area — instantly.
            </p>
          </div>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="relative max-w-2xl">
          <span className="material-symbols-outlined text-outline absolute left-5 top-1/2 -translate-y-1/2 text-2xl">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Describe the service you need (e.g. My sink is leaking)..."
            className="w-full pl-12 sm:pl-14 pr-32 sm:pr-36 py-4 rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm text-on-surface placeholder-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
          />
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 px-5 sm:px-6 py-3 sm:py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold hover:bg-primary-container hover:text-on-primary-container transition-all shadow-sm cursor-pointer"
          >
            Search
          </button>
        </form>
      </MotionSection>

      {/* Specialized Categories Grid */}
      <MotionSection variants={itemVariants} className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-bold tracking-tight text-on-surface">Specialized Categories</h3>
          <button className="text-primary text-sm font-semibold hover:underline">View All</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {CATEGORIES.map((cat) => (
            <div
              key={cat.id}
              onClick={() => handleCategoryClick(cat.query)}
              className="bg-surface-container-lowest p-4 sm:p-6 rounded-2xl border border-outline-variant shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-primary hover:ring-2 hover:ring-primary/40 transition-all duration-300 cursor-pointer text-center group flex flex-col items-center justify-center"
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 sm:mb-4 transition-transform duration-300 group-hover:scale-110 ${cat.iconClass}`}>
                <span className="material-symbols-outlined text-3xl">{cat.icon}</span>
              </div>
              <p className="font-semibold text-sm text-on-surface group-hover:text-primary transition-colors">{cat.name}</p>
            </div>
          ))}
        </div>
      </MotionSection>

{/* Specialists with Filters */}
      <MotionSection variants={itemVariants} className="space-y-6">
        <div>
          <h3 className="text-2xl font-bold tracking-tight text-on-surface">Specialists</h3>
          <p className="text-sm text-on-surface-variant mt-1">Browse experts by category</p>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2" role="tablist">
          {(["Featured", "Nearby Specialists", "Recently Booked"] as const).map((filter) => (
            <button
              key={filter}
              role="tab"
              aria-selected={activeTab === filter}
              onClick={() => setActiveTab(filter)}
              className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === filter
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-8">
            {[1, 2, 3].map((n) => (
              <MotionDiv variants={itemVariants} key={n} className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm h-80 animate-pulse" />
            ))}
          </div>
        ) : activeTab === "Nearby Specialists" && !hasCoords ? (
          <div className="text-center py-16 bg-surface-container-lowest border border-outline-variant rounded-2xl text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl text-outline mb-2">my_location</span>
            <p className="font-semibold text-sm">No service location with coordinates yet.</p>
            <p className="text-xs text-on-surface-variant/70 mt-1">Set your service location to see specialists within 5 km of you.</p>
            <button
              onClick={() => window.dispatchEvent(new Event("shuroqx-open-location-permission"))}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-all hover:opacity-90 cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">my_location</span>
              Set service location
            </button>
          </div>
        ) : activeTab === "Nearby Specialists" && nearby.length === 0 ? (
          <div className="text-center py-16 bg-surface-container-lowest border border-outline-variant rounded-2xl text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl text-outline mb-2">hail</span>
            <p className="font-semibold text-sm">No specialists within 5 km of your location.</p>
            <p className="text-xs text-on-surface-variant/70 mt-1">Try a different location or check back later.</p>
          </div>
        ) : activeTab === "Recently Booked" && recentlyBooked.length === 0 ? (
          <div className="text-center py-16 bg-surface-container-lowest border border-outline-variant rounded-2xl text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl text-outline mb-2">history</span>
            <p className="font-semibold text-sm">No recently booked specialists yet.</p>
            <p className="text-xs text-on-surface-variant/70 mt-1">Book a specialist and they&apos;ll appear here for quick rebooking.</p>
            <button
              onClick={() => setActiveTab("Featured")}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-all hover:opacity-90 cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">search</span>
              Browse specialists
            </button>
          </div>
        ) : displayedSpecialists.length === 0 ? (
          <div className="text-center py-16 bg-surface-container-lowest border border-outline-variant rounded-2xl text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl text-outline mb-2">hail</span>
            <p className="font-semibold text-sm">No active specialists found in your area right now.</p>
            <p className="text-xs text-on-surface-variant/70 mt-1">Try changing your location or check back later.</p>
          </div>
        ) : (
          <MotionDiv variants={containerVariants} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-8">
            {displayedSpecialists.map((sp) => {
              const primaryService = sp.services?.[0]?.service_name || "General Service";
              const spGender = sp.gender === "female" ? "female" : "male";
              return (
                <MotionDiv
                  variants={itemVariants}
                  key={sp.workerId}
                  className="group relative h-full overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-container-lowest/50 backdrop-blur-sm transition-all duration-300 hover:border-primary hover:ring-2 hover:ring-primary/40 hover:shadow-xl hover:shadow-primary/10 flex flex-col"
                >
                  {/* Image area — exact ProjectCard style */}
                  <div className="relative aspect-video overflow-hidden">
                    <img
                      src={sp.avatar || getSpecialistAvatar(sp.name, primaryService, spGender)}
                      alt={sp.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    {/* Gradient overlay on hover */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#fbf8ff]/90 via-[#fbf8ff]/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                    {/* Hover action buttons over image */}
                    <div className="absolute inset-0 flex items-center justify-center gap-4 opacity-0 transition-all duration-300 group-hover:opacity-100">
                      <button
                        onClick={() => handleBookNow(sp)}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/25 backdrop-blur-md hover:scale-110 transition-transform cursor-pointer"
                        title="Book Now"
                      >
                        <span className="material-symbols-outlined text-lg">calendar_month</span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setProfileSpecialist(sp); }}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-lowest text-on-surface shadow-lg backdrop-blur-md hover:scale-110 transition-transform cursor-pointer"
                        title="Profile"
                      >
                        <span className="material-symbols-outlined text-lg">person</span>
                      </button>
                    </div>

                    {/* Top Rated badge */}
                    <div className="absolute top-4 right-4 bg-primary text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                      {sp.isVerified ? "Top Rated" : "Verified Expert"}
                    </div>

                    {/* Distance badge — only meaningful for nearby results */}
                    {sp.distanceKm != null && (
                      <div className="absolute top-4 left-4 flex items-center gap-1 bg-surface-container-lowest/90 backdrop-blur-md text-on-surface text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                        <span className="material-symbols-outlined text-[13px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>near_me</span>
                        {sp.distanceKm < 1 ? `${Math.round(sp.distanceKm * 1000)} m` : `${sp.distanceKm.toFixed(1)} km`} away
                      </div>
                    )}
                  </div>

                    {/* Card body */}
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="text-lg font-semibold tracking-tight text-on-surface transition-colors group-hover:text-primary">{sp.name}</h4>
                        <p className="text-xs text-on-surface-variant mt-1">
                          {primaryService}
                          {sp.experienceYears != null ? ` • ${sp.experienceYears} yrs exp` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 bg-surface-container px-2.5 py-1 rounded-lg border border-outline-variant/30 text-xs font-bold text-on-surface">
                        <span className="material-symbols-outlined text-amber-400 text-sm font-fill" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                        <span>{sp.rating != null ? sp.rating.toFixed(1) : "New"}</span>
                      </div>
                    </div>

                    <div className="flex gap-4 border-t border-b border-outline-variant/60 py-3.5 my-4 text-xs">
                      <div className="flex-1 border-r border-outline-variant/50">
                        <p className="text-on-surface-variant uppercase tracking-widest text-[9px] font-bold">Hourly Rate</p>
                        <p className="font-bold text-primary mt-0.5">
                          {sp.price != null ? `₹${sp.price}/hr` : "₹100/hr"}
                        </p>
                      </div>
                      <div className="flex-1 pl-2">
                        <p className="text-on-surface-variant uppercase tracking-widest text-[9px] font-bold">Response Time</p>
                        <p className="font-bold text-on-surface mt-0.5">{sp.etaMinutes != null ? `~${sp.etaMinutes} mins` : "< 15 mins"}</p>
                      </div>
                    </div>

                    {/* Tags / Badges */}
                    <div className="mt-auto flex flex-wrap gap-2">
                      <span className="bg-surface-container/50 px-2 py-0.5 text-xs font-normal rounded-md text-on-surface-variant hover:bg-surface-container transition-colors">
                        {primaryService}
                      </span>
                      {sp.isVerified && (
                        <span className="bg-surface-container/50 px-2 py-0.5 text-xs font-normal rounded-md text-on-surface-variant hover:bg-surface-container transition-colors">
                          Vetted
                        </span>
                      )}
                      {activeTab === "Recently Booked" && (
                        <span className="bg-primary/10 px-2 py-0.5 text-xs font-normal rounded-md text-primary hover:bg-primary/15 transition-colors">
                          Book Again
                        </span>
                      )}
                    </div>
                  </div>
                </MotionDiv>
              );
            })}
          </MotionDiv>
        )}
      </MotionSection>

      {/* Recent Transactions */}
      <MotionSection variants={itemVariants} className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-bold tracking-tight text-on-surface">Recent Transactions</h3>
          <button
            onClick={() => router.push("/dashboard/client/bookings")}
            className="text-primary text-sm font-semibold hover:underline"
          >
            View All
          </button>
        </div>

        {txLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((n) => (
              <div key={n} className="h-24 rounded-2xl bg-surface-container-lowest border border-outline-variant animate-pulse" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 bg-surface-container-lowest border border-outline-variant rounded-2xl text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl text-outline mb-2">receipt_long</span>
            <p className="font-semibold text-sm">No transactions yet.</p>
            <p className="text-xs text-gray-400 mt-1">Book a specialist to see your activity here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-4 bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm p-4 transition-all hover:border-primary hover:ring-2 hover:ring-primary/40 hover:shadow-md"
              >
                <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined">receipt_long</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm text-on-surface truncate">{tx.serviceType}</p>
                  <p className="text-xs text-on-surface-variant truncate">
                    {tx.bookingNumber ? `${tx.bookingNumber} · ` : ""}{tx.scheduledDate} {tx.scheduledTime}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {tx.status === "cancelled" ? (
                    <p className="font-bold text-sm text-on-surface-variant">—</p>
                  ) : (
                    <p className="font-bold text-sm text-primary">₹{tx.amount}</p>
                  )}
                  <span
                    className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                      tx.status === "completed"
                        ? "bg-emerald-50 text-emerald-700"
                        : tx.status === "cancelled"
                        ? "bg-red-50 text-red-600"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {tx.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </MotionSection>

      {/* Assurance Protection Banner */}
      <MotionSection variants={itemVariants} className="pt-4">
        <div className="relative rounded-3xl overflow-hidden bg-primary p-8 lg:p-12 text-on-primary shadow-xl shadow-primary/10">
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <div className="w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
          </div>
          <div className="relative z-10 grid lg:grid-cols-2 gap-8 items-center">
            <div className="space-y-4">
              <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-white">
                Service assurance, <br/> guaranteed.
              </h2>
              <p className="text-sm text-white/80 leading-relaxed max-w-lg">
                Every booking via ShuroqX is covered by our $1M Protection Plan. Find experts you can trust for your most critical tasks.
              </p>
              <div className="flex flex-wrap gap-4 pt-4">
                <button
                  onClick={() => showToast("Escrow payment system: funds are released only when the specialist completes the work to your standard. âœ…", "success")}
                  className="px-8 py-4 bg-surface-container-lowest text-primary dark:text-white rounded-xl font-bold text-xs hover:bg-teal-50 transition-colors shadow-lg cursor-pointer"
                >
                  Explore All Guarantees
                </button>
                <div className="flex items-center gap-2 text-white text-xs font-semibold">
                  <span className="material-symbols-outlined">verified_user</span>
                  <span>Licensed & Vetted</span>
                </div>
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="bg-white/10 backdrop-blur-md border border-white/20 p-6 rounded-2xl max-w-sm ml-auto text-left shadow-lg">
                <div className="flex items-center gap-3.5 mb-4">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-white shrink-0">
                    <span className="material-symbols-outlined">security</span>
                  </div>
                  <div>
                    <p className="font-bold text-sm text-white">Secure Payment</p>
                     <p className="text-[10px] text-white/80">Funds released upon completion</p>
                  </div>
                </div>
                <div className="h-2 w-full bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full bg-white w-3/4 rounded-full"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </MotionSection>

      {/* Specialist Details Modal */}
      {selectedSpecialist && (
        <SpecialistDetailsModal
          specialist={selectedSpecialist}
          onClose={() => setSelectedSpecialist(null)}
        />
      )}

      {/* Cute animated profile card (hover profile icon) */}
      <AnimatePresence>
        {profileSpecialist && (
          <SpecialistProfileCard
            specialist={profileSpecialist}
            onClose={() => setProfileSpecialist(null)}
            onViewFull={(sp: SpecialistResult) => {
              setProfileSpecialist(null);
              setSelectedSpecialist(sp);
            }}
          />
        )}
      </AnimatePresence>
    </MotionDiv>
  );
}


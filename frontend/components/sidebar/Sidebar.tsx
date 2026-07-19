// "use client";

// import { useState } from "react";
// import { useRouter, usePathname } from "next/navigation";
// import Link from "next/link";
// import { useAppDispatch, useAppSelector } from "@/store";
// import { logout, setActiveMode, fetchSpecialistProfile } from "@/store/slices/authSlice";
// import type { ActiveMode } from "@/types";

// // ─────────────────────────────────────────────
// //  Sidebar
// // ─────────────────────────────────────────────

// export function Sidebar() {
//   const dispatch = useAppDispatch();
//   const router = useRouter();
//   const pathname = usePathname();
//   const [collapsed, setCollapsed] = useState(false);

//   const { user, activeMode, specialistProfile } = useAppSelector((s) => s.auth);

//   async function handleModeSwitch(mode: ActiveMode) {
//     if (mode === activeMode) return;

//     if (mode === "specialist") {
//       // Check if specialist profile exists
//       if (!specialistProfile && user) {
//         // Fetch from backend first
//         await dispatch(fetchSpecialistProfile(user.id));
//         // After fetch, check state again
//         const state = (await import("@/store")).store.getState();
//         if (!state.auth.specialistProfile) {
//           // No profile → go to onboarding
//           router.push("/dashboard/specialist/onboarding");
//           return;
//         }
//       }
//       dispatch(setActiveMode("specialist"));
//       router.push("/dashboard/specialist");
//     } else {
//       dispatch(setActiveMode("client"));
//       router.push("/dashboard/client");
//     }
//   }

//   function handleLogout() {
//     dispatch(logout());
//     // Clear cookie
//     document.cookie = "shuroqx_session=; path=/; max-age=0";
//     router.replace("/auth");
//   }

//   const clientNav = [
//     { href: "/dashboard/client", label: "All Chats", icon: "💬", sub: "Seek assistance" },
//     { href: "/dashboard/client/bookings", label: "My Bookings", icon: "📅", sub: "" },
//   ];

//   const specialistNav = [
//     { href: "/dashboard/specialist", label: "My Services", icon: "🔧", sub: "Bookings" },
//     { href: "/dashboard/specialist/earnings", label: "Earnings", icon: "💰", sub: "" },
//   ];

//   const navItems = activeMode === "client" ? clientNav : specialistNav;

//   return (
//     <aside
//       className={`flex flex-col bg-white/80 backdrop-blur border-r border-violet-100 transition-all duration-300 ${
//         collapsed ? "w-16" : "w-64"
//       } min-h-screen`}
//     >
//       {/* Logo + Collapse */}
//       <div className="flex items-center justify-between px-4 py-5 border-b border-violet-100">
//         {!collapsed && (
//           <div className="flex items-center gap-2">
//             <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
//               <span className="text-white text-sm">♥</span>
//             </div>
//             <span className="text-lg font-bold text-gray-900 tracking-tight">
//               Shuroq<span className="text-violet-600">X</span>
//             </span>
//           </div>
//         )}
//         <button
//           onClick={() => setCollapsed(!collapsed)}
//           className="p-1.5 rounded-lg hover:bg-violet-50 text-gray-500 hover:text-violet-600 transition-colors ml-auto"
//           aria-label="Toggle sidebar"
//         >
//           {collapsed ? "→" : "←"}
//         </button>
//       </div>

//       {/* Location */}
//       {!collapsed && (
//         <div className="px-4 mt-4">
//           <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
//             Your Location
//           </p>
//           <button className="w-full flex items-center justify-between px-3 py-2.5 bg-violet-50 rounded-xl text-sm text-gray-600 hover:bg-violet-100 transition-colors">
//             <span>Enter city or area</span>
//             <span className="text-violet-400">▾</span>
//           </button>
//         </div>
//       )}

//       {/* Mode Switcher */}
//       <div className={`${collapsed ? "px-2" : "px-4"} mt-5`}>
//         {!collapsed && (
//           <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
//             Mode
//           </p>
//         )}
//         <div className={`flex ${collapsed ? "flex-col gap-1" : "flex-row"} bg-violet-50 rounded-xl p-1`}>
//           <ModeButton
//             mode="client"
//             active={activeMode === "client"}
//             collapsed={collapsed}
//             onClick={() => handleModeSwitch("client")}
//             icon="👤"
//             label="Client"
//           />
//           <ModeButton
//             mode="specialist"
//             active={activeMode === "specialist"}
//             collapsed={collapsed}
//             onClick={() => handleModeSwitch("specialist")}
//             icon="🔧"
//             label="Specialist"
//           />
//         </div>
//       </div>

//       {/* Nav Items */}
//       <nav className="flex-1 px-3 mt-6 space-y-1">
//         {navItems.map((item) => {
//           const isActive = pathname === item.href;
//           return (
//             <Link
//               key={item.href}
//               href={item.href}
//               className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all group ${
//                 isActive
//                   ? "bg-violet-100 text-violet-700"
//                   : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
//               }`}
//             >
//               <span className="text-lg flex-shrink-0">{item.icon}</span>
//               {!collapsed && (
//                 <div className="min-w-0">
//                   <p className="text-sm font-medium truncate">{item.label}</p>
//                   {item.sub && (
//                     <p className="text-xs text-gray-400 truncate">{item.sub}</p>
//                   )}
//                 </div>
//               )}
//             </Link>
//           );
//         })}

//         {/* Specialist section */}
//         {!collapsed && activeMode === "client" && (
//           <>
//             <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-3 pt-4 pb-1">
//               Specialist
//             </p>
//             <Link
//               href="/dashboard/specialist"
//               onClick={() => handleModeSwitch("specialist")}
//               className="flex items-center gap-3 px-3 py-3 rounded-xl text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all"
//             >
//               <span className="text-lg">🔧</span>
//               <div>
//                 <p className="text-sm font-medium">My Services</p>
//                 <p className="text-xs text-gray-400">Bookings</p>
//               </div>
//             </Link>
//           </>
//         )}
//       </nav>

//       {/* User info + Bottom actions */}
//       <div className="px-3 py-4 border-t border-violet-100 space-y-1">
//         {!collapsed && user && (
//           <div className="px-3 py-2.5 bg-violet-50 rounded-xl mb-2">
//             <p className="text-xs font-medium text-gray-700 truncate">
//               {user.name || user.email}
//             </p>
//             <p className="text-xs text-gray-400 truncate">{user.email}</p>
//           </div>
//         )}

//         <div className="flex gap-2">
//           <button
//             onClick={() => router.push("/dashboard/profile")}
//             className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
//             aria-label="Profile"
//           >
//             <span>👤</span>
//             {!collapsed && <span className="text-sm">Profile</span>}
//           </button>

//           <button
//             onClick={() => router.push("/dashboard/settings")}
//             className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
//             aria-label="Settings"
//           >
//             <span>⚙️</span>
//             {!collapsed && <span className="text-sm">Settings</span>}
//           </button>

//           <button
//             onClick={handleLogout}
//             className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors"
//             aria-label="Logout"
//           >
//             <span>🚪</span>
//             {!collapsed && <span className="text-sm">Logout</span>}
//           </button>
//         </div>
//       </div>
//     </aside>
//   );
// }

// // ─────────────────────────────────────────────
// //  Mode Button
// // ─────────────────────────────────────────────

// function ModeButton({
//   active,
//   collapsed,
//   onClick,
//   icon,
//   label,
// }: {
//   mode: ActiveMode;
//   active: boolean;
//   collapsed: boolean;
//   onClick: () => void;
//   icon: string;
//   label: string;
// }) {
//   return (
//     <button
//       onClick={onClick}
//       className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
//         active
//           ? "bg-surface-container-lowest text-violet-700 shadow-sm"
//           : "text-gray-500 hover:text-gray-700"
//       }`}
//     >
//       <span>{icon}</span>
//       {!collapsed && <span>{label}</span>}
//     </button>
//   );
// }


"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAppDispatch, useAppSelector } from "@/store";
import { setActiveMode, fetchSpecialistProfile, setLocation } from "@/store/slices/authSlice";
import { SidebarToggleIcon } from "@/components/sidebar/SidebarToggleIcon";
import type { ActiveMode } from "@/types";
import { userApi } from "@/lib/api";

const getIconClass = (icon: string) => {
  switch (icon) {
    case "search": return "icon-search";
    case "calendar_today": return "icon-calendar";
    case "chat_bubble_outline": return "icon-chat";
    case "settings": return "icon-settings";
    case "dashboard": return "icon-dashboard";
    case "payments": return "icon-payments";
    default: return "";
  }
};

// ─────────────────────────────────────────────
//  Sidebar
// ─────────────────────────────────────────────

export function Sidebar({
  mobileOpen = false,
  onClose,
}: {
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  // const { location } = useAppSelector((s) => s.auth);

  const { user, activeMode, specialistProfile, location } = useAppSelector((s) => s.auth);
  const currentSpecialistProfile =
    specialistProfile?.userId === user?.id ? specialistProfile : null;
  // Load saved location from backend on mount
  useEffect(() => {
    if (user && !location) {
      userApi.getProfile().then((profile) => {
        if (profile.location) {
          dispatch(setLocation(profile.location));
        }
      }).catch(() => {});
    }
  }, [user, location, dispatch]);

  async function handleModeSwitch(mode: ActiveMode) {
    if (mode === activeMode) return;

    if (mode === "specialist") {
      // Check if specialist profile exists
      if (!currentSpecialistProfile && user) {
        // Fetch from backend first
        await dispatch(fetchSpecialistProfile(user.id));
        // After fetch, check state again
        const state = (await import("@/store")).store.getState();
        if (state.auth.specialistProfile?.userId !== user.id) {
          // No profile → enter specialist mode and go to onboarding
          dispatch(setActiveMode("specialist"));
          router.push("/dashboard/specialist/onboarding");
          return;
        }
      }
      dispatch(setActiveMode("specialist"));
      router.push("/dashboard/specialist");
    } else {
      // Switching to client mode no longer forces availability OFF — a
      // specialist's listing state is independent of which UI mode is active,
      // so returning to specialist mode keeps their previous availability.
      dispatch(setActiveMode("client"));
      router.push("/dashboard/client");
    }
  }

  const clientNav = [
    { href: "/dashboard/client", label: "Discover", icon: "search" },
    { href: "/dashboard/client/bookings", label: "My Bookings", icon: "calendar_today" },
    { href: "/dashboard/client/chat", label: "Assistant", icon: "chat_bubble_outline" },
    { href: "/dashboard/settings", label: "Settings", icon: "settings" },
  ];

  const specialistNav = [
    { href: "/dashboard/specialist", label: "Dashboard", icon: "dashboard" },
    { href: "/dashboard/specialist/bookings", label: "Bookings", icon: "calendar_today" },
    { href: "/dashboard/specialist/chat", label: "Chat", icon: "chat_bubble_outline" },
    { href: "/dashboard/specialist/earnings", label: "Earnings", icon: "payments" },
    { href: "/dashboard/specialist/settings", label: "Settings", icon: "settings" },
  ];

  const specialistOnboarding = activeMode === "specialist" && !currentSpecialistProfile;

  const navItems = activeMode === "client" ? clientNav : specialistNav;

  function openLocationPrompt() {
    window.dispatchEvent(new Event("shuroqx-open-location-permission"));
  }

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`flex flex-col bg-surface-container-lowest border border-outline-variant h-[calc(100vh-3rem)] flex-shrink-0 overflow-hidden
          md:static md:my-6 md:ml-6 md:rounded-[28px] md:bg-surface-container-lowest/80 md:backdrop-blur md:transition-all md:duration-300 md:shadow-sm
          ${collapsed ? "md:w-[68px]" : "md:w-64"}
          max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-72 max-md:rounded-r-[28px] max-md:shadow-2xl max-md:transform max-md:transition-transform max-md:duration-300
          ${mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full"}`}
      >
        {/* Logo + Collapse */}
        <div className={`flex items-center py-6 ${collapsed ? "justify-center px-0" : "justify-between px-6"}`}>
          {!collapsed && (
            <div className="flex flex-col">
              <h1 className="text-2xl font-bold text-primary dark:text-white tracking-tight leading-tight">ShuroqX</h1>
              <p className="text-[10px] text-gray-500 font-medium">Service Excellence</p>
            </div>
          )}
          <div className="flex items-center gap-1 mt-0.5">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1.5 rounded-lg hover:bg-primary/5 text-gray-500 hover:text-primary transition-colors group max-md:hidden"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <SidebarToggleIcon isOpen={!collapsed} className="block" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-primary/5 text-gray-500 hover:text-primary transition-colors group md:hidden"
              aria-label="Close menu"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        </div>

      {/* Location */}
      {collapsed ? (
        <div className="flex justify-center mb-4">
          <button
            onClick={openLocationPrompt}
            className="w-10 h-10 rounded-xl bg-surface-container-low border border-outline-variant flex items-center justify-center text-primary hover:bg-surface-container-low transition-colors group"
            title={location || "Set location"}
          >
            <span className="material-symbols-outlined text-xl icon-location">location_on</span>
          </button>
        </div>
      ) : (
        <div className="px-6 mb-6">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            Your Location
          </p>
          <button 
            onClick={openLocationPrompt}
             className="w-full flex items-center justify-between px-4 py-3 bg-surface-container-low border border-outline-variant rounded-2xl text-xs font-semibold text-primary dark:text-white hover:bg-surface-container-low transition-colors cursor-pointer text-left"
          >
            <span className="line-clamp-3 pr-2 leading-relaxed">
              {location || "Enter city or area"}
            </span>
            <span className="text-primary text-[10px]">▼</span>
          </button>
        </div>
      )}

      {/* Mode Switcher */}
      <div className={`${collapsed ? "px-2 flex justify-center" : "px-6"}`}>
        {!collapsed && (
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            Mode
          </p>
        )}
        <div className={`flex ${collapsed ? "flex-col gap-1 w-full" : "flex-row"} bg-surface-container rounded-xl p-1`}>
          <ModeButton
            mode="client"
            active={activeMode === "client"}
            collapsed={collapsed}
            onClick={() => handleModeSwitch("client")}
            label="User"
            icon="person"
          />
          <ModeButton
            mode="specialist"
            active={activeMode === "specialist"}
            collapsed={collapsed}
            onClick={() => handleModeSwitch("specialist")}
            label="Specialist"
            icon="build"
          />
        </div>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 mt-6 space-y-1.5">
        {specialistOnboarding ? (
          <Link
            href="/dashboard/specialist/onboarding"
            title={collapsed ? "Become a Specialist" : undefined}
            className={`flex items-center transition-all group ${
              collapsed
                ? "justify-center mx-auto w-11 h-11 rounded-xl my-1 bg-primary/10 text-primary shadow-sm"
                : "gap-4 py-3.5 pr-4 bg-primary/15 text-primary border-l-[3px] border-primary rounded-r-full pl-6 shadow-sm mr-4"
            }`}
          >
            <span className="material-symbols-outlined text-[22px] flex-shrink-0">campaign</span>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-sm font-bold">Become a Specialist</p>
                <p className="text-[11px] text-primary/70 truncate">Finish setup to unlock</p>
              </div>
            )}
          </Link>
        ) : (
          navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`flex items-center transition-all group ${
                  collapsed
                    ? `justify-center mx-auto w-11 h-11 rounded-xl my-1 ${
                        isActive
                          ? "bg-primary/10 text-primary shadow-sm"
                          : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                      }`
                    : `gap-4 py-3.5 pr-4 ${
                        isActive
                          ? "bg-primary/15 text-primary border-l-[3px] border-primary rounded-r-full pl-6 shadow-sm mr-4"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-xl px-4 mx-2"
                      }`
                }`}
              >
                <span className={`material-symbols-outlined text-[22px] flex-shrink-0 ${getIconClass(item.icon)}`}>{item.icon}</span>
                {!collapsed && (
                  <p className={`text-sm font-bold truncate ${isActive ? "text-primary" : "text-gray-700"}`}>{item.label}</p>
                )}
              </Link>
            );
          })
        )}
      </nav>

      {/* User info */}
      <div className={`py-6 ${collapsed ? "flex justify-center" : "px-4"}`}>
        {user && (
          collapsed ? (
            <div
              className="w-10 h-10 rounded-full bg-surface-container-high text-on-surface flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all"
              title={user.name || user.email?.split('@')[0]}
              onClick={() => router.push(activeMode === "specialist" ? "/dashboard/specialist/settings" : "/dashboard/settings")}
            >
              {user.avatar ? (
                <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 bg-surface-container rounded-xl">
              <div className="w-9 h-9 rounded-full bg-surface-container-high text-on-surface flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden">
                {user.avatar ? (
                  <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-gray-900 truncate">
                  {user.name || user.email?.split('@')[0]}
                </p>
                <p className="text-[10px] text-gray-500 truncate mt-0.5">Premium User</p>
              </div>
            </div>
          )
        )}
      </div>
    </aside>
    </>
  );
}

// ─────────────────────────────────────────────
//  Mode Button
// ─────────────────────────────────────────────

function ModeButton({
  active,
  collapsed,
  onClick,
  label,
  icon,
}: {
  mode: ActiveMode;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
  label: string;
  icon: string;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`flex items-center justify-center gap-2 rounded-lg text-xs font-bold transition-all cursor-pointer group ${
        collapsed ? "w-10 h-10" : "flex-1 py-2"
      } ${
        active
          ? "bg-surface-container-lowest text-primary shadow-sm"
          : "text-gray-500 hover:text-gray-700"
      }`}
    >
      <span className={`material-symbols-outlined text-[16px] ${icon === "person" ? "icon-person" : "icon-build"}`}>{icon}</span>
      {!collapsed && <span>{label}</span>}
    </button>
  );
}

"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAppDispatch, useAppSelector } from "@/store";
import { logout } from "@/store/slices/authSlice";
import { Logo } from "../ui";

// ─────────────────────────────────────────────
//  Admin Sidebar
// ─────────────────────────────────────────────

export function AdminSidebar() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const { user } = useAppSelector((s: { auth: any; }) => s.auth);
  const { stats } = useAppSelector((s: { admin: any; }) => s.admin);

  const navItems = [
    {
      href: "/admin/specialists",
      label: "Specialist Requests",
      icon: "🔧",
      badge: stats.totalPending || 0,
    },
    {
      href: "/admin/skills",
      label: "Skill Submissions",
      icon: "⭐",
      badge: 0, // Will be set from pendingSkills count in the page
    },
    {
      href: "/admin/users",
      label: "All Users",
      icon: "👥",
      badge: 0,
    },
  ];

  function handleLogout() {
    dispatch(logout());
    document.cookie = "shuroqx_session=; path=/; max-age=0";
    router.replace("/auth");
  }

  return (
    <aside
      className={`flex flex-col bg-gray-950 border-r border-gray-800 transition-all duration-300 ${
        collapsed ? "w-16" : "w-64"
      } min-h-screen`}
    >
      {/* Logo + Collapse */}
       <div className="flex items-center justify-between px-4 py-5 border-b border-gray-800">
        {!collapsed && (
          <div className="flex flex-col">
            <Logo size="sm" textColor="light" />
            <p className="text-xs text-gray-500 mt-0.5 ml-10">Admin Panel</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors ml-auto"
        >
          {collapsed ? "→" : "←"}
        </button>
      </div>

      {/* Stats strip */}
      {!collapsed && (
        <div className="grid grid-cols-3 gap-px bg-gray-800 border-b border-gray-800 mx-0">
          {[
            { label: "Pending", value: stats.totalPending, color: "text-amber-400" },
            { label: "Approved", value: stats.totalApproved, color: "text-green-400" },
            { label: "Rejected", value: stats.totalRejected, color: "text-red-400" },
          ].map((s) => (
            <div key={s.label} className="bg-gray-900 px-2 py-3 text-center">
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 mt-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${
                isActive
                  ? "bg-violet-900/50 text-violet-300 border border-violet-700/50"
                  : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
              }`}
            >
              <span className="text-lg flex-shrink-0">{item.icon}</span>
              {!collapsed && (
                <span className="text-sm font-medium flex-1">{item.label}</span>
              )}
              {!collapsed && item.badge > 0 && (
                <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                  {item.badge}
                </span>
              )}
              {collapsed && item.badge > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Admin info + logout */}
      <div className="px-3 py-4 border-t border-gray-800 space-y-2">
        {!collapsed && user && (
          <div className="px-3 py-2.5 bg-gray-900 rounded-xl">
            <p className="text-xs font-medium text-gray-300 truncate">
              {user.name || user.email}
            </p>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
            <span className="inline-block mt-1 px-2 py-0.5 bg-violet-900/60 text-violet-300 text-xs rounded-full font-medium">
              Admin
            </span>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors"
        >
          <span>🚪</span>
          {!collapsed && <span className="text-sm">Logout</span>}
        </button>
      </div>
    </aside>
  );
}
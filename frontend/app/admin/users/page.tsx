"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector, type RootState } from "@/store";
import { fetchAllUsers } from "@/store/slices/adminSlice";

export default function AdminUsersPage() {
  const dispatch = useAppDispatch();
  const { users, isLoading, stats } = useAppSelector((s: RootState) => s.admin);

  useEffect(() => {
    dispatch(fetchAllUsers());
  }, [dispatch]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">All Users</h1>
        <p className="text-gray-400 text-sm mt-1">
          {stats.totalUsers} registered users on the platform
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-gray-700 border-t-violet-500 rounded-full animate-spin" />
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-20 text-gray-500">No users found</div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-5 gap-4 px-5 py-3 border-b border-gray-800">
            {["Name", "Email", "Role", "Has Specialist Profile", "Joined"].map(
              (h) => (
                <p key={h} className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {h}
                </p>
              )
            )}
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-800">
            {users.map((user) => (
              <div key={user.id} className="grid grid-cols-5 gap-4 px-5 py-4 hover:bg-gray-800/40 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {(user.name || user.email)[0].toUpperCase()}
                  </div>
                  <span className="text-sm text-white font-medium truncate">
                    {user.name || "—"}
                  </span>
                </div>
                <p className="text-sm text-gray-400 truncate self-center">{user.email}</p>
                <div className="self-center">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      user.role === "admin"
                        ? "bg-violet-900/50 text-violet-300"
                        : "bg-gray-800 text-gray-400"
                    }`}
                  >
                    {user.role}
                  </span>
                </div>
                <div className="self-center">
                  {user.hasSpecialistProfile ? (
                    <span className="text-xs text-green-400 flex items-center gap-1">
                      ✓ Yes
                    </span>
                  ) : (
                    <span className="text-xs text-gray-600">No</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 self-center">
                  {new Date(user.createdAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
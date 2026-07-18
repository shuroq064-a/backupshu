"use client";

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  fetchPendingSkills,
  approveSkill,
  rejectSkill,
  type PendingSkillSubmission,
} from "@/store/slices/adminSlice";

export default function AdminSkillsPage() {
  const dispatch = useAppDispatch();
  const { pendingSkills, isLoading, actionLoading, error } =
    useAppSelector((s) => s.admin);

  const [confirmReject, setConfirmReject] = useState<PendingSkillSubmission | null>(null);

  useEffect(() => {
    dispatch(fetchPendingSkills());
  }, [dispatch]);

  async function handleApprove(skill: PendingSkillSubmission) {
    await dispatch(
      approveSkill({ workerId: skill.workerId, serviceId: skill.serviceId })
    );
    // Refresh list
    dispatch(fetchPendingSkills());
  }

  async function handleRejectConfirm(skill: PendingSkillSubmission) {
    await dispatch(
      rejectSkill({ workerId: skill.workerId, serviceId: skill.serviceId })
    );
    setConfirmReject(null);
    // Refresh list
    dispatch(fetchPendingSkills());
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Pending Skill Submissions</h1>
        <p className="text-gray-400 text-sm mt-1">
          Review and approve individual skill submissions from specialists
        </p>
      </div>

      {/* Stats */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <p className="text-xs text-gray-400">Pending Submissions</p>
        </div>
        <p className="text-3xl font-bold text-white">{pendingSkills.length}</p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-900/30 border border-red-700 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-gray-700 border-t-violet-500 rounded-full animate-spin" />
        </div>
      ) : pendingSkills.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
          <p className="text-gray-400">No pending skill submissions</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingSkills.map((skill) => (
            <div
              key={`${skill.workerId}-${skill.serviceId}`}
              className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex items-center gap-4 hover:border-gray-700 transition-colors"
            >
              {/* Avatar */}
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                {(skill.workerName || skill.workerEmail)
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-white">{skill.workerName || "—"}</p>
                  <span className="text-sm text-violet-400 bg-violet-500/20 px-2 py-1 rounded-lg">
                    {skill.serviceName}
                  </span>
                </div>
                <p className="text-sm text-gray-400 truncate">{skill.workerEmail}</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  Submitted {new Date(skill.requestedAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => handleApprove(skill)}
                  disabled={actionLoading === skill.workerId}
                  className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium text-sm disabled:opacity-50 transition-colors"
                >
                  {actionLoading === skill.workerId ? "..." : "Approve"}
                </button>
                <button
                  onClick={() => setConfirmReject(skill)}
                  disabled={actionLoading === skill.workerId}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium text-sm disabled:opacity-50 transition-colors"
                >
                  {actionLoading === skill.workerId ? "..." : "Reject"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirm Reject Modal */}
      {confirmReject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-sm w-full mx-4">
            <p className="font-semibold text-white mb-4">
              Reject skill submission?
            </p>
            <p className="text-gray-400 text-sm mb-6">
              This will remove {confirmReject.serviceName} from {confirmReject.workerName || confirmReject.workerEmail}&apos;s pending submissions.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmReject(null)}
                className="flex-1 py-2 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRejectConfirm(confirmReject)}
                disabled={actionLoading === confirmReject.workerId}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 transition-colors"
              >
                {actionLoading === confirmReject.workerId ? "..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

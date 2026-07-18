"use client";

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector, type RootState } from "@/store";
import {
  fetchAllSpecialistQueues,
  approveSpecialist,
  rejectSpecialist,
  type SpecialistReview,
  type VerificationStatus,
} from "@/store/slices/adminSlice";
import { SkillBadges } from "@/components/ui/SkillBadges";

// ─────────────────────────────────────────────
//  Admin — Specialist Review Queue
// ─────────────────────────────────────────────

export default function AdminSpecialistsPage() {
  const dispatch = useAppDispatch();
  const { pendingSpecialists, approvedSpecialists, rejectedSpecialists,
          isLoading, actionLoading, error, stats } =
    useAppSelector((s: RootState) => s.admin);

  const [activeTab, setActiveTab] = useState<VerificationStatus>("pending");
  const [rejectModal, setRejectModal] = useState<{
    specialist: SpecialistReview;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    dispatch(fetchAllSpecialistQueues());
  }, [dispatch]);

  const tabData: Record<VerificationStatus, SpecialistReview[]> = {
    pending: pendingSpecialists,
    approved: approvedSpecialists,
    rejected: rejectedSpecialists,
  };

  const tabMeta = [
    { key: "pending" as const,  label: "Pending",  count: stats.totalPending,  dot: "bg-amber-400" },
    { key: "approved" as const, label: "Approved", count: stats.totalApproved, dot: "bg-green-400" },
    { key: "rejected" as const, label: "Rejected", count: stats.totalRejected, dot: "bg-red-400"   },
  ];

  async function handleApprove(id: string) {
    await dispatch(approveSpecialist(id));
  }

  async function handleRejectConfirm() {
    if (!rejectModal) return;
    await dispatch(
      rejectSpecialist({ specialistId: rejectModal.specialist.id, reason: rejectReason })
    );
    setRejectModal(null);
    setRejectReason("");
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Specialist Requests</h1>
        <p className="text-gray-400 text-sm mt-1">
          Review and verify specialist profiles before they can accept bookings
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {tabMeta.map((t) => (
          <div key={t.key} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${t.dot}`} />
              <p className="text-xs text-gray-400">{t.label}</p>
            </div>
            <p className="text-3xl font-bold text-white">{t.count}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 rounded-xl p-1 mb-5 w-fit border border-gray-800">
        {tabMeta.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.key
                ? "bg-gray-800 text-white shadow"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                  t.key === "pending"
                    ? "bg-amber-500/20 text-amber-400"
                    : t.key === "approved"
                    ? "bg-green-500/20 text-green-400"
                    : "bg-red-500/20 text-red-400"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-900/30 border border-red-700 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-gray-700 border-t-violet-500 rounded-full animate-spin" />
        </div>
      ) : tabData[activeTab].length === 0 ? (
        <EmptyQueue status={activeTab} />
      ) : (
        <div className="space-y-3">
          {tabData[activeTab].map((specialist) => (
            <SpecialistCard
              key={specialist.id}
              specialist={specialist}
              status={activeTab}
              isActioning={actionLoading === specialist.id}
              onApprove={() => handleApprove(specialist.id)}
              onReject={() => setRejectModal({ specialist })}
            />
          ))}
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <RejectModal
          specialist={rejectModal.specialist}
          reason={rejectReason}
          onReasonChange={setRejectReason}
          onConfirm={handleRejectConfirm}
          onCancel={() => { setRejectModal(null); setRejectReason(""); }}
          isLoading={actionLoading === rejectModal.specialist.id}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
//  Specialist Review Card
// ─────────────────────────────────────────────

function SpecialistCard({
  specialist,
  status,
  isActioning,
  onApprove,
  onReject,
}: {
  specialist: SpecialistReview;
  status: VerificationStatus;
  isActioning: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const initials = specialist.name
    ? specialist.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : specialist.email[0].toUpperCase();

  const submittedDate = new Date(specialist.submittedAt).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex items-center gap-4 hover:border-gray-700 transition-colors">
      {/* Avatar */}
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-white">{specialist.name || "—"}</p>
          <SkillBadges services={specialist.services} dark />
        </div>
        <p className="text-sm text-gray-400 truncate">{specialist.email}</p>
        <p className="text-xs text-gray-600 mt-0.5">Submitted {submittedDate}</p>
        {status === "rejected" && specialist.rejectionReason && (
          <p className="text-xs text-red-400 mt-1">
            Reason: {specialist.rejectionReason}
          </p>
        )}
        {status === "approved" && specialist.reviewedAt && (
          <p className="text-xs text-green-500 mt-1">
            Approved {new Date(specialist.reviewedAt).toLocaleDateString("en-IN")}
          </p>
        )}
      </div>

      {/* Status badge or actions */}
      {status === "pending" ? (
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={onApprove}
            disabled={isActioning}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isActioning ? (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              "✓ Approve"
            )}
          </button>
          <button
            onClick={onReject}
            disabled={isActioning}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-900/50 hover:bg-red-800/60 text-red-400 border border-red-700/50 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            ✕ Reject
          </button>
        </div>
      ) : (
        <StatusPill status={status} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
//  Reject Modal
// ─────────────────────────────────────────────

function RejectModal({
  specialist,
  reason,
  onReasonChange,
  onConfirm,
  onCancel,
  isLoading,
}: {
  specialist: SpecialistReview;
  reason: string;
  onReasonChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-1">Reject Specialist</h3>
        <p className="text-sm text-gray-400 mb-4">
          Rejecting{" "}
          <span className="text-white font-medium">{specialist.name}</span>{" "}
          Please provide a reason.
        </p>

        <textarea
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="e.g. Incomplete profile, unverifiable credentials…"
          rows={3}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 resize-none"
        />

        <div className="flex gap-3 mt-4">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-gray-700 rounded-xl text-sm text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!reason.trim() || isLoading}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Rejecting…
              </span>
            ) : (
              "Confirm Reject"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  Small UI components
// ─────────────────────────────────────────────

function StatusPill({ status }: { status: VerificationStatus }) {
  const map = {
    approved: "bg-green-500/10 text-green-400 border-green-700/50",
    rejected: "bg-red-500/10 text-red-400 border-red-700/50",
    pending:  "bg-amber-500/10 text-amber-400 border-amber-700/50",
  };
  return (
    <span
      className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize border ${map[status]}`}
    >
      {status === "approved" ? "✓ " : status === "rejected" ? "✕ " : "⏳ "}{status}
    </span>
  );
}

function EmptyQueue({ status }: { status: VerificationStatus }) {
  const msgs = {
    pending:  { icon: "🎉", text: "No pending requests", sub: "All caught up!" },
    approved: { icon: "✅", text: "No approved specialists yet", sub: "Approve some pending requests" },
    rejected: { icon: "📭", text: "No rejected specialists", sub: "Nothing here" },
  };
  const m = msgs[status];
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <span className="text-5xl mb-3">{m.icon}</span>
      <p className="text-gray-300 font-medium">{m.text}</p>
      <p className="text-gray-600 text-sm mt-1">{m.sub}</p>
    </div>
  );
}

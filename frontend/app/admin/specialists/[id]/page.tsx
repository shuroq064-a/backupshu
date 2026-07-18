"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector, type RootState } from "@/store";
import {
  fetchSpecialistDetail,
  approveSpecialist,
  rejectSpecialist,
  type SpecialistReview,
} from "@/store/slices/adminSlice";
import { SkillBadges } from "@/components/ui/SkillBadges";

export default function SpecialistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { selectedSpecialist, actionLoading, error } = useAppSelector((s: RootState) => s.admin);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  useEffect(() => {
    if (id) dispatch(fetchSpecialistDetail(id));
  }, [id, dispatch]);

  async function handleApprove() {
    if (!id) return;
    const result = await dispatch(approveSpecialist(id));
    if (approveSpecialist.fulfilled.match(result)) {
      router.push("/admin/specialists");
    }
  }

  async function handleReject() {
    if (!id || !rejectReason.trim()) return;
    const result = await dispatch(rejectSpecialist({ specialistId: id, reason: rejectReason }));
    if (rejectSpecialist.fulfilled.match(result)) {
      router.push("/admin/specialists");
    }
  }

  if (!selectedSpecialist) {
    return (
      <div className="flex items-center justify-center min-h-full">
        <div className="w-8 h-8 border-2 border-gray-700 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  const s = selectedSpecialist as SpecialistReview;
  const isPending = s.verificationStatus === "pending";

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-gray-400 hover:text-gray-200 text-sm mb-6 transition-colors"
      >
        ← Back to queue
      </button>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-800">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white font-bold text-2xl">
            {s.name?.[0]?.toUpperCase() || "?"}
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">{s.name}</h2>
            <p className="text-gray-400 text-sm">{s.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <SkillBadges services={s.services} dark />
              <StatusPill status={s.verificationStatus} />
            </div>
          </div>
        </div>

        {/* Personal Details */}
        <div className="mb-6">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Personal Details</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DetailField label="Full Name" value={s.name || "—"} />
            <DetailField
              label="Phone Number"
              value={s.phone ? `+91 ${s.phone}` : "—"}
            />
            <DetailField
              label="Service Area / Address"
              value={s.address || "—"}
            />
            <DetailField label="Email" value={s.email || "—"} />
          </div>
        </div>

        {/* Details */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {[
            { label: "User ID", value: s.userId },
            { label: "Worker ID", value: s.id },
            { label: "Submitted", value: new Date(s.submittedAt).toLocaleString("en-IN") },
            { label: "Reviewed", value: s.reviewedAt ? new Date(s.reviewedAt).toLocaleString("en-IN") : "—" },
            { label: "Skills", value: s.services.map((service) => service.service_name).join(", ") || "-" },
            { label: "Reviewed By", value: s.reviewedBy || "—" },
          ].map((row) => (
            <div key={row.label} className="bg-gray-800/50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500 mb-1">{row.label}</p>
              <p className="text-sm text-white font-medium truncate">{row.value}</p>
            </div>
          ))}
        </div>

        {/* Rejection reason (if rejected) */}
        {s.verificationStatus === "rejected" && s.rejectionReason && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-700/40 rounded-xl">
            <p className="text-xs text-red-400 font-semibold mb-1">Rejection Reason</p>
            <p className="text-sm text-red-300">{s.rejectionReason}</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Actions — only for pending */}
        {isPending && (
          <div className="space-y-3">
            {!showRejectForm ? (
              <div className="flex gap-3">
                <button
                  onClick={handleApprove}
                  disabled={!!actionLoading}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-semibold text-sm disabled:opacity-50 transition-colors"
                >
                  {actionLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Approving…
                    </span>
                  ) : (
                    "✓ Approve Specialist"
                  )}
                </button>
                <button
                  onClick={() => setShowRejectForm(true)}
                  disabled={!!actionLoading}
                  className="flex-1 py-3 bg-red-900/30 hover:bg-red-800/40 text-red-400 border border-red-700/50 rounded-xl font-semibold text-sm disabled:opacity-50 transition-colors"
                >
                  ✕ Reject
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Provide a rejection reason for the specialist…"
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 resize-none"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowRejectForm(false); setRejectReason(""); }}
                    className="flex-1 py-2.5 border border-gray-700 rounded-xl text-sm text-gray-400 hover:border-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={!rejectReason.trim() || !!actionLoading}
                    className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors"
                  >
                    {actionLoading ? "Rejecting…" : "Confirm Reject"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: "bg-green-500/10 text-green-400 border-green-700/50",
    rejected: "bg-red-500/10 text-red-400 border-red-700/50",
    pending:  "bg-amber-500/10 text-amber-400 border-amber-700/50",
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border capitalize ${map[status] || ""}`}>
      {status}
    </span>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800/50 rounded-xl px-4 py-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-sm text-white font-medium break-words">{value}</p>
    </div>
  );
}

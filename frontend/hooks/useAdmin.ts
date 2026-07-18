import { useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  fetchAllSpecialistQueues,
  fetchAllUsers,
  fetchAdminStats,
  approveSpecialist,
  rejectSpecialist,
  selectSpecialist,
  clearAdminError,
  type SpecialistReview,
  type VerificationStatus,
} from "@/store/slices/adminSlice";

// ─────────────────────────────────────────────
//  useAdmin
//  All admin-related state + actions in one hook.
// ─────────────────────────────────────────────

export function useAdmin() {
  const dispatch = useAppDispatch();

  const {
    pendingSpecialists,
    approvedSpecialists,
    rejectedSpecialists,
    selectedSpecialist,
    users,
    stats,
    isLoading,
    actionLoading,
    error,
  } = useAppSelector((s: { admin: any; }) => s.admin);

  // ── Data fetchers ──────────────────────────

  const loadQueues = useCallback(
    () => dispatch(fetchAllSpecialistQueues()),
    [dispatch]
  );

  const loadUsers = useCallback(
    () => dispatch(fetchAllUsers()),
    [dispatch]
  );

  const loadStats = useCallback(
    () => dispatch(fetchAdminStats()),
    [dispatch]
  );

  // ── Actions ────────────────────────────────

  const approve = useCallback(
    (id: string) => dispatch(approveSpecialist(id)),
    [dispatch]
  );

  const reject = useCallback(
    (id: string, reason: string) =>
      dispatch(rejectSpecialist({ specialistId: id, reason })),
    [dispatch]
  );

  const select = useCallback(
    (specialist: SpecialistReview | null) => dispatch(selectSpecialist(specialist)),
    [dispatch]
  );

  const clearError = useCallback(
    () => dispatch(clearAdminError()),
    [dispatch]
  );

  // ── Computed ───────────────────────────────

  const getByStatus = (status: VerificationStatus): SpecialistReview[] => {
    if (status === "pending") return pendingSpecialists;
    if (status === "approved") return approvedSpecialists;
    return rejectedSpecialists;
  };

  const isActioning = (id: string) => actionLoading === id;

  return {
    // State
    pendingSpecialists,
    approvedSpecialists,
    rejectedSpecialists,
    selectedSpecialist,
    users,
    stats,
    isLoading,
    error,

    // Actions
    loadQueues,
    loadUsers,
    loadStats,
    approve,
    reject,
    select,
    clearError,

    // Utils
    getByStatus,
    isActioning,
  };
}
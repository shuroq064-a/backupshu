import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { apiClient } from "@/lib/api";
import type { WorkerService } from "@/types";

// ─────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────

export type VerificationStatus = "pending" | "approved" | "rejected";

export interface SpecialistReview {
  id: string;          // worker id
  userId: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  services: WorkerService[];
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  verificationStatus: VerificationStatus;
  rejectionReason?: string;
  avatar?: string;
}

export interface AdminStats {
  totalPending: number;
  totalApproved: number;
  totalRejected: number;
  totalUsers: number;
}

export interface AdminUser {
  id: string;
  email: string;
  name?: string;
  role: string;
  createdAt: string;
  hasSpecialistProfile: boolean;
}

export interface PendingSkillSubmission {
  workerId: string;
  workerName?: string;
  workerEmail: string;
  workerAvatar?: string;
  serviceId: string;
  serviceName: string;
  requestedAt: string;
  status: string;
}

interface AdminState {
  // Specialist review queues
  pendingSpecialists: SpecialistReview[];
  approvedSpecialists: SpecialistReview[];
  rejectedSpecialists: SpecialistReview[];
  selectedSpecialist: SpecialistReview | null;

  // Pending skill submissions
  pendingSkills: PendingSkillSubmission[];

  // Users list
  users: AdminUser[];

  // Stats
  stats: AdminStats;

  // UI state
  isLoading: boolean;
  actionLoading: string | null; // workerId currently being approved/rejected
  error: string | null;
}

// ─────────────────────────────────────────────
//  Initial State
// ─────────────────────────────────────────────

const initialState: AdminState = {
  pendingSpecialists: [],
  approvedSpecialists: [],
  rejectedSpecialists: [],
  selectedSpecialist: null,
  pendingSkills: [],
  users: [],
  stats: {
    totalPending: 0,
    totalApproved: 0,
    totalRejected: 0,
    totalUsers: 0,
  },
  isLoading: false,
  actionLoading: null,
  error: null,
};

// ─────────────────────────────────────────────
//  Async Thunks
// ─────────────────────────────────────────────

/** Fetch specialists filtered by status */
export const fetchSpecialistsByStatus = createAsyncThunk(
  "admin/fetchSpecialistsByStatus",
  async (status: VerificationStatus, { rejectWithValue }) => {
    try {
      const data = await apiClient.get<SpecialistReview[]>(
        `/admin/specialists?status=${status}`
      );
      return { status, data };
    } catch (err: any) {
      return rejectWithValue(err.message || "Failed to fetch specialists");
    }
  }
);

/** Fetch all three queues at once (used on initial load) */
export const fetchAllSpecialistQueues = createAsyncThunk(
  "admin/fetchAllQueues",
  async (_, { dispatch }) => {
    await Promise.all([
      dispatch(fetchSpecialistsByStatus("pending")),
      dispatch(fetchSpecialistsByStatus("approved")),
      dispatch(fetchSpecialistsByStatus("rejected")),
    ]);
  }
);

/** Fetch a single specialist detail */
export const fetchSpecialistDetail = createAsyncThunk(
  "admin/fetchSpecialistDetail",
  async (specialistId: string, { rejectWithValue }) => {
    try {
      return await apiClient.get<SpecialistReview>(
        `/admin/specialists/${specialistId}`
      );
    } catch (err: any) {
      return rejectWithValue(err.message);
    }
  }
);

/** Approve a specialist */
export const approveSpecialist = createAsyncThunk(
  "admin/approveSpecialist",
  async (specialistId: string, { rejectWithValue }) => {
    try {
      await apiClient.patch(`/admin/specialists/${specialistId}/approve`, {});
      return specialistId;
    } catch (err: any) {
      return rejectWithValue(err.message || "Failed to approve");
    }
  }
);

/** Reject a specialist */
export const rejectSpecialist = createAsyncThunk(
  "admin/rejectSpecialist",
  async (
    payload: { specialistId: string; reason: string },
    { rejectWithValue }
  ) => {
    try {
      await apiClient.patch(
        `/admin/specialists/${payload.specialistId}/reject`,
        { reason: payload.reason }
      );
      return payload.specialistId;
    } catch (err: any) {
      return rejectWithValue(err.message || "Failed to reject");
    }
  }
);

/** Fetch admin dashboard stats */
export const fetchAdminStats = createAsyncThunk(
  "admin/fetchStats",
  async (_, { rejectWithValue }) => {
    try {
      return await apiClient.get<AdminStats>("/admin/stats");
    } catch (err: any) {
      return rejectWithValue(err.message);
    }
  }
);

/** Fetch all users */
export const fetchAllUsers = createAsyncThunk(
  "admin/fetchAllUsers",
  async (_, { rejectWithValue }) => {
    try {
      return await apiClient.get<AdminUser[]>("/admin/users");
    } catch (err: any) {
      return rejectWithValue(err.message);
    }
  }
);

/** Fetch all pending skill submissions */
export const fetchPendingSkills = createAsyncThunk(
  "admin/fetchPendingSkills",
  async (_, { rejectWithValue }) => {
    try {
      return await apiClient.get<PendingSkillSubmission[]>("/admin/pending-skills");
    } catch (err: any) {
      return rejectWithValue(err.message);
    }
  }
);

/** Approve a pending skill submission */
export const approveSkill = createAsyncThunk(
  "admin/approveSkill",
  async (
    payload: { workerId: string; serviceId: string },
    { rejectWithValue }
  ) => {
    try {
      await apiClient.patch(
        `/admin/skills/${payload.workerId}/${payload.serviceId}/approve`,
        {}
      );
      return payload;
    } catch (err: any) {
      return rejectWithValue(err.message || "Failed to approve skill");
    }
  }
);

/** Reject a pending skill submission */
export const rejectSkill = createAsyncThunk(
  "admin/rejectSkill",
  async (
    payload: { workerId: string; serviceId: string },
    { rejectWithValue }
  ) => {
    try {
      await apiClient.patch(
        `/admin/skills/${payload.workerId}/${payload.serviceId}/reject`,
        {}
      );
      return payload;
    } catch (err: any) {
      return rejectWithValue(err.message || "Failed to reject skill");
    }
  }
);

// ─────────────────────────────────────────────
//  Helper: move specialist between queues
// ─────────────────────────────────────────────

function removeFromAllQueues(state: AdminState, id: string) {
  state.pendingSpecialists = state.pendingSpecialists.filter((s) => s.id !== id);
  state.approvedSpecialists = state.approvedSpecialists.filter((s) => s.id !== id);
  state.rejectedSpecialists = state.rejectedSpecialists.filter((s) => s.id !== id);
}

// ─────────────────────────────────────────────
//  Slice
// ─────────────────────────────────────────────

const adminSlice = createSlice({
  name: "admin",
  initialState,

  reducers: {
    selectSpecialist(state, action: PayloadAction<SpecialistReview | null>) {
      state.selectedSpecialist = action.payload;
    },
    clearAdminError(state) {
      state.error = null;
    },
  },

  extraReducers: (builder) => {
    // ── Fetch by status ──────────────────────
    builder
      .addCase(fetchSpecialistsByStatus.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchSpecialistsByStatus.fulfilled, (state, action) => {
        state.isLoading = false;
        const { status, data } = action.payload;
        if (status === "pending") state.pendingSpecialists = data;
        if (status === "approved") state.approvedSpecialists = data;
        if (status === "rejected") state.rejectedSpecialists = data;

        // Keep stats in sync
        state.stats.totalPending = state.pendingSpecialists.length;
        state.stats.totalApproved = state.approvedSpecialists.length;
        state.stats.totalRejected = state.rejectedSpecialists.length;
      })
      .addCase(fetchSpecialistsByStatus.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // ── Fetch detail ─────────────────────────
    builder
      .addCase(fetchSpecialistDetail.fulfilled, (state, action) => {
        state.selectedSpecialist = action.payload;
      });

    // ── Approve ──────────────────────────────
    builder
      .addCase(approveSpecialist.pending, (state, action) => {
        state.actionLoading = action.meta.arg;
      })
      .addCase(approveSpecialist.fulfilled, (state, action) => {
        const id = action.payload;
        const specialist = state.pendingSpecialists.find((s) => s.id === id);
        if (specialist) {
          const updated = {
            ...specialist,
            verificationStatus: "approved" as VerificationStatus,
            reviewedAt: new Date().toISOString(),
          };
          removeFromAllQueues(state, id);
          state.approvedSpecialists.unshift(updated);
          state.stats.totalPending = state.pendingSpecialists.length;
          state.stats.totalApproved = state.approvedSpecialists.length;
        }
        state.actionLoading = null;
      })
      .addCase(approveSpecialist.rejected, (state, action) => {
        state.actionLoading = null;
        state.error = action.payload as string;
      });

    // ── Reject ───────────────────────────────
    builder
      .addCase(rejectSpecialist.pending, (state, action) => {
        state.actionLoading = action.meta.arg.specialistId;
      })
      .addCase(rejectSpecialist.fulfilled, (state, action) => {
        const id = action.payload;
        const specialist = state.pendingSpecialists.find((s) => s.id === id);
        if (specialist) {
          const updated = {
            ...specialist,
            verificationStatus: "rejected" as VerificationStatus,
            reviewedAt: new Date().toISOString(),
          };
          removeFromAllQueues(state, id);
          state.rejectedSpecialists.unshift(updated);
          state.stats.totalPending = state.pendingSpecialists.length;
          state.stats.totalRejected = state.rejectedSpecialists.length;
        }
        state.actionLoading = null;
      })
      .addCase(rejectSpecialist.rejected, (state, action) => {
        state.actionLoading = null;
        state.error = action.payload as string;
      });

    // ── Stats ────────────────────────────────
    builder.addCase(fetchAdminStats.fulfilled, (state, action) => {
      state.stats = action.payload;
    });

    // ── Users ────────────────────────────────
    builder
      .addCase(fetchAllUsers.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchAllUsers.fulfilled, (state, action) => {
        state.isLoading = false;
        state.users = action.payload;
        state.stats.totalUsers = action.payload.length;
      })
      .addCase(fetchAllUsers.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // ── Pending Skills ───────────────────────
    builder
      .addCase(fetchPendingSkills.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchPendingSkills.fulfilled, (state, action) => {
        state.isLoading = false;
        state.pendingSkills = action.payload;
      })
      .addCase(fetchPendingSkills.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // ── Approve Skill ────────────────────────
    builder
      .addCase(approveSkill.pending, (state, action) => {
        state.actionLoading = action.meta.arg.workerId;
      })
      .addCase(approveSkill.fulfilled, (state, action) => {
        const { workerId, serviceId } = action.payload;
        state.pendingSkills = state.pendingSkills.filter(
          (skill) => !(skill.workerId === workerId && skill.serviceId === serviceId)
        );
        state.actionLoading = null;
      })
      .addCase(approveSkill.rejected, (state, action) => {
        state.actionLoading = null;
        state.error = action.payload as string;
      });

    // ── Reject Skill ─────────────────────────
    builder
      .addCase(rejectSkill.pending, (state, action) => {
        state.actionLoading = action.meta.arg.workerId;
      })
      .addCase(rejectSkill.fulfilled, (state, action) => {
        const { workerId, serviceId } = action.payload;
        state.pendingSkills = state.pendingSkills.filter(
          (skill) => !(skill.workerId === workerId && skill.serviceId === serviceId)
        );
        state.actionLoading = null;
      })
      .addCase(rejectSkill.rejected, (state, action) => {
        state.actionLoading = null;
        state.error = action.payload as string;
      });
  },
});

export const { selectSpecialist, clearAdminError } = adminSlice.actions;
export default adminSlice.reducer;

import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import type {
  AuthState,
  User,
  SpecialistProfile,
  ActiveMode,
  LoginRequest,
  RegisterRequest,
  OAuthLoginRequest,
  SwitchToSpecialistRequest,
  AuthResponse,
  WorkerService,
} from "@/types";
import { apiClient } from "@/lib/api";
import {
  persistSession,
  clearSession,
  loadSession,
} from "@/lib/auth";

const initialState: AuthState = {
  user: null,
  token: null,
  activeMode: "client",
  specialistProfile: null,
  location: "",
  isLoading: false,
  error: null,
  isHydrated: false,
};

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

export const hydrateAuth = createAsyncThunk("auth/hydrate", async () => {
  return loadSession();
});

export const registerUser = createAsyncThunk(
  "auth/register",
  async (payload: RegisterRequest, { rejectWithValue }) => {
    try {
      const data: AuthResponse = await apiClient.post("/users/register", payload);
      return data;
    } catch (err: unknown) {
      return rejectWithValue(errorMessage(err, "Registration failed"));
    }
  }
);

export const loginUser = createAsyncThunk(
  "auth/login",
  async (payload: LoginRequest, { rejectWithValue }) => {
    try {
      const data: AuthResponse = await apiClient.post("/users/login", payload);
      return data;
    } catch (err: unknown) {
      return rejectWithValue(errorMessage(err, "Login failed"));
    }
  }
);

export const oauthLogin = createAsyncThunk(
  "auth/oauthLogin",
  async (payload: OAuthLoginRequest, { rejectWithValue }) => {
    try {
      const data: AuthResponse = await apiClient.post("/users/oauth-login", payload);
      return data;
    } catch (err: unknown) {
      return rejectWithValue(errorMessage(err, "OAuth login failed"));
    }
  }
);

export const switchToSpecialist = createAsyncThunk<
  { workerId: string; services: WorkerService[]; verificationStatus: "pending" | "approved" | "rejected" },
  SwitchToSpecialistRequest
>(
  "auth/switchToSpecialist",
  async (payload, { rejectWithValue }) => {
    try {
      const data = await apiClient.post<{ workerId: string; services: WorkerService[]; verificationStatus: "pending" | "approved" | "rejected" }>(
        "/users/switch-to-specialist",
        payload
      );
      return data;
    } catch (err: unknown) {
      return rejectWithValue(errorMessage(err, "Failed to create specialist profile"));
    }
  }
);

export const fetchSpecialistProfile = createAsyncThunk(
  "auth/fetchSpecialistProfile",
  async (userId: string, { rejectWithValue }) => {
    try {
      const data = await apiClient.get(`/workers/by-user/${userId}`);
      return data as SpecialistProfile;
    } catch {
      return rejectWithValue(null);
    }
  }
);

export const updateLocation = createAsyncThunk(
  "auth/updateLocation",
  async (location: string, { rejectWithValue }) => {
    try {
      await apiClient.put("/users/me", { location, address: location });
      return location;
    } catch (err: unknown) {
      return rejectWithValue(errorMessage(err, "Failed to save location"));
    }
  }
);

function buildUserFromResponse(data: AuthResponse): User {
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    role: (data.role as "user" | "admin") || "user",
  };
}

const authSlice = createSlice({
  name: "auth",
  initialState,

  reducers: {
    setActiveMode(state, action: PayloadAction<ActiveMode>) {
      state.activeMode = action.payload;
      if (state.user && state.token) {
        persistSession({
          user: state.user,
          token: state.token,
          activeMode: action.payload,
          specialistProfile: state.specialistProfile,
        });
      }
    },

    setLocation(state, action: PayloadAction<string>) {
      state.location = action.payload;
      if (state.user) {
        state.user.location = action.payload;
        if (state.token) {
          persistSession({
            user: state.user,
            token: state.token,
            activeMode: state.activeMode,
            specialistProfile: state.specialistProfile,
          });
        }
      }
    },

    patchUser(state, action: PayloadAction<Partial<User>>) {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
        if (state.token) {
          persistSession({
            user: state.user,
            token: state.token,
            activeMode: state.activeMode,
            specialistProfile: state.specialistProfile,
          });
        }
      }
    },

    setSpecialistAvailability(state, action: PayloadAction<boolean>) {
      if (state.specialistProfile) {
        state.specialistProfile.isAvailable = action.payload;
        if (state.user && state.token) {
          persistSession({
            user: state.user,
            token: state.token,
            activeMode: state.activeMode,
            specialistProfile: state.specialistProfile,
          });
        }
      }
    },

    toggleService(state, action: PayloadAction<{ serviceId: number; enabled: boolean }>) {
      if (state.specialistProfile) {
        state.specialistProfile.isAvailable = action.payload.enabled;
      }
    },

    clearError(state) {
      state.error = null;
    },

    logout(state) {
      // Reset availability before clearing session
      if (state.specialistProfile) {
        state.specialistProfile.isAvailable = false;
      }
      localStorage.removeItem("shuroqx_location_permission");
      sessionStorage.removeItem("shuroqx_location_permission_session");
      sessionStorage.removeItem("shuroqx_location_permission_granted_session");
      clearSession();
      state.user = null;
      state.token = null;
      state.activeMode = "client";
      state.specialistProfile = null;
      state.location = "";
      state.error = null;
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(hydrateAuth.fulfilled, (state, action) => {
        if (action.payload) {
          state.user = action.payload.user;
          state.token = action.payload.token;
          const profile =
            action.payload.specialistProfile?.userId === action.payload.user.id
              ? action.payload.specialistProfile
              : null;
          state.specialistProfile = profile;
          state.activeMode = profile ? action.payload.activeMode : "client";
          state.location = action.payload.user?.location || "";
        }
        state.isHydrated = true;
      })
      .addCase(hydrateAuth.rejected, (state) => {
        state.isHydrated = true;
      });

    builder
      .addCase(registerUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.isLoading = false;
        const user = buildUserFromResponse(action.payload);
        const token = action.payload.access_token || action.payload.token || "";
        state.user = user;
        state.token = token;
        state.activeMode = "client";
        state.location = "";
        persistSession({ user, token, activeMode: "client", specialistProfile: null });
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    builder
      .addCase(loginUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.isLoading = false;
        const user = buildUserFromResponse(action.payload);
        const token = action.payload.access_token || action.payload.token || "";
        state.user = user;
        state.token = token;
        state.activeMode = "client";
        state.specialistProfile = null;
        persistSession({
          user,
          token,
          activeMode: "client",
          specialistProfile: null,
        });
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    builder
      .addCase(oauthLogin.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(oauthLogin.fulfilled, (state, action) => {
        state.isLoading = false;
        const user = buildUserFromResponse(action.payload);
        const token = action.payload.access_token || action.payload.token || "";
        state.user = user;
        state.token = token;
        persistSession({
          user,
          token,
          activeMode: "client",
          specialistProfile: null,
        });
      })
      .addCase(oauthLogin.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    builder
      .addCase(switchToSpecialist.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(switchToSpecialist.fulfilled, (state, action) => {
        state.isLoading = false;
        const profile: SpecialistProfile = {
          id: action.payload.workerId,
          userId: state.user!.id,
          services: action.payload.services,
          isVerified: false,
          verificationStatus: action.payload.verificationStatus || "pending",
          isAvailable: false,
          rejectionReason: "",
        };
        state.specialistProfile = profile;
        state.activeMode = "specialist";
        if (state.user && state.token) {
          persistSession({
            user: state.user,
            token: state.token,
            activeMode: "specialist",
            specialistProfile: profile,
          });
        }
      })
      .addCase(switchToSpecialist.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    builder
      .addCase(fetchSpecialistProfile.fulfilled, (state, action) => {
        if (state.user && action.payload.userId !== state.user.id) {
          state.specialistProfile = null;
          state.activeMode = "client";
          if (state.token) {
            persistSession({
              user: state.user,
              token: state.token,
              activeMode: "client",
              specialistProfile: null,
            });
          }
          return;
        }

        state.specialistProfile = action.payload;
        if (state.user && state.token) {
          persistSession({
            user: state.user,
            token: state.token,
            activeMode: state.activeMode,
            specialistProfile: action.payload,
          });
        }
      })
      .addCase(fetchSpecialistProfile.rejected, (state) => {
        state.specialistProfile = null;
        // Keep the current mode. A user mid-onboarding (no profile yet) stays
        // in specialist mode so the "Become a Specialist" flow remains reachable.
        if (state.user && state.token) {
          persistSession({
            user: state.user,
            token: state.token,
            activeMode: state.activeMode,
            specialistProfile: null,
          });
        }
      });

    builder
      .addCase(updateLocation.fulfilled, (state, action) => {
        state.location = action.payload;
        if (state.user) {
          state.user.location = action.payload;
          if (state.token) {
            persistSession({
              user: state.user,
              token: state.token,
              activeMode: state.activeMode,
              specialistProfile: state.specialistProfile,
            });
          }
        }
      });
  },
});

export const {
  setActiveMode,
  setLocation,
  setSpecialistAvailability,
  toggleService,
  clearError,
  logout,
  patchUser,
} = authSlice.actions;

export default authSlice.reducer;

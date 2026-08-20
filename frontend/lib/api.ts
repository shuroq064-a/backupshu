import { getToken, clearSession } from "./auth";
import { API_BASE_URL, STREAM_BASE_URL } from "./config";

// ─────────────────────────────────────────────
//  Base Config
// ─────────────────────────────────────────────

const BASE_URL = API_BASE_URL;

// ─────────────────────────────────────────────
//  Core Fetch Wrapper
// ─────────────────────────────────────────────

async function request<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  retries = 1  // retry once on failure
): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });

    if (!res.ok) {
      if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/auth")) {
        clearSession();
        document.cookie = "shuroqx_session=; path=/; max-age=0";
        window.location.href = `/auth?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      }
      let message = `API Error ${res.status}`;
      try {
        const errData = await res.json();
        if (typeof errData.detail === "string") {
          message = errData.detail;
        } else if (Array.isArray(errData.detail)) {
          message = errData.detail
            .map((d: { msg?: string; message?: string }) => d.msg || d.message || "")
            .filter(Boolean)
            .join("; ");
        } else if (errData.message) {
          message = errData.message;
        }
      } catch {
        // non-JSON error body
      }
      throw Object.assign(new Error(message), { status: res.status });
    }

    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;

  } catch (err) {
    // Retry once after 2 seconds, but ONLY on network failures (no HTTP
    // status) — never retry validation/conflict errors, or the browser
    // issues duplicated requests.
    if (retries > 0 && !(err instanceof Error && "status" in err)) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return request<T>(method, path, body, retries - 1);
    }
    throw err;
  }
}

// ─────────────────────────────────────────────
//  API Client
// ─────────────────────────────────────────────

export const apiClient = {
  get: <T>(path: string, retries = 1) => request<T>("GET", path, undefined, retries),
  post: <T>(path: string, body: unknown, retries = 1) => request<T>("POST", path, body, retries),
  put: <T>(path: string, body: unknown, retries = 1) => request<T>("PUT", path, body, retries),
  patch: <T>(path: string, body: unknown, retries = 1) => request<T>("PATCH", path, body, retries),
  delete: <T>(path: string, retries = 1) => request<T>("DELETE", path, undefined, retries),
};

// ─────────────────────────────────────────────
//  Domain-specific API Calls
// ─────────────────────────────────────────────

import type {
  RegisterRequest,
  LoginRequest,
  OAuthLoginRequest,
  AuthResponse,
  SwitchToSpecialistRequest,
  SwitchToSpecialistResponse,
  SpecialistProfile,
  Booking,
  SpecialistResult,
  UserQueryCreateRequest,
  UserQueryResponse,
  IntentWorkerMatchResponse,
  ServiceOption,
  WorkerService,
  LocationDetectionResponse,
  LocationGeocodeResult,
  LocationPermissionChoice,
  LocationPermissionResponse,
  LocationPlaceResult,
  SavedAddress,
  SavedAddressPayload,
} from "@/types";

// ── Auth ──────────────────────────────────────

export const authApi = {
  register: (payload: RegisterRequest) =>
    apiClient.post<AuthResponse>("/users/register", payload),

  login: (payload: LoginRequest) =>
    apiClient.post<AuthResponse>("/users/login", payload),

  oauthLogin: (payload: OAuthLoginRequest) =>
    apiClient.post<AuthResponse>("/users/oauth-login", payload),

  switchToSpecialist: (payload: SwitchToSpecialistRequest) =>
    apiClient.post<SwitchToSpecialistResponse>(
      "/users/switch-to-specialist",
      payload
    ),
};

// ── Workers / Specialists ─────────────────────

export const workerApi = {
  getProfileByUserId: (userId: string) =>
    apiClient.get<SpecialistProfile>(`/workers/by-user/${userId}`),

  updateAvailability: (workerId: string, isAvailable: boolean) =>
    apiClient.patch<{ is_available: boolean }>(`/workers/${workerId}/availability`, {
      is_available: isAvailable,
    }),

  getBookings: (workerId: string, status?: string) =>
    apiClient.get<Booking[]>(
      `/workers/${workerId}/bookings${status ? `?status=${status}` : ""}`
    ),

  getEarnings: (workerId: string) =>
    apiClient.get<{
      today: number;
      week: number;
      total: number;
    }>(`/workers/${workerId}/earnings`),

  addService: (workerId: string, serviceId: string, extra?: { price_override?: number; experience_years?: number }) =>
    apiClient.post<WorkerService>(`/workers/${workerId}/services`, {
      service_id: serviceId,
      ...(extra?.price_override != null ? { price_override: extra.price_override } : {}),
      ...(extra?.experience_years != null ? { experience_years: extra.experience_years } : {}),
    }),

  updateLocation: (
    workerId: string,
    body: { latitude: number; longitude: number; address?: string }
  ) => apiClient.patch<SpecialistProfile>(`/workers/${workerId}/location`, body),
};

export const servicesApi = {
  getServices: () => apiClient.get<ServiceOption[]>("/services"),
};

// ── Admin ─────────────────────────────────────

import type { SpecialistReview, AdminStats, AdminUser } from "@/store/slices/adminSlice";

export const adminApi = {
  getSpecialists: (status: "pending" | "approved" | "rejected") =>
    apiClient.get<SpecialistReview[]>(`/admin/specialists?status=${status}`),

  getSpecialistById: (id: string) =>
    apiClient.get<SpecialistReview>(`/admin/specialists/${id}`),

  approveSpecialist: (id: string) =>
    apiClient.patch<void>(`/admin/specialists/${id}/approve`, {}),

  rejectSpecialist: (id: string, reason: string) =>
    apiClient.patch<void>(`/admin/specialists/${id}/reject`, { reason }),

  getPendingSkills: () =>
    apiClient.get<unknown[]>("/admin/pending-skills"),

  approveSkill: (workerId: string, serviceId: string) =>
    apiClient.patch<void>(`/admin/skills/${workerId}/${serviceId}/approve`, {}),

  rejectSkill: (workerId: string, serviceId: string) =>
    apiClient.patch<void>(`/admin/skills/${workerId}/${serviceId}/reject`, {}),

  getStats: () =>
    apiClient.get<AdminStats>("/admin/stats"),

  getAllUsers: () =>
    apiClient.get<AdminUser[]>("/admin/users"),
};

// ── User Profile ─────────────────────────────

export interface UserProfile {
  id: string;
  name?: string;
  email: string;
  phone?: string;
  address?: string;
  location?: string;
  language: string;
  avatar?: string;
  role: string;
  age?: number;
  gender?: string;
  profession?: string;
  onboardingCompleted?: boolean;
  createdAt?: string;
}

export interface UpdateProfilePayload {
  name?: string;
  phone?: string;
  address?: string;
  location?: string;
  language?: string;
  age?: number;
  gender?: string;
  profession?: string;
  onboarding_completed?: boolean;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export const userApi = {
  getProfile: () =>
    apiClient.get<UserProfile>("/users/me"),

  updateProfile: (payload: UpdateProfilePayload) =>
    apiClient.put<UserProfile>("/users/me", payload),

  changePassword: (payload: ChangePasswordPayload) =>
    apiClient.post<{ message: string }>("/users/change-password", payload),

  requestDeleteVerification: () =>
    apiClient.post<{
      ok: boolean;
      via: string;
      contact: string;
      expiresInSeconds: number;
      dev_otp?: string;
    }>("/users/me/delete-verification", {}),

  deleteAccount: (otp?: string) =>
    apiClient.delete<{ message: string; status: string }>(
      otp ? `/users/me?otp=${encodeURIComponent(otp)}` : "/users/me"
    ),

  getAddresses: () =>
    apiClient.get<SavedAddress[]>("/users/me/addresses"),

  createAddress: (payload: SavedAddressPayload) =>
    apiClient.post<SavedAddress>("/users/me/addresses", payload),

  updateAddress: (addressId: string, payload: SavedAddressPayload) =>
    apiClient.put<SavedAddress>(`/users/me/addresses/${addressId}`, payload),

  deleteAddress: (addressId: string) =>
    apiClient.delete<{ message: string }>(`/users/me/addresses/${addressId}`),
};

// ── Marketplace / Search ──────────────────────

export const marketplaceApi = {
  searchSpecialists: (
    query: string,
    location?: string,
    coords?: { latitude: number; longitude: number }
  ) =>
    apiClient.post<SpecialistResult[]>("/marketplace/search", {
      query,
      location,
      ...(coords
        ? { latitude: coords.latitude, longitude: coords.longitude }
        : {}),
    }),

  getBookings: (userId: string) =>
    apiClient.get<Booking[]>(`/users/${userId}/bookings`),
};

export const locationPermissionApi = {
  getStatus: () =>
    apiClient.get<string | null>("/location-permission/status"),

  requestPermission: (permission_type: LocationPermissionChoice) =>
    apiClient.post<LocationPermissionResponse>("/location-permission/request", {
      permission_type,
    }),

  detect: () =>
    apiClient.post<LocationDetectionResponse>("/location-permission/detect", {}),

  revoke: () =>
    apiClient.post<LocationPermissionResponse>("/location-permission/revoke", {}),

  clearOnClose: () =>
    apiClient.post<{ success: boolean; cleared: boolean; message: string }>(
      "/location-permission/clear-on-close",
      {}
    ),

  reverseGeocode: (latitude: number, longitude: number, address?: string) =>
    apiClient.post<LocationGeocodeResult>("/location-permission/validate-location", { latitude, longitude, address }),

  geocode: (address: string) =>
    apiClient.post<LocationGeocodeResult>("/location-permission/validate-location", { address }),

  searchPlaces: (query: string) =>
    apiClient.get<LocationPlaceResult[]>(
      `/location-permission/search?query=${encodeURIComponent(query)}`
    ),

  /** Server-side IP geolocation proxy — no CORS issues. */
  ipLocation: () =>
    apiClient.get<{
      success: boolean;
      latitude: number | null;
      longitude: number | null;
      city: string;
      region: string;
      country: string;
    }>("/location-permission/ip-location"),
};

// ── User Input / Intent ───────────────────────

export const userInputApi = {
  createQuery: (payload: UserQueryCreateRequest) =>
    apiClient.post<UserQueryResponse>("/userinput/user-query", payload),
};

export const intentApi = {
  getWorkersByQueryId: (queryId: string) =>
    apiClient.get<IntentWorkerMatchResponse>(`/intent/user-intent/${queryId}`, 0),
};

// ── LLM Assistant (streaming chat) ──────────────

/**
 * POST /assistant/chat as Server-Sent Events.
 * Calls `onEvent` for each parsed event ("start" | "token" | "clarify" | "match" |
 * "no_workers" | "error" | "done"). Returns when the stream closes.
 */
export async function streamAssistantChat(
  message: string,
  onEvent: (event: import("@/types").AssistantStreamEvent) => void,
  signal?: AbortSignal,
  history?: { role: "user" | "assistant"; content: string }[],
  location?: { latitude: number; longitude: number }
): Promise<void> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const body: Record<string, unknown> = { message };
  // Send recent chat history so the assistant remembers the booking it arranged
  // and can answer "where is my specialist?" from prior context.
  if (history && history.length) {
    body.context = JSON.stringify(history.slice(-20));
  }
  // Send the customer's location so the assistant only matches specialists
  // within the configured radius (5 km) of the service address.
  if (location) {
    body.latitude = location.latitude;
    body.longitude = location.longitude;
  }

  const res = await fetch(`${STREAM_BASE_URL}/assistant/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    if (res.status === 401) {
      clearSession();
      document.cookie = "shuroqx_session=; path=/; max-age=0";
      window.location.href = `/auth?redirect=${encodeURIComponent(
        window.location.pathname + window.location.search
      )}`;
    }
    let message = `Assistant Error ${res.status}`;
    try {
      const errData = await res.json();
      if (typeof errData.detail === "string") message = errData.detail;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      const dataLine = frame
        .split("\n")
        .find((l) => l.startsWith("data:"));
      if (!dataLine) continue;

      const json = dataLine.slice("data:".length).trim();
      if (!json) continue;
      try {
        onEvent(JSON.parse(json) as import("@/types").AssistantStreamEvent);
      } catch {
        /* skip malformed frame */
      }
    }
  }
}



// ── Booking API (Tasks 01, 02, 04, 05) ────────────────────────────────────────

export interface CreateBookingPayload {
  worker_id?: string;
  service_type: string;
  address: string;
  receiver_name: string;
  contact_number: string;
  house_flat: string;
  block_area: string;
  landmark?: string;
  address_label: "Home" | "Work" | "Other";
  custom_address_label?: string;
  scheduled_date: string;
  scheduled_time: string;
  notes?: string;
  visit_charge?: number;
  customer_latitude?: number;
  customer_longitude?: number;
}

export const bookingApi = {
  create: (payload: CreateBookingPayload) =>
    apiClient.post<import("@/types").BookingDetail>("/bookings", payload),

  getById: (id: string) =>
    apiClient.get<import("@/types").BookingDetail>(`/bookings/${id}`),

  getMyBookings: (userId: string, status?: string) =>
    apiClient.get<import("@/types").BookingDetail[]>(
      `/users/${userId}/bookings${status ? `?status=${status}` : ""}`
    ),

  updateStatus: (bookingId: string, status: string, reason?: string, otp?: string) =>
    apiClient.patch<import("@/types").BookingDetail>(`/bookings/${bookingId}/status`, {
      status, reason, otp,
    }),

  getBookingOtp: (bookingId: string) =>
    apiClient.get<{ otp: string; expiresAt: string }>(`/bookings/${bookingId}/otp`),

  submitReview: (bookingId: string, rating: number, feedback: string) =>
    apiClient.post(`/bookings/${bookingId}/review`, { rating, feedback }),

  updateLocation: (bookingId: string, latitude: number, longitude: number) =>
    apiClient.post<import("@/types").BookingDetail>(`/bookings/${bookingId}/location`, {
      latitude, longitude,
    }),
};

// ── Payment API (Razorpay) ──────────────────────────────────────────────────

export const paymentApi = {
  createOrder: (bookingId: string) =>
    apiClient.post<import("@/types").PaymentOrder>("/payments/create-order", { booking_id: bookingId }),

  verify: (bookingId: string, orderId: string, paymentId: string, razorpaySignature: string) =>
    apiClient.post<import("@/types").PaymentResult>("/payments/verify", {
      bookingId,
      orderId,
      paymentId,
      razorpaySignature,
    }),
};

// ── Worker API additions ───────────────────────────────────────────────────────

export const workerExtApi = {
  getRequests: (workerId: string) =>
    apiClient.get<import("@/types").BookingDetail[]>(`/workers/${workerId}/requests`),

  getBookings: (workerId: string, status?: string) =>
    apiClient.get<import("@/types").BookingDetail[]>(
      `/workers/${workerId}/bookings${status ? `?status=${status}` : ""}`
    ),

  getEarnings: (workerId: string) =>
    apiClient.get<import("@/types").EarningsData>(`/workers/${workerId}/earnings`),

  getReviews: (workerId: string, page = 1) =>
    apiClient.get<import("@/types").BookingReview[]>(`/workers/${workerId}/reviews?page=${page}`),

  getActivebooking: (workerId: string) =>
    apiClient.get<{ hasActive: boolean; booking: import("@/types").BookingDetail | null }>(
      `/workers/${workerId}/active-booking`
    ),

  addService: (workerId: string, serviceId: string, extra?: { price_override?: number; experience_years?: number }) =>
    apiClient.post(`/workers/${workerId}/services`, {
      service_id: serviceId,
      ...(extra?.price_override != null ? { price_override: extra.price_override } : {}),
      ...(extra?.experience_years != null ? { experience_years: extra.experience_years } : {}),
    }),
};

// ── Messages API (specialist <-> client chat) ──────────────────────────────

export interface ChatMessageDTO {
  id: string;
  bookingId: string;
  senderType: "worker" | "client";
  senderId: string;
  recipientType: "worker" | "client";
  recipientId: string;
  text: string;
  read: boolean;
  createdAt: string;
}

export interface ConversationDTO {
  bookingId: string;
  bookingNumber: string | null;
  serviceType: string | null;
  otherName: string;
  otherId: string;
  otherType: "worker" | "client";
  callerRole: "worker" | "client";
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
}

export const messageApi = {
  send: (bookingId: string, text: string, recipientType: "worker" | "client", recipientId: string) =>
    apiClient.post<ChatMessageDTO>("/messages", { booking_id: bookingId, text, recipient_type: recipientType, recipient_id: recipientId }),

  listByBooking: (bookingId: string) =>
    apiClient.get<ChatMessageDTO[]>(`/messages/booking/${bookingId}`),

  conversations: () =>
    apiClient.get<ConversationDTO[]>("/messages/conversations"),
};

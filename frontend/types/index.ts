// ─────────────────────────────────────────────
//  ShuroqX — Shared Type Definitions
// ─────────────────────────────────────────────

// ── Auth & Identity ──────────────────────────

export type AuthProvider = "email" | "google" | "facebook" | "apple";

export interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  phone?: string;
  address?: string;
  role: "user" | "admin";
  location?: string; 
  createdAt?: string;
}

export interface SpecialistProfile {
  rejectionReason: string | null;
  id: string;
  userId: string;
  services: WorkerService[];
  isVerified: boolean;
  verificationStatus: "pending" | "approved" | "rejected";
  isAvailable: boolean;
  rating?: number;
  totalEarnings?: number;
  weeklyEarnings?: number;
  todayEarnings?: number;
  distanceKm?: number;
  etaMinutes?: number;
  visitCharge?: number;
  hasPendingSkill?: boolean;
}

// ── Active Mode ───────────────────────────────

export type ActiveMode = "client" | "specialist";

// ── Session ───────────────────────────────────

export interface Session {
  user: User;
  token: string;
  activeMode: ActiveMode;
  specialistProfile: SpecialistProfile | null;
}

// ── Auth Store State ──────────────────────────

export interface AuthState {
  user: User | null;
  token: string | null;
  activeMode: ActiveMode;
  specialistProfile: SpecialistProfile | null;
  location: string;  
  isLoading: boolean;
  error: string | null;
  isHydrated: boolean;
}

// ── API Request / Response shapes ────────────

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface OAuthLoginRequest {
  email: string;
  name?: string;
  avatar?: string;
  provider: AuthProvider;
  provider_id: string;
}

export interface AuthResponse {
  id: string;
  email: string;
  name?: string;
  role: string;
  token?: string;
  access_token?: string;
}

export interface SwitchToSpecialistRequest {
  userId: string;
  service_id: string;
}

export interface SwitchToSpecialistResponse {
  workerId: string;
  services: WorkerService[];
  verificationStatus: "pending";
}

// ── Bookings ──────────────────────────────────

export type BookingStatus = "upcoming" | "accepted" | "started" | "reached" | "ongoing" | "completed" | "cancelled" | "rejected";

export interface Booking {
  id: string;
  clientName: string;
  clientAvatar?: string;
  address: string;
  serviceType: string;
  scheduledDate: string;
  scheduledTime: string;
  amount: number;
  status: BookingStatus;
  createdAt?: string;
  updatedAt?: string;
  receiverName?: string;
  contactNumber?: string;
  houseFlat?: string;
  blockArea?: string;
  landmark?: string;
  addressLabel?: AddressLabel;
  customAddressLabel?: string;
}

// ── Booking Detail (modal) ────────────────────

export interface CostBreakdown {
  visitCharge: number;
  repairWork?: number;
  tip?: number;
  total: number;
  paymentMethod?: string; // "GPay" | "Cash" | "Card" | etc.
}

export interface SpecialistInfo {
  name: string;
  avatar?: string;
  services: WorkerService[];
  rating: number;       // e.g. 4.5
  reviewCount: number;  // e.g. 50
  phone?: string;
}

export interface BookingDetail extends Booking {
  bookingNumber: string;
  workerId?: string;
  clientPhone?: string;
  clientAddress?: string;
  visitCharge?: number;         // e.g. "#4621"
  specialist: SpecialistInfo;
  etaMinutes?: number;           // only for ongoing
  notes?: string;                // booking notes from client
  costBreakdown?: CostBreakdown; // available after completion
  customerFeedback?: string;     // review left by client
  customerRating?: number;       // 1-5 stars
  cancellationReason?: string;   // if cancelled
  cancelledBy?: "client" | "specialist" | "system";
}

// ── Services ──────────────────────────────────

export interface ServiceItem {
  id: string;
  name: string;
  icon: string;
  isEnabled: boolean;
  date?: string;
  earnings?: number;
}

export interface ServiceOption {
  id: string;
  name: string;
  description?: string | null;
}

export interface WorkerService {
  service_id: string;
  service_name: string;
  price_override?: number | null;
  experience_years?: number | null;
  status: "pending" | "verified" | string;
}

// ── Chat / Marketplace ────────────────────────

export interface SpecialistResult {
  workerId: string;
  name: string;
  services: WorkerService[];
  avatar?: string;
  distanceKm?: number;
  etaMinutes?: number;
  visitCharge?: number;
  rating?: number;
  phone?: string;
  email?: string;
  isAvailable?: boolean;
  isVerified?: boolean;
  gender?: "male" | "female" | "other";
  price?: number | null;
  experienceYears?: number | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  specialist?: SpecialistResult;
  bookingId?: string;       // set after booking is created
  bookingPending?: boolean; // true = waiting for specialist to accept
  // ── LLM assistant extensions ──
  streaming?: boolean;      // tokens still arriving
  queryId?: string;        // backend UserQuery id for this turn
  intent?: string | null;  // resolved catalog intent
  clarifyOptions?: string[] | null; // shown as selectable chips
  awaitingChoice?: boolean; // user must pick an option
  candidates?: SpecialistResult[]; // matched specialists for this intent (user picks one)
  selectedWorkerId?: string | null; // the specialist the customer chose to book
  agentTrace?: AgentTraceStep[];    // multi-agent working steps for this turn (UI only)
  agentLabel?: string;              // active agent display name (e.g. "Booking Agent")
  agentJob?: string;                // active agent task (e.g. "Finding a verified specialist")
}

// ── Assistant SSE stream events (POST /assistant/chat) ──
export type AssistantStreamEvent =
  | { type: "start"; queryId: string }
  | { type: "agent"; name: string; label: string; job: string }
  | { type: "thought"; text: string }
  | { type: "tool"; name: string; args: Record<string, unknown>; summary: string }
  | { type: "token"; text: string }
  | {
      type: "clarify";
      reply: string;
      options: string[];
      intent: string | null;
    }
  | {
      type: "match";
      reply: string;
      intent: string;
      workers: MatchedWorkerOut[];
    }
  | { type: "no_workers"; reply: string; intent: string }
  | { type: "error"; reply: string }
  | { type: "done" };

// A live, transient trace of which agent/tool is working for the current turn.
export interface AgentTraceStep {
  kind: "agent" | "thought" | "tool";
  label?: string;
  text: string;
}

// Location permission
export type LocationPermissionChoice =
  | "Allow all the time"
  | "While Using This Site"
  | "Deny";

export interface LocationPermissionResponse {
  success: boolean;
  permission: string;
  gps_access: boolean;
  session_only?: boolean;
  allow_manual_edit?: boolean;
  manual_location_allowed?: boolean;
  booking_allowed?: boolean;
  message: string;
}

export interface LocationDetectionResponse {
  success: boolean;
  permission: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  allow_manual_edit: boolean;
  message: string;
}

export interface LocationGeocodeResult {
  formatted_address: string;
  latitude?: number | null;
  longitude?: number | null;
  valid?: boolean;
  message?: string | null;
}

export interface LocationPlaceResult {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface ServiceLocation {
  address: string;
  latitude?: number;
  longitude?: number;
  permission?: LocationPermissionChoice;
  source: "gps" | "manual" | "profile" | "map";
}

export type AddressLabel = "Home" | "Work" | "Other";

export interface ServiceAddressDetails {
  receiverName: string;
  contactNumber: string;
  houseFlat: string;
  blockArea: string;
  landmark?: string;
  addressLabel: AddressLabel;
  customAddressLabel?: string;
}

export interface SavedAddress extends ServiceAddressDetails {
  id: string;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SavedAddressPayload {
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  receiver_name: string;
  contact_number: string;
  house_flat: string;
  block_area: string;
  landmark?: string;
  address_label: AddressLabel;
  custom_address_label?: string;
  is_default?: boolean;
}

// ── NLP / Intent Lookup ───────────────────────

export interface UserQueryCreateRequest {
  input_message: string;
}

export interface UserQueryOut {
  id: string;
  input_message: string;
  intent?: string | null;
  user_id: string;
}

export interface UserQueryResponse {
  message: string;
  data: UserQueryOut;
}

export interface MatchedWorkerOut {
  id: string;
  userId: string;
  name?: string | null;
  email: string;
  avatar?: string | null;
  services: WorkerService[];
  isAvailable: boolean;
  isVerified: boolean;
  verificationStatus: string;
  rejectionReason?: string | null;
  phone?: string | null;
  address?: string | null;
  location?: string | null;
  language?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  price?: number | null;
  experienceYears?: number | null;
}

export interface IntentWorkerMatchResponse {
  status: string;
  message: string;
  intent: string | null;
  data: MatchedWorkerOut[];
}


// ── Task 04: Earnings ─────────────────────────────────────────────────────────
export interface EarningsData {
  today: number;
  week: number;
  total: number;
  todayCount: number;
  weekCount: number;
  totalCount: number;
}

// ── Task 05 / 11: Reviews ─────────────────────────────────────────────────────
export interface BookingReview {
  bookingId: string;
  bookingNumber: string;
  clientName: string;
  rating: number;
  feedback?: string;
  serviceType: string;
  date: string;
}

// ── Status metadata ───────────────────────────────────────────────────────────
export const STATUS_META: Record<string, { label: string; color: string; bg: string; next?: string; nextLabel?: string }> = {
  upcoming:  { label: "Pending",        color: "#7C3AED", bg: "#F5F3FF" },
  accepted:  { label: "Accepted",       color: "#2563EB", bg: "#EFF6FF", next: "started",   nextLabel: "Start Journey" },
  started:   { label: "On the Way",     color: "#D97706", bg: "#FEF3C7", next: "reached",   nextLabel: "Arrived at Location" },
  reached:   { label: "Arrived",        color: "#059669", bg: "#ECFDF5", next: "ongoing",   nextLabel: "Start Work" },
  ongoing:   { label: "Work in Progress",color: "#0891B2",bg: "#ECFEFF", next: "completed", nextLabel: "Mark Complete" },
  completed: { label: "Completed",      color: "#059669", bg: "#ECFDF5" },
  cancelled: { label: "Cancelled",      color: "#DC2626", bg: "#FEF2F2" },
  rejected:  { label: "Rejected",       color: "#DC2626", bg: "#FEF2F2" },
};

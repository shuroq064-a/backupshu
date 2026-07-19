"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { bookingApi, streamAssistantChat } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { WS_BASE_URL } from "@/lib/config";
import { useAppSelector } from "@/store";
import { SkillBadges } from "@/components/ui/SkillBadges";
import { useToast } from "@/components/ui/Toast";
import { useProfileGuard } from "@/hooks/UseProfileguard";
import { Loader } from "@/components/prompt-kit/loader";
import { SpecialistDetailsModal } from "@/components/dashboard/client/SpecialistDetailsModal";
import { BookingDetailModal } from "@/components/dashboard/client/BookingDetailModal";
import { SERVICE_ADDRESS_DETAILS_KEY, SERVICE_LOCATION_KEY } from "@/components/location/ServiceLocationFlow";
import {
  ChatContainerRoot,
  ChatContainerContent,
  ChatContainerScrollAnchor,
} from "@/components/prompt-kit/chat-container";
import { ScrollButton } from "@/components/prompt-kit/scroll-button";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/prompt-kit/message";
import { ChatPromptInput } from "@/components/chat-prompt-input";

// ── Specialist Avatar Image Pool (shared with client dashboard) ──
const SPECIALIST_AVATARS: Record<string, string[]> = {
  plumbing: ["/images/specialists/plumber_1.png", "/images/specialists/plumber_2.png"],
  electrical: ["/images/specialists/electrician_1.png", "/images/specialists/electrician_2.png"],
  ac_repair: ["/images/specialists/hvac_1.png", "/images/specialists/hvac_2.png"],
  hvac: ["/images/specialists/hvac_1.png", "/images/specialists/hvac_2.png"],
  painting: ["/images/specialists/painter_1.png"],
  carpenter: ["/images/specialists/carpenter_1.png"],
  carpentry: ["/images/specialists/carpenter_1.png"],
  tech_support: ["/images/specialists/techsupport_1.png"],
  cleaning: ["/images/specialists/cleaning_1.png"],
  general: ["/images/specialists/general_1.png", "/images/specialists/general_2.png"],
};

const ALL_AVATARS = [
  "/images/specialists/plumber_1.png",
  "/images/specialists/electrician_1.png",
  "/images/specialists/hvac_1.png",
  "/images/specialists/painter_1.png",
  "/images/specialists/carpenter_1.png",
  "/images/specialists/techsupport_1.png",
  "/images/specialists/cleaning_1.png",
  "/images/specialists/general_1.png",
  "/images/specialists/plumber_2.png",
  "/images/specialists/electrician_2.png",
  "/images/specialists/hvac_2.png",
  "/images/specialists/general_2.png",
];

function getSpecialistAvatar(name: string, serviceName?: string): string {
  const seed = (name || "specialist") + (serviceName || "");
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  hash = Math.abs(hash);
  const serviceKey = (serviceName || "").toLowerCase().replace(/\s+/g, "_");
  for (const [key, pool] of Object.entries(SPECIALIST_AVATARS)) {
    if (serviceKey.includes(key) || key.includes(serviceKey)) {
      return pool[hash % pool.length];
    }
  }
  return ALL_AVATARS[hash % ALL_AVATARS.length];
}
import type {
  ChatMessage,
  MatchedWorkerOut,
  SpecialistResult,
  ServiceLocation,
  ServiceAddressDetails,
  User,
  BookingDetail,
  AssistantStreamEvent,
} from "@/types";

const WS_BASE = WS_BASE_URL;
const CHAT_STORAGE_KEY = "shuroqx_chat_messages";
const BOOKING_VISIBLE_STATUSES = new Set(["accepted", "started", "reached", "ongoing", "completed"]);
const BOOKING_CLOSED_STATUSES = new Set(["rejected", "completed", "cancelled"]);

export default function RedesignedClientChat() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAppSelector((s) => s.auth);
  const { isComplete, missingFields } = useProfileGuard();
  const { toast, showToast, dismiss } = useToast();

  // Selected chat target: "ai" or the specialist workerId
  const [activeChatTarget, setActiveChatTarget] = useState<"ai" | string>("ai");
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const sidebarResizeCleanupRef = useRef<(() => void) | null>(null);

  const handleSidebarResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const handleMove = (moveEvent: PointerEvent) => {
      setSidebarWidth(Math.max(260, Math.min(440, startWidth + moveEvent.clientX - startX)));
    };
    const handleEnd = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      sidebarResizeCleanupRef.current = null;
    };
    sidebarResizeCleanupRef.current?.();
    sidebarResizeCleanupRef.current = handleEnd;
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd);
  };


  // ── Chat persistence via localStorage ────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [serviceLocation, setServiceLocation] = useState<ServiceLocation | null>(null);
  const [serviceAddressDetails, setServiceAddressDetails] = useState<ServiceAddressDetails | null>(null);

  // Load persisted chat on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw));
      const rawLocation = localStorage.getItem(SERVICE_LOCATION_KEY);
      if (rawLocation) setServiceLocation(JSON.parse(rawLocation));
      const rawAddressDetails = localStorage.getItem(SERVICE_ADDRESS_DETAILS_KEY);
      if (rawAddressDetails) setServiceAddressDetails(JSON.parse(rawAddressDetails));
    } catch {}
    setHydrated(true);
  }, []);

  // Pre-fill prompt from URL if any (e.g. from Discover page category click)
  useEffect(() => {
    if (hydrated) {
      const query = searchParams.get("query");
      if (query) {
        setInput(query);
      }
    }
  }, [hydrated, searchParams]);

  useEffect(() => {
    function handleServiceLocation(event: Event) {
      const detail = (event as CustomEvent<ServiceLocation>).detail;
      if (detail) setServiceLocation(detail);
    }

    window.addEventListener("shuroqx-service-location", handleServiceLocation);
    function handleAddressDetails(event: Event) {
      const detail = (event as CustomEvent<ServiceAddressDetails>).detail;
      if (detail) setServiceAddressDetails(detail);
    }
    window.addEventListener("shuroqx-service-address-details", handleAddressDetails);
    return () => {
      window.removeEventListener("shuroqx-service-location", handleServiceLocation);
      window.removeEventListener("shuroqx-service-address-details", handleAddressDetails);
    };
  }, []);

  const saveMessages = useCallback((msgs: ChatMessage[]) => {
    setMessages(msgs);
    try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(msgs)); } catch {}
  }, []);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => {
      const next = [...prev, msg];
      try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const updateMessage = useCallback(
    (
      id: string,
      patch: Partial<ChatMessage> | ((prev: ChatMessage | undefined) => Partial<ChatMessage>),
    ) => {
      setMessages(prev => {
        const next = prev.map(m => {
          if (m.id !== id) return m;
          const delta = typeof patch === "function" ? patch(m) : patch;
          return { ...m, ...delta };
        });
        try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(next)); } catch {}
        return next;
      });
    },
    [],
  );

  // ── Input + search ────────────────────────────────────────────────────────
  const [input, setInput] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const isSubmittingRef = useRef(false);

  // ── WebSocket management ──────────────────────────────────────────────────
  const [acceptedMsgIds, setAcceptedMsgIds] = useState<Set<string>>(new Set());
  const [statusByBooking, setStatusByBooking] = useState<Map<string, string>>(new Map());
  const wsRefs = useRef<Map<string, WebSocket>>(new Map());

  // ── Specialist details modal ──────────────────────────────────────────────
  const [detailSpecialist, setDetailSpecialist] = useState<SpecialistResult | null>(null);

  // ── Job detail modal (from chat thread "View Job Details") ────────────────
  const [jobBooking, setJobBooking] = useState<BookingDetail | null>(null);

  async function handleViewJob(bookingId: string) {
    try {
      const detail = await bookingApi.getById(bookingId);
      setJobBooking(detail);
    } catch {
      showToast("Could not load job details. Please try again.", "error");
    }
  }

  // Remember the last intent/note so the customer can pick a specialist after a match.
  const prevIntentRef = useRef<string | null>(null);
  const prevNoteRef = useRef<string>("");

  const closeOpenSockets = useCallback(() => {
    wsRefs.current.forEach(ws => ws.close());
  }, []);

  // Cleanup WebSockets on unmount
  useEffect(() => {
    return closeOpenSockets;
  }, [closeOpenSockets]);

  const syncBookingStatus = useCallback(async (bookingId: string, msgId: string) => {
    try {
      const booking = await bookingApi.getById(bookingId);
      setStatusByBooking(prev => new Map(prev).set(bookingId, booking.status));

      if (BOOKING_VISIBLE_STATUSES.has(booking.status)) {
        setAcceptedMsgIds(prev => new Set(prev).add(msgId));
      }
    } catch {
      // A missed sync should not block the live socket from receiving updates.
    }
  }, []);

  const watchBooking = useCallback((bookingId: string, msgId: string) => {
    if (wsRefs.current.has(bookingId)) return;

    const token = getToken();
    if (!token) {
      showToast("Your session expired. Please log in again to track this booking.", "error");
      return;
    }

    const params = new URLSearchParams({ msg_id: msgId, token });
    const ws = new WebSocket(`${WS_BASE}/ws/bookings/${encodeURIComponent(bookingId)}?${params.toString()}`);

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type !== "STATUS_UPDATE") return;

        // Update live status map
        setStatusByBooking(prev => new Map(prev).set(data.bookingId, data.status));

        // Reveal specialist card on accept
        if (BOOKING_VISIBLE_STATUSES.has(data.status) && data.messageId) {
          setAcceptedMsgIds(prev => new Set(prev).add(data.messageId));
        }

        const toastMsg =
          data.status === "accepted"  ? `Specialist accepted your ${data.serviceType} request!` :
          data.status === "started"   ? `Specialist is on the way!` :
          data.status === "reached"   ? `Specialist has arrived at your location!` :
          data.status === "ongoing"   ? `Work has started!` :
          data.status === "completed" ? `Job complete! Please leave a review.` :
          data.status === "rejected"  ? `Specialist couldn't take this request.` : null;

        if (toastMsg) {
          showToast(toastMsg, data.status === "rejected" ? "error" : data.status === "completed" ? "success" : "info");
        }

        if (BOOKING_CLOSED_STATUSES.has(data.status)) {
          ws.close();
          wsRefs.current.delete(bookingId);
        }
      } catch {}
    };

    ws.onclose = () => wsRefs.current.delete(bookingId);
    wsRefs.current.set(bookingId, ws);
  }, [showToast]);

  // Track bookings we've already wired up so re-renders (which happen on every
  // streamed token and status update) don't re-fire the GET / re-subscribe loop.
  const wiredBookingsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!hydrated) return;

    messages.forEach(msg => {
      if (!msg.bookingPending || !msg.bookingId) return;
      if (wiredBookingsRef.current.has(msg.bookingId)) return;
      wiredBookingsRef.current.add(msg.bookingId);
      void syncBookingStatus(msg.bookingId, msg.id);
      watchBooking(msg.bookingId, msg.id);
    });
  }, [hydrated, messages, syncBookingStatus, watchBooking]);

  function mapWorkerToSpecialist(worker: MatchedWorkerOut): SpecialistResult {
    return {
      workerId: worker.id,
      name: worker.name?.trim() || worker.email.split("@")[0],
      services: worker.services || [],
      avatar: worker.avatar || undefined,
      phone: worker.phone || undefined,
      email: worker.email,
      isAvailable: worker.isAvailable,
      isVerified: worker.isVerified,
      price: worker.price ?? undefined,
      experienceYears: worker.experienceYears ?? undefined,
    };
  }

  async function resolveBookingLocation(address: string): Promise<ServiceLocation> {
    if (
      serviceLocation?.address === address &&
      serviceLocation.latitude !== undefined &&
      serviceLocation.longitude !== undefined
    ) {
      return serviceLocation;
    }

    return {
      address,
      source: serviceLocation?.source || "manual",
      permission: serviceLocation?.permission,
    };
  }

  async function createBookingForIntent(
    intent: string,
    note: string,
    assistantMsgId: string,
    workerId?: string,
  ): Promise<void> {
    const bookingLocation = serviceLocation?.address || user?.location || "";
    let bookingId: string | undefined;
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const resolvedLocation = await resolveBookingLocation(bookingLocation);
      const details = serviceAddressDetails;
      const booking = await bookingApi.create({
        service_type: intent || "General Service",
        address: resolvedLocation.address,
        receiver_name: details?.receiverName || user?.name || bookingLocation,
        contact_number: details?.contactNumber || user?.phone || "Not provided",
        house_flat: details?.houseFlat || "",
        block_area: details?.blockArea || "",
        landmark: details?.landmark,
        address_label: details?.addressLabel || "Home",
        custom_address_label: details?.customAddressLabel,
        scheduled_date: tomorrow.toISOString().split("T")[0],
        scheduled_time: "10:00 AM",
        notes: note,
        visit_charge: 100,
        customer_latitude: resolvedLocation.latitude,
        customer_longitude: resolvedLocation.longitude,
        ...(workerId ? { worker_id: workerId } : {}),
      });
      bookingId = booking.id;
      watchBooking(bookingId, assistantMsgId);
    } catch (err) {
      console.error("Booking creation failed:", err);
      updateMessage(assistantMsgId, {
        content: err instanceof Error
          ? `I matched a specialist, but couldn't create the booking: ${err.message}`
          : "I matched a specialist, but couldn't create the booking. Please try again.",
        streaming: false,
        bookingPending: false,
      });
      return;
    }

    updateMessage(assistantMsgId, {
      content: workerId
        ? `Booking created with your chosen specialist. Waiting for acceptance...`
        : `Found a specialist for ${intent}. Waiting for acceptance...`,
      streaming: false,
      bookingPending: true,
      bookingId,
    });
  }

  // Customer picks which matched specialist to book (avoids the "wrong specialist"
  // problem where a broadcast is grabbed by whoever accepts first).
  function handleChooseSpecialist(workerId: string, assistantMsgId: string) {
    updateMessage(assistantMsgId, (prev) => ({
      ...prev,
      selectedWorkerId: workerId,
    }));
    const intent = prevIntentRef.current;
    if (intent) {
      void createBookingForIntent(intent, prevNoteRef.current, assistantMsgId, workerId);
    }
  }

  async function handleSend(presetMessage?: string) {
    const text = (presetMessage ?? input).trim();
    if (!text || isSearching || isSubmittingRef.current) return;

    if (isComplete === false) {
      showToast(`Please add your ${missingFields.join(" and ")} in Profile before making a request.`, "error");
      return;
    }

    const bookingLocation = serviceLocation?.address || user?.location || "";
    if (!bookingLocation.trim()) {
      showToast("Please choose a service location before booking.", "error");
      window.dispatchEvent(new Event("shuroqx-open-location-permission"));
      return;
    }
    // Address/contact details are encouraged but NOT a hard gate: the AI agent
    // should still be able to broadcast the request using the customer's profile
    // data as a fallback, so a specialist can accept it without extra friction.

    isSubmittingRef.current = true;
    const userMsgId = Date.now().toString();
    addMessage({ id: userMsgId, role: "user", content: text, timestamp: new Date().toISOString() });
    setInput("");
    setIsSearching(true);

    const assistantMsgId = (Date.now() + 1).toString();
    addMessage({
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
      streaming: true,
    });

    try {
      // Build recent chat history so the AI remembers the booking it arranged and
      // can answer tracking questions (e.g. "where is my specialist?"). Exclude the
      // assistant bubble we just appended (it's still empty/streaming).
      const history = messages
        .filter((m) => m.content && !m.streaming)
        .slice(-10)
        .map((m) => ({
          role: (m.role === "assistant" ? "assistant" : "user") as
            | "user"
            | "assistant",
          content: m.content || "",
        }));

      await streamAssistantChat(
        text,
        (event: AssistantStreamEvent) => {
        if (event.type === "token") {
          updateMessage(assistantMsgId, (prev) => ({
            ...prev,
            content: (prev?.content || "") + event.text,
            streaming: true,
          }));
        } else if (event.type === "clarify") {
          updateMessage(assistantMsgId, {
            content: event.reply,
            streaming: false,
            clarifyOptions: event.options,
            awaitingChoice: true,
          });
        } else if (event.type === "match") {
          // Store all matched candidates and let the CUSTOMER choose who to book.
          // This avoids the "wrong specialist" race where a blind broadcast is
          // grabbed by whoever accepts first.
          prevIntentRef.current = event.intent;
          prevNoteRef.current = text;
          const candidates = (event.workers || []).map(mapWorkerToSpecialist);
          updateMessage(assistantMsgId, {
            content: event.reply,
            streaming: false,
            intent: event.intent,
            candidates,
            awaitingChoice: true,
          });
        } else if (event.type === "no_workers") {
          updateMessage(assistantMsgId, {
            content: event.reply,
            streaming: false,
            intent: event.intent,
          });
        } else if (event.type === "error") {
          updateMessage(assistantMsgId, {
            content: event.reply,
            streaming: false,
          });
        } else if (event.type === "agent") {
          // A multi-agent agent has taken over this turn; show its working label.
          updateMessage(assistantMsgId, (prev) => ({
            ...prev,
            agentLabel: event.label,
            agentJob: event.job,
            agentTrace: [
              ...(prev?.agentTrace || []),
              { kind: "agent", text: event.label, label: event.job },
            ],
          }));
        } else if (event.type === "thought") {
          updateMessage(assistantMsgId, (prev) => ({
            ...prev,
            agentTrace: [
              ...(prev?.agentTrace || []),
              { kind: "thought", text: event.text },
            ],
          }));
        } else if (event.type === "tool") {
          updateMessage(assistantMsgId, (prev) => ({
            ...prev,
            agentTrace: [
              ...(prev?.agentTrace || []),
              { kind: "tool", text: event.summary, label: event.name },
            ],
          }));
        } else if (event.type === "done") {
          // Stream finished without a structured terminal event (match/clarify/…):
          // stop the blinking typing cursor.
          updateMessage(assistantMsgId, { streaming: false });
        }
      },
      undefined,
      history
      );
    } catch (err) {
      updateMessage(assistantMsgId, {
        content: err instanceof Error ? err.message : "Something went wrong. Please try again.",
        streaming: false,
      });
    } finally {
      setIsSearching(false);
      isSubmittingRef.current = false;
    }
  }

  function handleClearChat() {
    saveMessages([]);
    setAcceptedMsgIds(new Set());
    setStatusByBooking(new Map());
  }

  function handleStop() {
    setIsSearching(false);
    isSubmittingRef.current = false;
  }

  if (!hydrated) return null;

  const selectedLocationAddress = serviceLocation?.address || user?.location || "";
  const isLocationReady = Boolean(selectedLocationAddress.trim());
  const isChatDisabled = isComplete === false || !isLocationReady;
  const inputPlaceholder =
    isComplete === false
      ? "Complete your profile first..."
      : !isLocationReady
        ? "Choose a service location first..."
        : "Describe the service you need (e.g. My sink is leaking)...";

  // List of active specialists from active bookings to populate the sidebar list
  const activeChatsList = messages
    .filter(m => m.specialist && acceptedMsgIds.has(m.id))
    .map(m => m.specialist!)
    .filter((sp, idx, self) => self.findIndex(s => s.workerId === sp.workerId) === idx);

  return (
    <div className="flex h-full flex-col md:flex-row overflow-hidden bg-background text-on-surface">

      {/* Sidebar / Active Chats List Panel */}
      <section className="relative w-full md:w-80 shrink-0 border-b md:border-b-0 md:border-r border-outline-variant bg-surface-container-lowest flex flex-col h-full max-md:h-[42vh]"
        style={{ width: typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches ? sidebarWidth : undefined }}>
        <div className="p-5 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
          <div>
            <h3 className="font-semibold text-lg text-primary dark:text-white">Active Chats</h3>
            <p className="text-xs text-on-surface-variant">Manage your conversations</p>
          </div>
          {messages.length > 0 && (
            <button onClick={handleClearChat}
              className="text-xs text-red-500 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors font-medium">
              Clear
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {/* Default AI assistant chat item */}
          <div
            onClick={() => setActiveChatTarget("ai")}
            className={`flex items-center gap-3 p-3.5 rounded-2xl cursor-pointer transition-all ${
              activeChatTarget === "ai"
                ? "bg-primary/10 border-l-4 border-primary shadow-sm"
                : "hover:bg-surface-container-low"
            }`}
          >
            <div className="w-11 h-11 rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center text-xl shrink-0 font-bold">
              <span className="material-symbols-outlined">support_agent</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center">
                <p className="font-semibold text-sm text-on-surface truncate">AI Service Assistant</p>
                <span className="w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-surface-container-lowest"></span>
              </div>
              <p className="text-xs text-on-surface-variant truncate mt-0.5">Ask questions and find specialists</p>
            </div>
          </div>

          {/* Connected specialist chats */}
          {activeChatsList.map(sp => (
            <div
              key={sp.workerId}
              onClick={() => setActiveChatTarget(sp.workerId)}
              className={`flex items-center gap-3 p-3.5 rounded-2xl cursor-pointer transition-all ${
                activeChatTarget === sp.workerId
                  ? "bg-primary/10 border-l-4 border-primary shadow-sm"
                  : "hover:bg-surface-container-low"
              }`}
            >
              <div className="w-11 h-11 rounded-xl overflow-hidden bg-secondary-container shrink-0">
                <img
                  className="w-full h-full object-cover"
                  src={sp.avatar || getSpecialistAvatar(sp.name, sp.services?.[0]?.service_name)}
                  alt={sp.name}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <p className="font-semibold text-sm text-on-surface truncate">{sp.name}</p>
                  <span className="w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-surface-container-lowest"></span>
                </div>
                <p className="text-xs text-on-surface-variant truncate mt-0.5">Matched Specialist</p>
              </div>
            </div>
          ))}
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat list"
          onPointerDown={handleSidebarResizeStart}
          className="group absolute inset-y-0 -right-2 z-20 hidden w-4 cursor-col-resize touch-none items-center justify-center md:flex"
        >
          <span className="material-symbols-outlined rotate-90 rounded-full bg-surface-container px-0.5 text-[18px] text-outline-variant shadow-sm transition-colors group-hover:text-primary">drag_handle</span>
        </div>
      </section>

      {/* Main Chat Interface */}
      <section className="flex-1 min-h-0 flex flex-col h-full bg-background relative">
        {/* Top AppBar */}
        <header className="h-16 border-b border-outline-variant flex items-center justify-between px-6 bg-surface-container-low backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary">chat</span>
            <div>
              <h2 className="font-bold text-on-surface">
                {activeChatTarget === "ai" ? "AI Service Assistant" : activeChatsList.find(c => c.workerId === activeChatTarget)?.name || "Specialist"}
              </h2>
              <p className="text-[10px] text-green-600 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block"></span> Active Session
              </p>
            </div>
          </div>
          {/* Service PIN info */}
          <div className="hidden sm:flex items-center gap-2 bg-surface-container px-4 py-1.5 rounded-full border border-outline-variant text-xs shadow-sm">
            <span className="text-primary font-bold">PIN:</span>
            <span className="text-on-surface-variant truncate max-w-44">
              {selectedLocationAddress || "Choose Location"}
            </span>
            <button
              onClick={() => window.dispatchEvent(new Event("shuroqx-open-location-permission"))}
              className="text-primary hover:underline font-bold ml-1"
            >
              Change
            </button>
          </div>
        </header>

        {/* Profile incomplete warning banner */}
        {isComplete === false && (
          <div className="mx-6 mt-4 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5 shadow-sm">
            <span className="material-symbols-outlined text-lg text-amber-400">warning</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">Profile configuration required</p>
              <p className="text-xs text-amber-700 mt-0.5">Add your missing details ({missingFields.join(" and ")}) to authorize booking requests.</p>
            </div>
            <button onClick={() => router.push("/dashboard/profile")}
              className="px-4.5 py-2 bg-amber-500 text-white rounded-xl text-xs font-semibold hover:bg-amber-600 transition-colors shadow-sm shadow-amber-100">
              Complete Profile
            </button>
          </div>
        )}

        {/* Messages list area */}
        <ChatContainerRoot className="chat-scrollbar">
          <ChatContainerContent className="p-4 md:p-6 space-y-4">
            {activeChatTarget === "ai" ? (
              <>
                {messages.length === 0 && <EmptyState onSuggestionClick={s => setInput(s)} />}

                {messages.map(msg => (
                  <div key={msg.id}>
                    {msg.role === "user"
                      ? <UserBubble message={msg} user={user} />
                      : <BotBubble
                          message={msg}
                          isAccepted={acceptedMsgIds.has(msg.id)}
                          liveStatus={msg.bookingId ? statusByBooking.get(msg.bookingId) : undefined}
                          onSpecialistClick={sp => setDetailSpecialist(sp)}
                          onViewJob={handleViewJob}
                          onChooseOption={(opt) => handleSend(opt)}
                          onChooseSpecialist={(workerId) => handleChooseSpecialist(workerId, msg.id)}
                        />
                    }
                  </div>
                ))}
              </>
            ) : (
              <SpecialistDirectChat />
            )}
            <ChatContainerScrollAnchor />
          </ChatContainerContent>
          <ScrollButton />
        </ChatContainerRoot>

        {/* Input Bar */}
        <div className="p-4">
          <div className="mx-auto max-w-3xl">
            <ChatPromptInput
              value={input}
              onChange={setInput}
              onSend={handleSend}
              onStop={handleStop}
              isLoading={isSearching}
              disabled={isChatDisabled}
              placeholder={inputPlaceholder}
            />
          </div>
        </div>
      </section>

      {/* Specialist details modal */}
      {detailSpecialist && (
        <SpecialistDetailsModal specialist={detailSpecialist} onClose={() => setDetailSpecialist(null)} />
      )}

      {/* Job detail modal (from chat thread) */}
      {jobBooking && (
        <BookingDetailModal booking={jobBooking} onClose={() => setJobBooking(null)} />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyState({ onSuggestionClick }: { onSuggestionClick: (s: string) => void }) {
  const suggestions = [
    { label: "Fix a leaking sink", prompt: "I need a plumber near me", icon: "plumbing" },
    { label: "Repair my AC", prompt: "Fix my AC unit today", icon: "ac_unit" },
    { label: "Check electrical wiring", prompt: "Electrical wiring help", icon: "bolt" },
    { label: "Build or repair furniture", prompt: "Need a carpenter", icon: "construction" },
  ];
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-12 text-center max-w-md mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-primary/15 text-primary flex items-center justify-center text-3xl font-bold">
        <span className="material-symbols-outlined text-3xl">support_agent</span>
      </div>
      <div>
        <h3 className="font-semibold text-lg text-on-surface dark:text-white">ShuroqX AI Assistant</h3>
        <p className="text-sm text-on-surface-variant dark:text-on-surface mt-1">Describe what service you need, and I&apos;ll match you with a vetted specialist instantly.</p>
      </div>
      <div className="flex flex-wrap gap-2 justify-center mt-3">
        {suggestions.map(({ label, prompt, icon }) => (
          <button key={prompt} onClick={() => onSuggestionClick(prompt)}
            className="flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-low px-3.5 py-2 text-xs font-semibold text-primary dark:text-white transition-all hover:bg-surface-container active:scale-95">
            <span className="material-symbols-outlined text-[17px]">{icon}</span>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function UserBubble({ message, user }: { message: ChatMessage; user: User | null }) {
  const initial = user?.name?.[0] || user?.email?.[0]?.toUpperCase() || "U";
  return (
    <Message className="justify-end">
      <div className="max-w-xl rounded-2xl rounded-tr-sm bg-primary px-4.5 py-3 text-on-primary shadow-md shadow-primary/5">
        <p className="text-sm leading-relaxed">{message.content}</p>
        <span className="mt-1 block text-right text-[10px] text-white/70">
          {message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
        </span>
      </div>
      <MessageAvatar fallback={initial} className="border border-primary/20 bg-primary/15 text-primary" />
    </Message>
  );
}

function BotBubble({ message, isAccepted, liveStatus, onSpecialistClick, onViewJob, onChooseOption, onChooseSpecialist }: {
  message: ChatMessage;
  isAccepted?: boolean;
  liveStatus?: string;
  onSpecialistClick: (sp: SpecialistResult) => void;
  onViewJob: (bookingId: string) => void;
  onChooseOption: (option: string) => void;
  onChooseSpecialist: (workerId: string) => void;
}) {
  const showText = Boolean(message.content) || message.streaming;
  const candidates = message.candidates || [];
  return (
    <Message>
      <MessageAvatar fallback="SX" />
      <MessageContent className="max-w-xl space-y-2">

        {message.specialist && isAccepted && (
          <SpecialistCard
            specialist={message.specialist}
            liveStatus={liveStatus}
            bookingId={message.bookingId}
            onNameClick={onSpecialistClick}
            onViewJob={onViewJob}
          />
        )}
        {message.specialist && !isAccepted && <WaitingCard />}
        {showText && (
          <div className="rounded-2xl rounded-tl-sm bg-surface-container-lowest px-4.5 py-3 shadow-sm border border-outline-variant">
            {message.streaming && !message.content ? (
              <Loader variant="text-shimmer" text="Thinking" size="sm" />
            ) : (
              <p className="text-sm leading-relaxed text-on-surface whitespace-pre-wrap">{message.content}</p>
            )}
          </div>
        )}
        {message.awaitingChoice && message.clarifyOptions && message.clarifyOptions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {message.clarifyOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => onChooseOption(opt)}
                className="rounded-full border border-primary/40 bg-primary/5 px-4 py-2 text-xs font-semibold text-primary transition-all hover:bg-primary hover:text-on-primary active:scale-95"
              >
                {opt}
              </button>
            ))}
          </div>
        )}
        {candidates.length > 0 && (
          <div className="pt-1">
            <p className="text-xs font-semibold text-on-surface-variant mb-2">
              Pick a specialist to book:
            </p>
            <div className="flex flex-col gap-2">
              {candidates.map((sp) => {
                const selected = message.selectedWorkerId === sp.workerId;
                return (
                  <button
                    key={sp.workerId}
                    disabled={Boolean(message.bookingPending)}
                    onClick={() => onChooseSpecialist(sp.workerId)}
                    className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all active:scale-95 disabled:opacity-60 ${
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-xl overflow-hidden bg-gradient-to-br from-secondary-container to-secondary flex-shrink-0">
                      <img
                        className="w-full h-full object-cover"
                        src={sp.avatar || getSpecialistAvatar(sp.name, sp.services?.[0]?.service_name)}
                        alt={sp.name}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-on-surface truncate">{sp.name}</p>
                      <div className="mt-0.5"><SkillBadges services={sp.services} /></div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-on-surface-variant">
                        {sp.price != null && (
                          <span className="font-semibold text-primary">₹{sp.price} onwards</span>
                        )}
                        {sp.experienceYears != null && (
                          <span>{sp.experienceYears} yrs exp</span>
                        )}
                      </p>
                    </div>
                    {selected && message.bookingPending && (
                      liveStatus === "accepted" ? (
                        <span className="text-[10px] font-bold text-primary">Booked ✓</span>
                      ) : (
                        <span className="text-[10px] font-bold text-on-surface-variant">Requested</span>
                      )
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </MessageContent>
    </Message>
  );
}

function WaitingCard() {
  return (
    <div className="bg-surface-container-lowest rounded-2xl rounded-tl-sm p-5 shadow-sm border border-outline-variant max-w-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-lg animate-bounce text-primary">search</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-on-surface">Finding specialists...</p>
          <p className="text-xs text-on-surface-variant mt-0.5">Booking request broadcasted nearby</p>
        </div>
      </div>
      <div className="flex gap-1.5 mb-3.5">
        {[0,1,2,3,4].map(i => (
          <div key={i} className="h-1 flex-1 rounded-full bg-surface-container overflow-hidden">
            <div className="h-full bg-primary rounded-full animate-pulse" style={{ animationDelay: `${i*180}ms` }} />
          </div>
        ))}
      </div>
      <p className="text-[11px] text-on-surface-variant text-center bg-surface-container-low py-1.5 rounded-lg">
        Waiting for worker acceptance
      </p>
    </div>
  );
}

const STATUS_LIVE_LABEL: Record<string, { icon: string; text: string; color: string }> = {
  accepted: { icon: "check_circle", text: "Specialist accepted booking", color: "text-green-700 bg-green-50 border-green-200" },
  started:  { icon: "directions_car", text: "Specialist is on the way", color: "text-blue-700 bg-blue-50 border-blue-200" },
  reached:  { icon: "location_on", text: "Specialist has arrived", color: "text-primary bg-primary/5 border-primary/20" },
  ongoing:  { icon: "handyman", text: "Work in progress", color: "text-amber-700 bg-amber-50 border-amber-200" },
  completed:{ icon: "celebration", text: "Service completed successfully!", color: "text-green-700 bg-green-50 border-green-200" },
};

function SpecialistCard({ specialist, liveStatus, onNameClick, bookingId, onViewJob }: {
  specialist: SpecialistResult;
  liveStatus?: string;
  onNameClick: (sp: SpecialistResult) => void;
  bookingId?: string;
  onViewJob: (bookingId: string) => void;
}) {
  const liveInfo = liveStatus ? STATUS_LIVE_LABEL[liveStatus] : null;

  return (
    <div className="bg-surface-container-lowest rounded-2xl rounded-tl-sm p-4.5 shadow-md border border-outline-variant max-w-sm">
      {/* Clickable specialist header */}
      <button onClick={() => onNameClick(specialist)} className="flex items-center gap-3.5 mb-4 w-full text-left hover:opacity-80 transition-opacity cursor-pointer">
        <div className="w-12 h-12 rounded-xl overflow-hidden bg-gradient-to-br from-secondary-container to-secondary flex-shrink-0">
          <img
            className="w-full h-full object-cover"
            src={specialist.avatar || getSpecialistAvatar(specialist.name, specialist.services?.[0]?.service_name)}
            alt={specialist.name}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-on-surface truncate">{specialist.name}</p>
            <span className="material-symbols-outlined text-sm text-outline-variant">open_in_new</span>
          </div>
          <div className="mt-0.5"><SkillBadges services={specialist.services} /></div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {specialist.isVerified && (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-100">
                ✓ Vetted Expert
              </span>
            )}
          </div>
        </div>
      </button>

      {specialist.phone && (
        <p className="text-xs text-on-surface-variant mb-3.5 flex items-center gap-1.5 px-1">
          <span className="material-symbols-outlined text-sm text-outline">call</span> {specialist.phone}
        </p>
      )}

      {/* Live status strip */}
      {liveInfo && (
        <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 mb-4 border text-xs font-semibold ${liveInfo.color}`}>
          <span className="material-symbols-outlined text-base">{liveInfo.icon}</span>
          <span>{liveInfo.text}</span>
        </div>
      )}

      {!liveInfo && (
        <p className="text-xs text-amber-700 bg-amber-50/50 border border-amber-100 rounded-xl px-3 py-2.5 mb-4 font-semibold">
          Pending confirmation from specialist
        </p>
      )}

      <div className="flex gap-2">
        {bookingId && (
          <button
            onClick={() => onViewJob(bookingId)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-surface-container-low text-on-surface rounded-xl text-xs font-semibold border border-outline-variant hover:bg-surface-container transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-xs">description</span> View Job Details
          </button>
        )}
        <button className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-primary text-white rounded-xl text-xs font-semibold hover:bg-primary-container transition-all cursor-pointer">
          <span className="material-symbols-outlined text-xs">explore</span> Track Live
        </button>
        {specialist.phone && (
          <a href={`tel:${specialist.phone}`}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-secondary text-white rounded-xl text-xs font-semibold hover:bg-opacity-95 transition-all">
            <span className="material-symbols-outlined text-xs">call</span> Call
          </a>
        )}
      </div>
    </div>
  );
}

function SpecialistDirectChat() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center max-w-sm mx-auto">
      <div className="w-16 h-16 rounded-full bg-secondary/10 text-secondary flex items-center justify-center text-2xl font-bold">
        Chat
      </div>
      <div>
        <h4 className="font-semibold text-on-surface">Select a Conversation</h4>
        <p className="text-xs text-on-surface-variant mt-1.5">Choose a specialist from your list to view the chat history and manage your service requests.</p>
      </div>
      <Link
        href="/dashboard/client"
        className="px-5 py-2.5 bg-primary text-on-primary rounded-xl text-xs font-semibold hover:bg-primary-container hover:text-on-primary-container transition-all shadow-sm"
      >
        View All Contacts
      </Link>
      <div className="w-full bg-surface-container-low p-4 rounded-2xl text-xs text-on-surface-variant border border-outline-variant mt-2">
        Live chat messages with specialists are archived for safety.
      </div>
    </div>
  );
}

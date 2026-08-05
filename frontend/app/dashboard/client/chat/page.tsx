"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { bookingApi, streamAssistantChat } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { WS_BASE_URL } from "@/lib/config";
import { useAppSelector } from "@/store";
import { SkillBadges } from "@/components/ui/SkillBadges";
import { useToast } from "@/components/ui/Toast";
// import BlurText from "@/components/ui/BlurText";
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
import { getSpecialistAvatar } from "@/lib/avatar";
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

function getChatStorageKey(userId?: string | null): string {
  return userId ? `${CHAT_STORAGE_KEY}:${userId}` : CHAT_STORAGE_KEY;
}
const BOOKING_VISIBLE_STATUSES = new Set(["accepted", "started", "reached", "ongoing", "completed"]);
const BOOKING_CLOSED_STATUSES = new Set(["rejected", "completed", "cancelled"]);

export default function RedesignedClientChat() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAppSelector((s) => s.auth);
  const { isComplete, missingFields } = useProfileGuard();
  const { showToast } = useToast();

  // ── Chat persistence via localStorage ────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [serviceLocation, setServiceLocation] = useState<ServiceLocation | null>(null);
  const [serviceAddressDetails, setServiceAddressDetails] = useState<ServiceAddressDetails | null>(null);

  // Load persisted chat on mount / user change
  useEffect(() => {
    try {
      const newKey = getChatStorageKey(user?.id);
      const oldKey = CHAT_STORAGE_KEY;
      
      // Migrate from old global key to user-specific key if needed
      if (user?.id) {
        const newRaw = localStorage.getItem(newKey);
        const oldRaw = localStorage.getItem(oldKey);
        
        if (!newRaw && oldRaw) {
          // First login for this user: migrate old global chat history
          localStorage.setItem(newKey, oldRaw);
          setMessages(JSON.parse(oldRaw));
        } else if (newRaw) {
          setMessages(JSON.parse(newRaw));
        } else {
          setMessages([]);
        }
      } else {
        // No user logged in - use global key for anonymous
        const raw = localStorage.getItem(oldKey);
        if (raw) setMessages(JSON.parse(raw));
        else setMessages([]);
      }
      
      const rawLocation = localStorage.getItem(SERVICE_LOCATION_KEY);
      if (rawLocation) setServiceLocation(JSON.parse(rawLocation));
      const rawAddressDetails = localStorage.getItem(SERVICE_ADDRESS_DETAILS_KEY);
      if (rawAddressDetails) setServiceAddressDetails(JSON.parse(rawAddressDetails));
    } catch {}
    setHydrated(true);
  }, [user?.id]);

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
    try { localStorage.setItem(getChatStorageKey(user?.id), JSON.stringify(msgs)); } catch {}
  }, [user?.id]);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => {
      const next = [...prev, msg];
      try { localStorage.setItem(getChatStorageKey(user?.id), JSON.stringify(next)); } catch {}
      return next;
    });
  }, [user?.id]);

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
        try { localStorage.setItem(getChatStorageKey(user?.id), JSON.stringify(next)); } catch {}
        return next;
      });
    },
    [user?.id],
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
        receiver_name: details?.receiverName || user?.name || bookingLocation || "Customer",
        contact_number: details?.contactNumber || user?.phone || "9889898989",
        house_flat: details?.houseFlat || "N/A",
        block_area: details?.blockArea || "N/A",
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

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-on-surface">
      {/* Top AppBar */}
      <header className="h-16 border-b border-outline-variant flex items-center justify-between px-4 sm:px-6 bg-surface-container-low backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary">chat</span>
          <div>
            <h2 className="font-bold text-on-surface">AI Service Assistant</h2>
            <p className="text-[10px] text-green-600 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block"></span> Active Session
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
          {messages.length > 0 && (
            <button onClick={handleClearChat}
              className="text-xs text-red-500 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors font-medium">
              Clear
            </button>
          )}
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
          {messages.length === 0 && <EmptyState onSuggestionClick={s => setInput(s)} />}

          {messages.map(msg => (
            <div key={msg.id}>
              {msg.role === "user"
                ? <UserBubble message={msg} user={user} />
                :                       <BotBubble
                    message={msg}
                    isAccepted={acceptedMsgIds.has(msg.id)}
                    liveStatus={msg.bookingId ? statusByBooking.get(msg.bookingId) : undefined}
                    onSpecialistClick={sp => setDetailSpecialist(sp)}
                    onViewJob={handleViewJob}
                    onChooseSpecialist={(workerId) => handleChooseSpecialist(workerId, msg.id)}
                  />
              }
            </div>
          ))}
          <ChatContainerScrollAnchor />
        </ChatContainerContent>
        <ScrollButton />
      </ChatContainerRoot>

      {/* AI Input Bar */}
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

function BotBubble({ message, isAccepted, liveStatus, onSpecialistClick, onViewJob, onChooseSpecialist }: {
  message: ChatMessage;
  isAccepted?: boolean;
  liveStatus?: string;
  onSpecialistClick: (sp: SpecialistResult) => void;
  onViewJob: (bookingId: string) => void;
  onChooseSpecialist: (workerId: string) => void;
}) {
  const showText = Boolean(message.content) || message.streaming;
  const candidates = message.candidates || [];
  return (
    <Message>
      <MessageAvatar fallback="SX" />
      <MessageContent className="max-w-xl space-y-3">

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
          <div className="py-1">
            {message.streaming && !message.content ? (
              <Loader variant="text-shimmer" text="Thinking" size="sm" />
            ) : (
              <p className="text-sm leading-relaxed text-on-surface whitespace-pre-wrap">{message.content}</p>
            )}
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

"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store";
import { fetchSpecialistProfile } from "@/store/slices/authSlice";
import { messageApi, type ChatMessageDTO, type ConversationDTO } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { WS_BASE_URL } from "@/lib/config";
import { useToast } from "@/components/ui/Toast";
import { VerificationPendingCard } from "@/components/ui/VerificationPendingCard";

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function initials(name: string): string {
  return (name || "C").trim().charAt(0).toUpperCase() || "C";
}

export default function SpecialistCommunicationHub() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const searchParams = useSearchParams();
  const queryClientName = searchParams.get("clientName");
  const queryBookingId = searchParams.get("bookingId");
  const { user, activeMode, specialistProfile } = useAppSelector((s) => s.auth);
  const currentProfile = specialistProfile?.userId === user?.id ? specialistProfile : null;
  const [profileChecked, setProfileChecked] = useState(false);
  const { toast, showToast, dismiss } = useToast();

  const [conversations, setConversations] = useState<ConversationDTO[]>([]);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sending, setSending] = useState(false);

  // A specialist must finish onboarding before accessing messages.
  useEffect(() => {
    if (!user?.id) return;
    dispatch(fetchSpecialistProfile(user.id)).finally(() => setProfileChecked(true));
  }, [user?.id, dispatch]);

  useEffect(() => {
    if (profileChecked && activeMode === "specialist" && !currentProfile) {
      router.replace("/dashboard/specialist/onboarding");
    }
  }, [profileChecked, currentProfile, activeMode, router]);

  const workerId = currentProfile?.id;

  // ── Load conversations from backend ──
  const loadConversations = useCallback(async () => {
    if (!workerId) return;
    try {
      const data = await messageApi.conversations();
      setConversations(data);
      setSelectedBookingId((prev) => prev ?? data[0]?.bookingId ?? null);
    } catch (err) {
      console.error("Failed to load conversations:", err);
    }
  }, [workerId]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // ── Query Param Selection ──
  useEffect(() => {
    if (conversations.length === 0) return;
    // Prefer a stable bookingId; fall back to name match for legacy links.
    if (queryBookingId) {
      const byId = conversations.find((c) => c.bookingId === queryBookingId);
      if (byId) {
        setSelectedBookingId(byId.bookingId);
        return;
      }
    }
    if (queryClientName) {
      const match = conversations.find(
        (c) => c.otherName.toLowerCase() === queryClientName.toLowerCase()
      );
      if (match) setSelectedBookingId(match.bookingId);
    }
  }, [queryClientName, queryBookingId, conversations]);

  // ── Load messages for the selected booking ──
  useEffect(() => {
    if (!selectedBookingId) return;
    setLoadingMsgs(true);
    messageApi
      .listByBooking(selectedBookingId)
      .then(setMessages)
      .catch((err) => {
        console.error("Failed to load messages:", err);
        setMessages([]);
      })
      .finally(() => setLoadingMsgs(false));
  }, [selectedBookingId]);

  // ── Live message channel for the selected booking ──
  // Receive the client's replies instantly instead of waiting for the next
  // conversation poll. Opening the thread also marks messages read server-side.
  useEffect(() => {
    if (!selectedBookingId) return;
    const token = getToken();
    if (!token) return;
    const params = new URLSearchParams({ token });
    const ws = new WebSocket(`${WS_BASE_URL}/messages/ws/${encodeURIComponent(selectedBookingId)}?${params.toString()}`);
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as ChatMessageDTO;
        setMessages((prev) =>
          prev.some((m) => m.id === data.id) ? prev : [...prev, data],
        );
      } catch {}
    };
    return () => ws.close();
  }, [selectedBookingId]);

  const activeClient = useMemo(
    () => conversations.find((c) => c.bookingId === selectedBookingId) || conversations[0],
    [conversations, selectedBookingId]
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  if (profileChecked && activeMode === "specialist" && !currentProfile) {
    return null;
  }

  // ── Send Message (persisted to backend) ──
  async function handleSendMessage() {
    const text = inputText.trim();
    if (!text || !activeClient || sending) return;

    const bookingId = activeClient.bookingId;
    const recipientId = activeClient.otherId;

    setSending(true);
    // Optimistic append
    const optimistic: ChatMessageDTO = {
      id: `temp-${Date.now()}`,
      bookingId,
      senderType: "worker",
      senderId: workerId || "",
      recipientType: "client",
      recipientId,
      text,
      read: false,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInputText("");

    try {
      const saved = await messageApi.send(bookingId, text, "client", recipientId);
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? saved : m)));
      // Refresh conversation list (last message / order)
      void loadConversations();
    } catch (err) {
      console.error("Failed to send message:", err);
      showToast("Could not send message. Please retry.", "error");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  }

  const timeLabel = (iso: string) => {
    if (!iso) return "Recently";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "Recently" : formatTime(iso);
  };

  return (
    <>
      {currentProfile?.verificationStatus === "pending" ? (
        <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
          <VerificationPendingCard centered />
        </div>
      ) : (
        <div className="flex h-[calc(100vh-4rem)] flex-col md:flex-row border-b border-outline-variant font-sans text-on-surface">
          {/* Column 1: Active Chats List */}
          <aside className="w-full md:w-80 shrink-0 border-b md:border-b-0 md:border-r border-outline-variant/60 flex flex-col bg-surface-container-lowest max-md:h-[42vh]">
            <div className="p-4 border-b border-outline-variant/60 flex items-center justify-between">
              <h3 className="text-base font-bold text-on-surface">Active Chats</h3>
              <button
                onClick={() => void loadConversations()}
                className="text-primary hover:bg-primary/5 p-1.5 rounded-xl cursor-pointer"
                aria-label="Refresh chats"
              >
                <span className="material-symbols-outlined text-sm">refresh</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-outline-variant/30">
              {conversations.length === 0 ? (
                <p className="p-4 text-sm text-on-surface-variant">
                  No conversations yet. Accepted jobs will appear here.
                </p>
              ) : (
                conversations.map((c) => {
                  const isSelected = c.bookingId === selectedBookingId;
                  return (
                    <div
                      key={c.bookingId}
                      onClick={() => setSelectedBookingId(c.bookingId)}
                      className={`p-4 flex items-start gap-3 cursor-pointer transition-colors ${
                        isSelected ? "bg-primary/5 border-l-4 border-primary" : "hover:bg-gray-50"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center shrink-0">
                        {initials(c.otherName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between items-baseline">
                          <h4 className="font-bold text-sm text-on-surface truncate">{c.otherName}</h4>
                          <span className="text-[10px] text-gray-400 font-semibold">{timeLabel(c.lastMessageAt)}</span>
                        </div>
                        <p className="text-xs text-on-surface-variant truncate mt-1">{c.lastMessage}</p>
                        {c.unread > 0 && (
                          <span className="mt-1 inline-block text-[10px] font-bold text-white bg-primary rounded-full px-1.5">
                            {c.unread} new
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* Column 2: Main Message Board */}
          <section className="flex-1 min-h-0 flex flex-col bg-surface-bright relative">
            {!activeClient ? (
              <div className="flex-1 flex items-center justify-center text-on-surface-variant text-sm">
                Select a conversation to start messaging.
              </div>
            ) : (
              <>
                {/* Chat window header */}
                <header className="p-4 border-b border-outline-variant/60 bg-surface-container-lowest flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center">
                      {initials(activeClient.otherName)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm text-on-surface">{activeClient.otherName}</h4>
                        {activeClient.bookingNumber && (
                          <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded uppercase">
                            {activeClient.bookingNumber}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-1 text-[10px] text-on-surface-variant">
                        <span className="flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-xs">home_repair_service</span>
                          {activeClient.serviceType || "Service"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => showToast("Starting Video Dispatch Flow...", "success")}
                      className="p-2 hover:bg-surface-container text-on-surface-variant rounded-xl cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">video_call</span>
                    </button>
                    <button
                      onClick={() => showToast("Settings config is in progress.", "info")}
                      className="p-2 hover:bg-surface-container text-on-surface-variant rounded-xl cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">settings</span>
                    </button>
                  </div>
                </header>

                {/* Message Feed */}
                <div className="flex-1 p-6 overflow-y-auto space-y-4">
                  {loadingMsgs ? (
                    <div className="flex justify-center py-10">
                      <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center text-sm text-on-surface-variant py-10">
                      No messages yet. Say hello to {activeClient.otherName}!
                    </div>
                  ) : (
                    messages.map((msg) => {
                      // A message is "mine" if it was NOT sent by the person I'm
                      // chatting with. Comparing against the known client id is
                      // robust against local/sender id mismatches.
                      const isMe = msg.senderId !== activeClient?.otherId;
                      return (
                        <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[70%] flex flex-col gap-1 ${isMe ? "items-end" : "items-start"}`}>
                            <div
                              className={`px-4 py-3 rounded-2xl text-xs font-semibold leading-relaxed ${
                                isMe
                                  ? "bg-primary text-white rounded-tr-none"
                                  : "bg-surface-container-lowest text-on-surface border border-outline-variant/60 rounded-tl-none"
                              }`}
                            >
                              {msg.text}
                            </div>
                            <span className="text-[9px] text-gray-400 px-1">{formatTime(msg.createdAt)}</span>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-2xl rounded-tl-none px-4 py-3 text-xs italic text-on-surface-variant flex items-center gap-2 shadow-sm animate-pulse">
                        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" />
                        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce delay-100" />
                        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce delay-200" />
                        <span>{activeClient.otherName} is typing...</span>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Input box */}
                <footer className="p-4 bg-surface-container-lowest border-t border-outline-variant/60 flex items-center gap-3">
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => showToast("Attaching photos or files... 📎", "info")}
                      className="p-2 text-on-surface-variant hover:bg-surface-container rounded-xl cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">attach_file</span>
                    </button>
                    <button
                      onClick={() => showToast("Opening Emoji picker... 😊", "info")}
                      className="p-2 text-on-surface-variant hover:bg-surface-container rounded-xl cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">mood</span>
                    </button>
                  </div>

                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your message here..."
                    className="flex-1 bg-surface-container border border-outline-variant/50 focus:border-primary focus:ring-0 rounded-xl px-4 py-2.5 text-xs font-semibold placeholder:text-outline-variant resize-none h-11 py-3 focus:outline-none"
                  />

                  <button
                    onClick={() => void handleSendMessage()}
                    disabled={!inputText.trim() || sending}
                    className="w-11 h-11 shrink-0 bg-primary text-white rounded-xl flex items-center justify-center hover:bg-primary/90 transition-all active:scale-95 shadow-md shadow-primary/15 disabled:opacity-50 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">send</span>
                  </button>
                </footer>
              </>
            )}
          </section>

          {/* Column 3: Client / Job Description Right Side-Panel */}
          <aside className="hidden xl:flex w-72 border-l border-outline-variant/60 bg-surface-container-lowest flex-col p-6 space-y-6 overflow-y-auto">
            {activeClient ? (
              <>
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 rounded-full bg-primary/15 text-primary font-bold text-2xl flex items-center justify-center mx-auto shadow-sm">
                    {initials(activeClient.otherName)}
                  </div>
                  <div>
                    <h4 className="font-bold text-lg text-on-surface">{activeClient.otherName}</h4>
                    <p className="text-xs text-on-surface-variant flex items-center justify-center gap-0.5">
                      <span className="material-symbols-outlined text-sm text-outline">location_on</span>
                      Client
                    </p>
                  </div>
                </div>

                <hr className="border-outline-variant/50" />

                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Job Details</h4>
                  <div className="space-y-3 bg-surface-container/50 border border-outline-variant/30 p-4 rounded-2xl text-xs space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400 font-semibold">Service Type</span>
                      <span className="font-bold text-on-surface">{activeClient.serviceType || "Service"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 font-semibold">Booking</span>
                      <span className="font-bold text-on-surface">{activeClient.bookingNumber || "—"}</span>
                    </div>
                  </div>
                </div>

                <hr className="border-outline-variant/50" />

                <div className="space-y-3 pt-1">
                  <button
                    onClick={() => showToast("Initiating secure video call session...", "success")}
                    className="w-full py-3 px-4 bg-surface-container-lowest border border-outline-variant hover:border-primary hover:bg-primary/5 rounded-xl text-xs font-bold text-on-surface transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    <span className="material-symbols-outlined text-base">video_call</span>
                    Start Video Call
                  </button>
                  <button
                    onClick={() => showToast("Requesting job reschedule details...", "info")}
                    className="w-full py-3 px-4 bg-surface-container-lowest border border-outline-variant hover:border-primary hover:bg-primary/5 rounded-xl text-xs font-bold text-on-surface transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    <span className="material-symbols-outlined text-base">schedule</span>
                    Reschedule Job
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-on-surface-variant">Select a conversation to view details.</p>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

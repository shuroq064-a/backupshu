"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store";
import { fetchSpecialistProfile } from "@/store/slices/authSlice";
import { messageApi, type ChatMessageDTO, type ConversationDTO } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { WS_BASE_URL } from "@/lib/config";
import { useToast } from "@/components/ui/Toast";
import { VerificationPendingCard } from "@/components/ui/VerificationPendingCard";
import {
  ChatContainerRoot,
  ChatContainerContent,
  ChatContainerScrollAnchor,
} from "@/components/prompt-kit/chat-container";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/prompt-kit/message";
import { ChatPromptInput } from "@/components/chat-prompt-input";

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
        // Dedup by id so an optimistic send + WS echo doesn't double up.
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === data.id);
          if (exists) return prev.map((m) => (m.id === data.id ? data : m));
          const tempIdx = prev.findIndex(
            (m) => m.id.startsWith("temp-") && m.text === data.text && m.senderType === data.senderType,
          );
          if (tempIdx >= 0) {
            const next = prev.slice();
            next[tempIdx] = data;
            return next;
          }
          return [...prev, data];
        });
      } catch {}
    };
    return () => ws.close();
  }, [selectedBookingId]);

  const activeClient = useMemo(
    () => conversations.find((c) => c.bookingId === selectedBookingId) || conversations[0],
    [conversations, selectedBookingId]
  );

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
                {/* Message Feed — same bubbles as the AI chat */}
                <ChatContainerRoot className="chat-scrollbar">
                  <ChatContainerContent className="p-4 md:p-6 space-y-4">
                    {loadingMsgs ? (
                      <div className="flex justify-center py-10">
                        <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-center text-sm text-on-surface-variant py-10">
                        No messages yet. Say hello to {activeClient.otherName}!
                      </div>
                    ) : (
                      messages.map((msg, idx) => {
                        // In the specialist hub, "mine" means the message was sent
                        // by the worker (the specialist). Use senderType so the
                        // specialist's own messages align right and the client's
                        // messages align left.
                        const isMe = msg.senderType === "worker";
                        if (isMe) {
                          return (
                            <Message key={`${msg.id}-${idx}`} className="justify-end">
                              <div className="max-w-xl rounded-2xl rounded-tr-sm bg-primary px-4.5 py-3 text-on-primary shadow-md shadow-primary/5">
                                <p className="text-sm leading-relaxed">{msg.text}</p>
                                <span className="mt-1 block text-right text-[10px] text-white/70">
                                  {formatTime(msg.createdAt)}
                                </span>
                              </div>
                              <MessageAvatar
                                fallback={initials(user?.name || "S")}
                                className="border border-primary/20 bg-primary/15 text-primary"
                              />
                            </Message>
                          );
                        }
                        return (
                          <Message key={`${msg.id}-${idx}`}>
                            <MessageAvatar
                              fallback={activeClient?.otherName?.[0] || "C"}
                            />
                            <MessageContent className="max-w-xl space-y-2">
                              <div className="rounded-2xl rounded-tl-sm bg-surface-container-lowest px-4.5 py-3 shadow-sm border border-outline-variant">
                                <p className="text-sm leading-relaxed text-on-surface whitespace-pre-wrap">{msg.text}</p>
                                <span className="mt-1 block text-right text-[10px] text-on-surface-variant">
                                  {formatTime(msg.createdAt)}
                                </span>
                              </div>
                            </MessageContent>
                          </Message>
                        );
                      })
                    )}

                    {isTyping && (
                      <div className="flex justify-start">
                        <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-2xl rounded-tl-none px-4 py-3 text-xs italic text-on-surface-variant flex items-center gap-2 shadow-sm animate-pulse">
                          <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" />
                          <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce delay-100" />
                          <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce delay-200" />
                          <span>{activeClient?.otherName} is typing...</span>
                        </div>
                      </div>
                    )}

                    <ChatContainerScrollAnchor />
                  </ChatContainerContent>
                </ChatContainerRoot>

                {/* Input box — same ChatPromptInput as the AI chat */}
                <div className="p-4">
                  <div className="mx-auto max-w-3xl">
                    <ChatPromptInput
                      value={inputText}
                      onChange={setInputText}
                      onSend={handleSendMessage}
                      isLoading={sending}
                      placeholder="Type your message here..."
                    />
                  </div>
                </div>
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

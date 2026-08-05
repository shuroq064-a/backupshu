"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { messageApi, type ChatMessageDTO, type ConversationDTO } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { WS_BASE_URL } from "@/lib/config";
import { getSpecialistAvatar } from "@/lib/avatar";
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
import type { User } from "@/types";

function fmtTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function SpecialistDirectChat({
  conversation,
  currentUser,
  onSent,
  onError,
}: {
  conversation: ConversationDTO;
  currentUser: User | null;
  onSent: () => void;
  onError: (message: string) => void;
}) {
  const [msgs, setMsgs] = useState<ChatMessageDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const bookingId = conversation.bookingId;

  // Merge server messages with local state by id so an in-flight optimistic
  // send is never clobbered by a poll landing mid-send (avoids duplicate/flicker).
  const mergeServer = useCallback((server: ChatMessageDTO[]) => {
    setMsgs((prev) => {
      const seen = new Set<string>();
      const deduped: ChatMessageDTO[] = [];
      for (const m of server) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          deduped.push(m);
        }
      }
      const pendingTemp = prev.filter(
        (m) => m.id.startsWith("temp-") && !server.some((s) => s.id === m.id),
      );
      return [...deduped, ...pendingTemp];
    });
  }, []);

  // Append a single server-pushed message (WebSocket) without duplicating one
  // we already have by id.
  const appendPush = useCallback((incoming: ChatMessageDTO) => {
    setMsgs((prev) =>
      prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming],
    );
  }, []);

  const load = useCallback(
    (initial = false) => {
      if (initial) setLoading(true);
      messageApi
        .listByBooking(bookingId)
        .then((server) => {
          // Don't overwrite while a send is resolving; the send handler will
          // reconcile and the next poll will pick up the saved copy.
          if (sendingRef.current) return;
          mergeServer(server);
        })
        .catch(() => {
          if (initial) setMsgs([]);
        })
        .finally(() => {
          if (initial) setLoading(false);
        });
    },
    [bookingId, mergeServer],
  );

  // Reload history when the selected conversation changes, then poll for
  // incoming replies while the tab is visible (polling is the fallback; the
  // WebSocket below delivers messages instantly).
  useEffect(() => {
    load(true);
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      load(false);
    }, 8000);
    return () => clearInterval(t);
  }, [load]);

  // Live message channel: receive new messages instantly instead of waiting
  // for the 8s poll. Opening the thread also marks messages as read server-side.
  useEffect(() => {
    const token = getToken();
    if (!token || !bookingId) return;
    const ws = new WebSocket(
      `${WS_BASE_URL}/messages/ws/${encodeURIComponent(bookingId)}?token=${encodeURIComponent(token)}`
    );
    let alive = true;
    ws.onopen = () => {};
    ws.onmessage = (e) => {
      if (!alive) return;
      try {
        const data = JSON.parse(e.data) as ChatMessageDTO;
        appendPush(data);
        void load(false);
      } catch {}
    };
    return () => {
      alive = false;
      ws.close();
    };
  }, [bookingId, appendPush, load]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    sendingRef.current = true;
    // Role is derived from the conversation, so this thread works for both the
    // client (callerRole "client") and the specialist (callerRole "worker").
    const role = conversation.callerRole === "worker" ? "worker" : "client";
    const otherRole = role === "client" ? "worker" : "client";
    const optimistic: ChatMessageDTO = {
      id: `temp-${Date.now()}`,
      bookingId,
      senderType: role,
      senderId: currentUser?.id || "",
      recipientType: otherRole,
      recipientId: conversation.otherId,
      text: body,
      read: false,
      createdAt: new Date().toISOString(),
    };
    setMsgs((prev) => [...prev, optimistic]);
    setText("");
    try {
      const saved = await messageApi.send(bookingId, body, otherRole, conversation.otherId);
      setMsgs((prev) => prev.map((m) => (m.id === optimistic.id ? saved : m)));
      onSent();
    } catch {
      onError("Could not send message. Please retry.");
      setMsgs((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  }

  const callerIsWorker = conversation.callerRole === "worker";
  const ownAvatar = getSpecialistAvatar(
    currentUser?.name || currentUser?.email?.split("@")[0] || "You",
  );
  // The "other" party is only a specialist when the caller is the client.
  const otherAvatarSrc = callerIsWorker
    ? undefined
    : getSpecialistAvatar(conversation.otherName, conversation.serviceType || undefined);

  return (
    <>
      <ChatContainerRoot className="chat-scrollbar">
        <ChatContainerContent className="p-4 md:p-6 space-y-4">
          {loading && msgs.length === 0 ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            </div>
          ) : msgs.length === 0 ? (
            <div className="text-center text-sm text-on-surface-variant py-10">
              No messages yet. Say hello to {conversation.otherName}!
            </div>
          ) : (
            msgs.map((m) => {
              const isMe = m.senderType === conversation.callerRole;
              if (isMe) {
                return (
                  <Message key={m.id} className="justify-end">
      <div className="max-w-[85%] sm:max-w-xl rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-on-primary shadow-md shadow-primary/5">
                      <p className="text-sm leading-relaxed">{m.text}</p>
                      <span className="mt-1 block text-right text-[10px] text-white/70">
                        {fmtTime(m.createdAt)}
                      </span>
                    </div>
                    <MessageAvatar
                      src={ownAvatar}
                      fallback={currentUser?.name?.[0] || currentUser?.email?.[0]?.toUpperCase() || "U"}
                      className="border border-primary/20 bg-primary/15 text-primary"
                    />
                  </Message>
                );
              }
              return (
                <Message key={m.id}>
                  <MessageAvatar src={otherAvatarSrc} fallback={conversation.otherName?.[0] || "S"} />
                  <MessageContent className="max-w-xl space-y-2">
                    <div className="rounded-2xl rounded-tl-sm bg-surface-container-lowest px-4.5 py-3 shadow-sm border border-outline-variant">
                      <p className="text-sm leading-relaxed text-on-surface whitespace-pre-wrap">{m.text}</p>
                      <span className="mt-1 block text-right text-[10px] text-on-surface-variant">
                        {fmtTime(m.createdAt)}
                      </span>
                    </div>
                  </MessageContent>
                </Message>
              );
            })
          )}
          <ChatContainerScrollAnchor />
        </ChatContainerContent>
      </ChatContainerRoot>

      {/* Specialist Direct Message Input — same ChatPromptInput as the AI chat */}
      <div className="p-4">
        <div className="mx-auto max-w-3xl">
          <ChatPromptInput
            value={text}
            onChange={setText}
            onSend={send}
            isLoading={sending}
            placeholder={`Message ${conversation.otherName}...`}
          />
        </div>
      </div>
    </>
  );
}

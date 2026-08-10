"use client";

import { useEffect, useState } from "react";
import { messageApi, type ConversationDTO } from "@/lib/api";
import { getSpecialistAvatar } from "@/lib/avatar";
import { SpecialistDirectChat } from "./SpecialistDirectChat";
import { useToast } from "@/components/ui/Toast";
import { DraggableChatPopup } from "@/components/dashboard/shared/DraggableChatPopup";
import { STATUS_META } from "@/types";
import type { BookingDetail, User } from "@/types";

interface BookingChatPopupProps {
  booking: BookingDetail;
  currentUser: User | null;
  onClose: () => void;
}

export function BookingChatPopup({ booking, currentUser, onClose }: BookingChatPopupProps) {
  const { showToast } = useToast();
  const [conversation, setConversation] = useState<ConversationDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const loadConversation = () => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    messageApi
      .conversations()
      .then((list) => {
        if (!alive) return;
        const found = list.find((c) => c.bookingId === booking.id);
        setConversation(found || null);
      })
      .catch(() => {
        if (alive) setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  };

  useEffect(loadConversation, [booking.id]);

  const specialistName = booking.specialist?.name || "Specialist";
  const statusMeta = STATUS_META[booking.status] || { label: booking.status, className: "bg-slate-600/15 text-slate-600" };

  // The backend auto-creates a conversation on first message (POST /messages),
  // so the chat must be usable even when no ConversationDTO exists yet. When the
  // lookup returns nothing, synthesize one from the booking so the user can send
  // the first message instead of being stuck on the empty "Say hello" prompt.
  const conversationForChat: ConversationDTO | null =
    conversation ??
    (booking.specialist
      ? {
          bookingId: booking.id,
          bookingNumber: booking.bookingNumber ?? null,
          serviceType: booking.serviceType ?? null,
          otherName: specialistName,
          otherId: booking.workerId ?? "",
          otherType: "worker",
          callerRole: "client",
          lastMessage: "",
          lastMessageAt: "",
          unread: 0,
        }
      : null);

  return (
    <DraggableChatPopup
      header={
        <div
          className="relative px-5 py-4 overflow-hidden"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 100%, #000 0%), color-mix(in srgb, var(--color-primary-container) 100%, #000 0%))",
          }}
        >
          <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-white/[0.07]" />
          <div className="relative flex items-center gap-3">
            <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-white/25 bg-white/10 flex-shrink-0">
              <img
                className="w-full h-full object-cover"
                src={getSpecialistAvatar(specialistName, booking.serviceType || undefined)}
                alt={specialistName}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm truncate">{specialistName}</p>
              <p className="text-white/70 text-[11px] truncate mt-0.5">
                {booking.serviceType} · {booking.bookingNumber}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wide bg-white/15 text-white`}>
                {statusMeta.label}
              </span>
              <button
                onClick={onClose}
                aria-label="Close chat"
                className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center text-white transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      ) : conversationForChat ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <SpecialistDirectChat
            conversation={conversationForChat}
            currentUser={currentUser}
            onSent={() => {
              // Refresh the conversation list so a newly created thread shows up.
              if (!conversation) loadConversation();
            }}
            onError={(m) => showToast(m, "error")}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">forum</span>
          </div>
          <div>
            <h4 className="font-semibold text-sm text-on-surface">Chat with {specialistName}</h4>
            <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
              {failed
                ? "Couldn't load this conversation. Check your connection and try again."
                : "The specialist isn't available to chat yet."}
            </p>
          </div>
          {failed && (
            <button
              onClick={loadConversation}
              className="mt-1 px-4 py-2 rounded-full bg-primary text-on-primary text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      )}
    </DraggableChatPopup>
  );
}

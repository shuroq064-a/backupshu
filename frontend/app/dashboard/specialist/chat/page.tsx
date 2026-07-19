"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store";
import { fetchSpecialistProfile } from "@/store/slices/authSlice";
import { workerExtApi } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { VerificationPendingCard } from "@/components/ui/VerificationPendingCard";

interface ChatMessage {
  sender: "client" | "specialist";
  text: string;
  time: string;
  file?: {
    name: string;
    size: string;
  };
}

interface ChatClient {
  id: string;
  name: string;
  avatar?: string;
  location: string;
  serviceType: string;
  jobId: string;
  priority: "High" | "Medium" | "Low";
  timeline: string;
  lastMessage: string;
  time: string;
  messages: ChatMessage[];
}

const MOCK_CLIENTS: ChatClient[] = [
  {
    id: "sarah_jenkins",
    name: "Sarah Jenkins",
    location: "Chicago, IL",
    serviceType: "Diagnostic Audit",
    jobId: "JOB-8829-X",
    priority: "High",
    timeline: "48 Hours",
    lastMessage: "I've attached the new diagnostic report for your review...",
    time: "14:22",
    messages: [
      {
        sender: "client",
        text: "Hello! I just uploaded the latest diagnostic reports from the morning session. Could you take a look when you have a moment?",
        time: "10:15 AM",
      },
      {
        sender: "specialist",
        text: "Hi Sarah, I've received them. Give me about 15 minutes to analyze the data and I'll get back to you with my findings.",
        time: "10:18 AM",
      },
      {
        sender: "client",
        text: "Perfect. Here is the primary report file for reference.",
        time: "10:22 AM",
        file: { name: "Diagnostic_Report_v2.pdf", size: "2.4 MB" },
      },
    ],
  },
  {
    id: "marcus_chen",
    name: "Marcus Chen",
    location: "San Francisco, CA",
    serviceType: "Wiring Fix",
    jobId: "JOB-9102-Y",
    priority: "Medium",
    timeline: "5 Days",
    lastMessage: "The quote looks good. Let's proceed with the scheduled date.",
    time: "Yesterday",
    messages: [
      {
        sender: "specialist",
        text: "Hi Marcus, I've calculated the cost breakdown for the switchboard wiring fix.",
        time: "Yesterday",
      },
      {
        sender: "client",
        text: "The quote looks good. Let's proceed with the scheduled date.",
        time: "Yesterday",
      },
    ],
  },
  {
    id: "eleanor_vance",
    name: "Eleanor Vance",
    location: "Boston, MA",
    serviceType: "Smart Hub Setup",
    jobId: "JOB-4412-Z",
    priority: "Low",
    timeline: "Next Week",
    lastMessage: "Thank you for the update on the project status.",
    time: "Mon",
    messages: [
      {
        sender: "specialist",
        text: "Hello Eleanor, the smart hub setup is successfully registered on the scheduling board.",
        time: "Mon",
      },
      {
        sender: "client",
        text: "Thank you for the update on the project status.",
        time: "Mon",
      },
    ],
  },
];

const AUTO_REPLIES: Record<string, string[]> = {
  sarah_jenkins: [
    "Thank you, that makes sense. Let me check the schedule.",
    "Could we schedule a quick call to go over the report items?",
    "Got it, looking forward to starting the audit.",
  ],
  marcus_chen: [
    "Sounds great. I'll prepare the wires and switches before arriving.",
    "Do you need me to bring replacement breakers as well?",
    "Perfect, see you tomorrow.",
  ],
  eleanor_vance: [
    "Thanks! Let me know if there's any pre-onboarding instruction.",
    "Excellent, talk to you next week.",
  ],
};

export default function SpecialistCommunicationHub() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const searchParams = useSearchParams();
  const queryClientName = searchParams.get("clientName");
  const { user, activeMode, specialistProfile } = useAppSelector((s) => s.auth);
  const currentProfile = specialistProfile?.userId === user?.id ? specialistProfile : null;
  const [profileChecked, setProfileChecked] = useState(false);
  const { toast, showToast, dismiss } = useToast();

  const [clients, setClients] = useState<ChatClient[]>(MOCK_CLIENTS);
  const [selectedClientId, setSelectedClientId] = useState<string>("sarah_jenkins");
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);

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

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeClient = useMemo(() => {
    return clients.find((c) => c.id === selectedClientId) || clients[0];
  }, [clients, selectedClientId]);

  // ── Sync from DB Bookings ──
  useEffect(() => {
    async function loadDbClients() {
      const workerId = specialistProfile?.id;
      if (!workerId) return;
      try {
        const bookings = await workerExtApi.getBookings(workerId, "accepted");
        if (bookings.length > 0) {
          const synced: ChatClient[] = [];
          
          bookings.forEach((b) => {
            const mappedId = b.clientName ? b.clientName.toLowerCase().replace(/\s+/g, '_') : `client_${b.id.slice(0,4)}`;
            if (synced.some((c) => c.id === mappedId)) return;
            synced.push({
              id: mappedId,
              name: b.clientName || "Client",
              location: b.address || b.clientAddress || "Hyderabad, India",
              serviceType: b.serviceType || "Diagnostic",
              jobId: `JOB-${b.id.slice(0, 4).toUpperCase()}-X`,
              priority: "Medium",
              timeline: "Flexible",
              lastMessage: "Conversation connected via ShuroqX.",
              time: "Recently",
              messages: [
                {
                  sender: "client",
                  text: `Hello, I've booked your ${b.serviceType} service. Let me know when you're available to chat!`,
                  time: "10:00 AM",
                },
              ],
            });
          });

          // Merge lists
          setClients((prev) => {
            const combined = [...synced];
            prev.forEach((p) => {
              if (!combined.some((c) => c.id === p.id)) {
                combined.push(p);
              }
            });
            return combined;
          });
        }
      } catch (err) {
        console.error("Failed to sync database clients:", err);
      }
    }
    loadDbClients();
  }, [specialistProfile]);

  // ── Query Param Selection ──
  useEffect(() => {
    if (queryClientName) {
      const match = clients.find((c) => c.name.toLowerCase() === queryClientName.toLowerCase());
      if (match) {
        setSelectedClientId(match.id);
      }
    }
  }, [queryClientName, clients]);

  // ── Auto Scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeClient?.messages]);

  if (profileChecked && activeMode === "specialist" && !currentProfile) {
    return null;
  }

  // ── Send Message ──
  function handleSendMessage() {
    if (!inputText.trim()) return;

    const text = inputText.trim();
    const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

    // Append Specialist Message
    setClients((prev) =>
      prev.map((c) => {
        if (c.id === selectedClientId) {
          const updatedMsgs = [...c.messages, { sender: "specialist" as const, text, time }];
          return {
            ...c,
            messages: updatedMsgs,
            lastMessage: text,
            time: "Now",
          };
        }
        return c;
      })
    );

    setInputText("");

    // Simulate Client Auto Response
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      const pool = AUTO_REPLIES[selectedClientId] || [
        "Sounds good. Let me know if there's any details needed.",
        "Perfect, thanks!",
      ];
      const replyText = pool[Math.floor(Math.random() * pool.length)];
      const replyTime = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

      setClients((prev) =>
        prev.map((c) => {
          if (c.id === selectedClientId) {
            const updatedMsgs = [...c.messages, { sender: "client" as const, text: replyText, time: replyTime }];
            return {
              ...c,
              messages: updatedMsgs,
              lastMessage: replyText,
              time: "Now",
            };
          }
          return c;
        })
      );
    }, 1800);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

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
            onClick={() => showToast("Search active chats filter is in progress.", "info")}
            className="text-primary hover:bg-primary/5 p-1.5 rounded-xl cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">edit_square</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-outline-variant/30">
          {clients.map((c) => {
            const isSelected = c.id === selectedClientId;
            return (
              <div
                key={c.id}
                onClick={() => setSelectedClientId(c.id)}
                className={`p-4 flex items-start gap-3 cursor-pointer transition-colors ${
                  isSelected ? "bg-primary/5 border-l-4 border-primary" : "hover:bg-gray-50"
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center shrink-0">
                  {c.name[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between items-baseline">
                    <h4 className="font-bold text-sm text-on-surface truncate">{c.name}</h4>
                    <span className="text-[10px] text-gray-400 font-semibold">{c.time}</span>
                  </div>
                  <p className="text-xs text-on-surface-variant truncate mt-1">{c.lastMessage}</p>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Column 2: Main Message Board */}
      <section className="flex-1 min-h-0 flex flex-col bg-surface-bright relative">
        {/* Chat window header */}
        <header className="p-4 border-b border-outline-variant/60 bg-surface-container-lowest flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center">
              {activeClient?.name?.[0]}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-on-surface">{activeClient?.name}</h4>
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded uppercase">
                  {activeClient?.jobId}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-1 text-[10px] text-on-surface-variant">
                <span className="flex items-center gap-0.5">
                  <span className="material-symbols-outlined text-xs">location_on</span>
                  {activeClient?.location}
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

        {/* Message Feed bubbles list */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {activeClient?.messages.map((msg, index) => {
            const isMe = msg.sender === "specialist";
            return (
              <div key={index} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[70%] flex flex-col gap-1 ${isMe ? "items-end" : "items-start"}`}>
                  
                  {/* File Attachment Card */}
                  {msg.file && (
                    <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-4 shadow-sm flex items-center gap-3 mb-1">
                      <div className="w-10 h-10 bg-red-50 text-red-600 rounded-xl flex items-center justify-center">
                        <span className="material-symbols-outlined text-base">picture_as_pdf</span>
                      </div>
                      <div className="text-left text-xs min-w-0">
                        <p className="font-bold text-gray-900 truncate w-32">{msg.file.name}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{msg.file.size}</p>
                      </div>
                      <button
                        onClick={() => showToast(`Downloading ${msg.file?.name}... 💾`, "success")}
                        className="p-1.5 hover:bg-surface-container-high rounded-full transition-colors cursor-pointer shrink-0"
                      >
                        <span className="material-symbols-outlined text-sm">download</span>
                      </button>
                    </div>
                  )}

                  {/* Regular bubble */}
                  {msg.text && (
                    <div
                      className={`px-4 py-3 rounded-2xl text-xs font-semibold leading-relaxed ${
                        isMe
                          ? "bg-primary text-white rounded-tr-none"
                          : "bg-surface-container-lowest text-on-surface border border-outline-variant/60 rounded-tl-none"
                      }`}
                    >
                      {msg.text}
                    </div>
                  )}

                  <span className="text-[9px] text-gray-400 px-1">{msg.time}</span>
                </div>
              </div>
            );
          })}

          {/* Typing Indicator bubble */}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-2xl rounded-tl-none px-4 py-3 text-xs italic text-on-surface-variant flex items-center gap-2 shadow-sm animate-pulse">
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce delay-100" />
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce delay-200" />
                <span>{activeClient?.name} is typing...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input box section */}
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
            onClick={handleSendMessage}
            disabled={!inputText.trim()}
            className="w-11 h-11 shrink-0 bg-primary text-white rounded-xl flex items-center justify-center hover:bg-primary/90 transition-all active:scale-95 shadow-md shadow-primary/15 disabled:opacity-50 cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">send</span>
          </button>
        </footer>
      </section>

      {/* Column 3: Client / Job Description Right Side-Panel */}
      <aside className="hidden xl:flex w-72 border-l border-outline-variant/60 bg-surface-container-lowest flex-col p-6 space-y-6 overflow-y-auto">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-primary/15 text-primary font-bold text-2xl flex items-center justify-center mx-auto shadow-sm">
            {activeClient?.name?.[0]}
          </div>
            <div>
              <h4 className="font-bold text-lg text-on-surface">{activeClient?.name}</h4>
              <p className="text-xs text-on-surface-variant flex items-center justify-center gap-0.5">
                <span className="material-symbols-outlined text-sm text-outline">location_on</span>
                {activeClient?.location}
              </p>
            </div>
        </div>

        <hr className="border-outline-variant/50" />

        {/* Job Details Card */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Job Details</h4>
          <div className="space-y-3 bg-surface-container/50 border border-outline-variant/30 p-4 rounded-2xl text-xs space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400 font-semibold">Service Type</span>
              <span className="font-bold text-on-surface">{activeClient?.serviceType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400 font-semibold">Priority</span>
              <span className={`font-bold uppercase text-[10px] px-2 py-0.5 rounded ${
                activeClient?.priority === "High"
                  ? "bg-red-50 text-red-700 border border-red-100"
                  : "bg-amber-50 text-amber-700 border border-amber-100"
              }`}>
                {activeClient?.priority}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400 font-semibold">Timeline</span>
              <span className="font-bold text-on-surface">{activeClient?.timeline}</span>
            </div>
          </div>
        </div>

        {/* Shared Files list */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Shared Files</h4>
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 p-2 rounded-xl hover:bg-surface-container/30 border border-transparent hover:border-outline-variant/30 text-xs">
              <span className="material-symbols-outlined text-red-500 font-fill">picture_as_pdf</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-on-surface truncate">Initial_Scan_Data.pdf</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Oct 24, 2023</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-xl hover:bg-surface-container/30 border border-transparent hover:border-outline-variant/30 text-xs">
              <span className="material-symbols-outlined text-primary font-fill">image</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-on-surface truncate">Fault_Snapshot_01.png</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Oct 24, 2023</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => showToast("Loading all shared client archives... 📁", "info")}
            className="w-full text-center text-xs font-bold text-primary hover:underline"
          >
            View all 14 files
          </button>
        </div>

        <hr className="border-outline-variant/50" />

        {/* Right side panel actions */}
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
      </aside>
      </div>
      )}
    </>
  );
}

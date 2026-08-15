"use client";

import { JellyBlobMascot, BlobSpeech, type JellyBlobMood } from "../feral-blob";
import "../feral-blob/blob.css";

interface FormCompanionBlobProps {
  mood: JellyBlobMood;
  gaze: { x: number; y: number };
  nod: boolean;
  typing: boolean;
  activeField: string | null;
  /** Live value of the name field — the blob greets it while it's being typed. */
  name?: string;
  /** When set, overrides normal field speech — used for validation errors. */
  errorSpeech?: string | null;
  debug?: boolean;
  className?: string;
}

const FIELD_LINES: Record<string, (name: string) => string> = {
  fullName: (n) => (n.trim() ? `Hi ${n.trim()}!` : "What's your name?"),
  name: (n) => (n.trim() ? `Hi ${n.trim()}!` : "What's your name?"),
  email: () => "Love your email!",
  phone: () => "Share your number?",
  profession: () => "Tell me your job!",
  age: () => "How old are you?",
  gender: () => "Pick one you like!",
  language: () => "Which language?",
  dropdown: () => "Pick one you like!",
  address: () => "Where do you live?",
  password: () => "Secret safe.",
};

export function FormCompanionBlob({
  mood,
  gaze,
  nod,
  typing,
  activeField,
  name,
  errorSpeech,
  debug = true,
  className,
}: FormCompanionBlobProps) {
  const isPassword = activeField === "password";
  const normalSpeech = activeField
    ? (FIELD_LINES[activeField]?.(name ?? "") ?? "How do you like this?")
    : undefined;
  const speech = errorSpeech || normalSpeech;
  const isValidation = !!errorSpeech;
  const lean = (!activeField && !typing && !isValidation)
    ? "translate(0px, 0px) rotate(0deg)"
    : isPassword
      ? "translate(12px, -8px) rotate(12deg)"
      : typing
        ? "translate(-6px, -20px) rotate(-9deg) scale(1.08)"
        : isValidation && !activeField
          ? "translate(0px, -6px) rotate(0deg) scale(1.03)"
          : "translate(-4px, -10px) rotate(-6deg) scale(1.05)";

  return (
    <div className={["shrink-0 flex flex-col items-center gap-1 pt-1", className].filter(Boolean).join(" ")}>
      <div
        className="relative"
        style={{
          transform: lean,
          transition: "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        {speech && (
          <div
            className="absolute bottom-full mb-2 left-1/2 z-20"
            style={{ transform: "translateX(-50%) scale(0.85)", transformOrigin: "bottom center" }}
          >
            <BlobSpeech
              mood={mood}
              messages={{ [mood]: speech }}
              className="text-center"
            />
          </div>
        )}
        <JellyBlobMascot
          mood={mood}
          gaze={gaze}
          nod={nod}
          mouth={typing ? "open" : undefined}
          happyEyes="star"
          still={Boolean(activeField) || typing}
          className="w-20 h-20"
        />
      </div>
      {debug && (
        <span className="text-[10px] text-on-surface-variant font-mono mt-1 select-none">
          {mood} · {activeField ?? "—"} · {typing ? "typing" : "idle"}
        </span>
      )}
    </div>
  );
}

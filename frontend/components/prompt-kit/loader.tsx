"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type LoaderVariant =
  | "circular"
  | "classic"
  | "pulse"
  | "pulse-dot"
  | "dots"
  | "typing"
  | "wave"
  | "bars"
  | "terminal"
  | "text-blink"
  | "text-shimmer"
  | "loading-dots";

export type LoaderSize = "sm" | "md" | "lg";

export type LoaderProps = {
  variant?: LoaderVariant;
  size?: LoaderSize;
  text?: string;
  className?: string;
};

const SIZE_PX: Record<LoaderSize, number> = {
  sm: 16,
  md: 24,
  lg: 36,
};

const shimmerSize: Record<LoaderSize, string> = {
  sm: "text-sm",
  md: "text-lg",
  lg: "text-2xl",
};

function Circular({ size, className }: { size: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block animate-spin rounded-full border-2 border-outline-variant border-t-primary",
        className
      )}
      style={{ width: size, height: size }}
    />
  );
}

function Classic({ size, className }: { size: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block animate-spin rounded-full border-4 border-primary/20 border-t-primary",
        className
      )}
      style={{ width: size, height: size }}
    />
  );
}

function Pulse({ size, className }: { size: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block animate-pulse rounded-full bg-primary",
        className
      )}
      style={{ width: size, height: size }}
    />
  );
}

function PulseDot({ size, className }: { size: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("flex items-center gap-1.5", className)}
      style={{ height: size }}
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
      <span
        className="h-2 w-2 animate-pulse rounded-full bg-primary"
        style={{ animationDelay: "0.2s" }}
      />
      <span
        className="h-2 w-2 animate-pulse rounded-full bg-primary"
        style={{ animationDelay: "0.4s" }}
      />
    </span>
  );
}

function Dots({ size, className }: { size: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("flex items-center gap-1", className)}
      style={{ height: size }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 animate-bounce rounded-full bg-primary"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

function Typing({ size, className }: { size: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("flex items-end gap-1", className)}
      style={{ height: size }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 rounded-full bg-primary"
          style={{
            height: size * 0.5,
            animation: "icon-chat-bounce 0.6s cubic-bezier(0.25,0.46,0.45,0.94) infinite alternate",
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </span>
  );
}

function Wave({ size, className }: { size: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("flex items-end gap-0.5", className)}
      style={{ height: size }}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-1 rounded-full bg-primary"
          style={{
            height: size * 0.6,
            animation: "icon-chat-bounce 0.8s ease-in-out infinite alternate",
            animationDelay: `${i * 0.12}s`,
          }}
        />
      ))}
    </span>
  );
}

function Bars({ size, className }: { size: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("flex items-end gap-1", className)}
      style={{ height: size }}
    >
      {[0.4, 0.8, 0.5, 1, 0.6].map((h, i) => (
        <span
          key={i}
          className="w-1.5 rounded-sm bg-primary"
          style={{
            height: `${h * 100}%`,
            animation: "icon-dashboard-pulse 0.9s ease-in-out infinite alternate",
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </span>
  );
}

function Terminal({ size, className }: { size: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-flex items-center gap-1 font-mono text-primary",
        className
      )}
      style={{ fontSize: size * 0.7 }}
    >
      <span className="animate-pulse">&gt;_</span>
    </span>
  );
}

function TextBlink({
  size,
  text,
  className,
}: {
  size: LoaderSize;
  text?: string;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-flex items-center gap-1 font-medium text-primary",
        shimmerSize[size],
        className
      )}
    >
      <span className="animate-pulse">{text || "Loading..."}</span>
    </span>
  );
}

function TextShimmer({
  size,
  text,
  className,
}: {
  size: LoaderSize;
  text?: string;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "loader-text-shimmer inline-flex items-center gap-1 font-semibold",
        shimmerSize[size],
        className
      )}
    >
      {text || "Loading..."}
    </span>
  );
}

function LoadingDots({ size, text, className }: { size: LoaderSize; text?: string; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-flex items-center gap-1 font-medium text-primary",
        shimmerSize[size],
        className
      )}
    >
      <span>{text || "Loading"}</span>
      <span className="loader-loading-dots" aria-hidden>
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </span>
  );
}

export function Loader({
  variant = "circular",
  size = "md",
  text,
  className,
}: LoaderProps) {
  const px = SIZE_PX[size];

  switch (variant) {
    case "circular":
      return <Circular size={px} className={className} />;
    case "classic":
      return <Classic size={px} className={className} />;
    case "pulse":
      return <Pulse size={px} className={className} />;
    case "pulse-dot":
      return <PulseDot size={px} className={className} />;
    case "dots":
      return <Dots size={px} className={className} />;
    case "typing":
      return <Typing size={px} className={className} />;
    case "wave":
      return <Wave size={px} className={className} />;
    case "bars":
      return <Bars size={px} className={className} />;
    case "terminal":
      return <Terminal size={px} className={className} />;
    case "text-blink":
      return <TextBlink size={size} text={text} className={className} />;
    case "text-shimmer":
      return <TextShimmer size={size} text={text} className={className} />;
    case "loading-dots":
      return <LoadingDots size={size} text={text} className={className} />;
    default:
      return <Circular size={px} className={className} />;
  }
}

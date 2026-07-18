"use client";

import { cn } from "@/lib/utils";

export type MessageProps = {
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>;

const Message = ({ children, className, ...props }: MessageProps) => (
  <div className={cn("flex gap-3", className)} {...props}>
    {children}
  </div>
);

export type MessageAvatarProps = {
  src?: string;
  alt?: string;
  fallback?: React.ReactNode;
  className?: string;
};

const MessageAvatar = ({ src, alt, fallback, className }: MessageAvatarProps) => (
  <div
    className={cn(
      "relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-container text-sm font-bold text-on-primary-container",
      className
    )}
  >
    {src ? (
      <img src={src} alt={alt ?? ""} className="h-full w-full object-cover" />
    ) : (
      fallback
    )}
  </div>
);

export type MessageContentProps = {
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>;

const MessageContent = ({ children, className, ...props }: MessageContentProps) => (
  <div className={cn("text-sm leading-relaxed text-on-surface", className)} {...props}>
    {children}
  </div>
);

export type MessageActionsProps = {
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>;

const MessageActions = ({ children, className, ...props }: MessageActionsProps) => (
  <div
    className={cn("mt-1 flex items-center gap-1 text-on-surface-variant", className)}
    {...props}
  >
    {children}
  </div>
);

export type MessageActionProps = {
  label: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  className?: string;
};

const MessageAction = ({ label, onClick, icon, className }: MessageActionProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className={cn(
      "flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-surface-container",
      className
    )}
  >
    {icon ?? <span className="material-symbols-outlined text-[18px]">forward</span>}
  </button>
);

export { Message, MessageAvatar, MessageContent, MessageActions, MessageAction };

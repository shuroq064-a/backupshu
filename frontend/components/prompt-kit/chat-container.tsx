"use client";

import { cn } from "@/lib/utils";
import { StickToBottom } from "use-stick-to-bottom";
import type { ReactNode } from "react";

type DivProps = React.ComponentProps<"div">;

export type ChatContainerRootProps = {
  children: ReactNode;
  className?: string;
} & DivProps;

export type ChatContainerContentProps = {
  children: ReactNode;
  className?: string;
} & DivProps;

export type ChatContainerScrollAnchorProps = {
  className?: string;
} & DivProps;

function ChatContainerRoot({ children, className, ...props }: ChatContainerRootProps) {
  return (
    <StickToBottom
      className={cn("flex-1 min-h-0 overflow-y-auto", className)}
      resize="smooth"
      initial="instant"
      role="log"
      {...props}
    >
      {children}
    </StickToBottom>
  );
}

function ChatContainerContent({ children, className, ...props }: ChatContainerContentProps) {
  return (
    <StickToBottom.Content
      className={cn("flex w-full flex-col", className)}
      {...props}
    >
      {children}
    </StickToBottom.Content>
  );
}

function ChatContainerScrollAnchor({ className, ...props }: ChatContainerScrollAnchorProps) {
  return (
    <div
      className={cn("h-px w-full shrink-0 scroll-mt-4", className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export { ChatContainerRoot, ChatContainerContent, ChatContainerScrollAnchor };

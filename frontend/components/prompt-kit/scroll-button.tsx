"use client";

import { cn } from "@/lib/utils";
import { useStickToBottomContext } from "use-stick-to-bottom";

export type ScrollButtonProps = {
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

function ScrollButton({ className, ...props }: ScrollButtonProps) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  return (
    <button
      type="button"
      onClick={() => scrollToBottom()}
      aria-label="Scroll to latest message"
      className={cn(
        "absolute bottom-4 right-5 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant bg-surface text-primary shadow-lg transition-all duration-150 ease-out",
        !isAtBottom
          ? "translate-y-0 scale-100 opacity-100"
          : "pointer-events-none translate-y-4 scale-95 opacity-0",
        className
      )}
      {...props}
    >
      <span className="material-symbols-outlined text-[20px]">expand_more</span>
    </button>
  );
}

export { ScrollButton };

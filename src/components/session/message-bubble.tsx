"use client";

import { cn } from "@/lib/utils";

export interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export function MessageBubble({
  role,
  content,
  isStreaming = false,
}: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
      data-testid={`message-${role}`}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        <div className="whitespace-pre-wrap break-words">{content}</div>
        {isStreaming && !content && (
          <div
            className="flex items-center gap-1 py-1"
            data-testid="streaming-indicator"
          >
            <span className="size-1.5 animate-pulse rounded-full bg-current opacity-60" />
            <span className="size-1.5 animate-pulse rounded-full bg-current opacity-60 [animation-delay:0.2s]" />
            <span className="size-1.5 animate-pulse rounded-full bg-current opacity-60 [animation-delay:0.4s]" />
          </div>
        )}
      </div>
    </div>
  );
}

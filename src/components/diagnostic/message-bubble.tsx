"use client";

import type { ChatMessage } from "./types";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
      data-testid={`message-${message.role}`}
    >
      <div
        className={`max-w-[85%] rounded-[12px] px-4 py-3 ${
          isUser
            ? "bg-[#E4F0ED] text-[#1A1917]"
            : "bg-white text-[#1A1917] shadow-[0_1px_3px_rgba(26,25,23,0.05)]"
        }`}
      >
        <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed">
          {message.content}
        </p>
      </div>
    </div>
  );
}

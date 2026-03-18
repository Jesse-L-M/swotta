"use client";

import { useRef, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { MessageBubble } from "./message-bubble";
import type { SessionMessage } from "./use-study-session";

export interface ChatInterfaceProps {
  messages: SessionMessage[];
  isStreaming: boolean;
  onSendMessage: (content: string) => void;
  disabled?: boolean;
}

export function ChatInterface({
  messages,
  isStreaming,
  onSendMessage,
  disabled = false,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current && !disabled) {
      inputRef.current.focus();
    }
  }, [disabled]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming || disabled) return;
    onSendMessage(trimmed);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  }

  return (
    <div
      className="flex flex-1 flex-col overflow-hidden"
      data-testid="chat-interface"
    >
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto p-4"
        data-testid="message-list"
      >
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            isStreaming={
              isStreaming &&
              msg.role === "assistant" &&
              msg.id === messages[messages.length - 1]?.id
            }
          />
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-border p-4"
        data-testid="chat-form"
      >
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your response..."
            disabled={isStreaming || disabled}
            rows={1}
            className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            data-testid="chat-input"
          />
          <Button
            type="submit"
            disabled={!input.trim() || isStreaming || disabled}
            size="lg"
            data-testid="send-btn"
          >
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}

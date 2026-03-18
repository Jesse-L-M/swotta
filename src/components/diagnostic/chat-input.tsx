"use client";

import { useRef, useEffect, type FormEvent } from "react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  disabled?: boolean;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  loading,
  disabled = false,
}: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!loading && !disabled) {
      inputRef.current?.focus();
    }
  }, [loading, disabled]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (value.trim() && !loading && !disabled) {
      onSubmit();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !loading && !disabled) {
        onSubmit();
      }
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-[#E5E0D6] bg-white px-4 py-4"
      data-testid="chat-input-form"
    >
      <div className="mx-auto flex max-w-2xl gap-3">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your response..."
          rows={1}
          disabled={loading || disabled}
          className="flex-1 resize-none rounded-[8px] border border-[#E5E0D6] bg-white px-4 py-2.5 text-[#1A1917] placeholder:text-[#949085] focus:border-[#2D7A6E] focus:outline-none focus:ring-1 focus:ring-[#2D7A6E] disabled:opacity-50"
          data-testid="chat-input"
        />
        <button
          type="submit"
          disabled={loading || disabled || !value.trim()}
          className="rounded-[8px] bg-[#2D7A6E] px-5 py-2.5 text-[0.875rem] font-medium text-white transition-colors duration-150 hover:bg-[#256b60] disabled:opacity-40"
          data-testid="send-btn"
        >
          Send
        </button>
      </div>
    </form>
  );
}

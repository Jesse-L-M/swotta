// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createElement } from "react";
import { ChatInterface, type ChatInterfaceProps } from "./chat-interface";
import type { SessionMessage } from "./use-study-session";

function h(props: ChatInterfaceProps) {
  return createElement(ChatInterface, props);
}

function makeMessages(count: number): SessionMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `msg-${i}`,
    role: (i % 2 === 0 ? "assistant" : "user") as "user" | "assistant",
    content: `Message ${i}`,
    timestamp: new Date(),
  }));
}

describe("ChatInterface", () => {
  it("renders all messages", () => {
    const msgs = makeMessages(3);
    render(h({ messages: msgs, isStreaming: false, onSendMessage: vi.fn() }));
    expect(screen.getByText("Message 0")).toBeTruthy();
    expect(screen.getByText("Message 1")).toBeTruthy();
    expect(screen.getByText("Message 2")).toBeTruthy();
  });

  it("renders empty message list", () => {
    render(h({ messages: [], isStreaming: false, onSendMessage: vi.fn() }));
    expect(screen.getByTestId("message-list").children).toHaveLength(0);
  });

  it("calls onSendMessage when form submitted", () => {
    const onSend = vi.fn();
    render(h({ messages: [], isStreaming: false, onSendMessage: onSend }));
    fireEvent.change(screen.getByTestId("chat-input"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByTestId("send-btn"));
    expect(onSend).toHaveBeenCalledWith("Hello");
  });

  it("clears input after sending", () => {
    render(h({ messages: [], isStreaming: false, onSendMessage: vi.fn() }));
    const input = screen.getByTestId("chat-input") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.click(screen.getByTestId("send-btn"));
    expect(input.value).toBe("");
  });

  it("does not send empty messages", () => {
    const onSend = vi.fn();
    render(h({ messages: [], isStreaming: false, onSendMessage: onSend }));
    fireEvent.click(screen.getByTestId("send-btn"));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not send whitespace-only messages", () => {
    const onSend = vi.fn();
    render(h({ messages: [], isStreaming: false, onSendMessage: onSend }));
    fireEvent.change(screen.getByTestId("chat-input"), { target: { value: "   " } });
    fireEvent.click(screen.getByTestId("send-btn"));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends on Enter key (without shift)", () => {
    const onSend = vi.fn();
    render(h({ messages: [], isStreaming: false, onSendMessage: onSend }));
    const input = screen.getByTestId("chat-input");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    expect(onSend).toHaveBeenCalledWith("test");
  });

  it("does not send on Shift+Enter", () => {
    const onSend = vi.fn();
    render(h({ messages: [], isStreaming: false, onSendMessage: onSend }));
    fireEvent.change(screen.getByTestId("chat-input"), { target: { value: "test" } });
    fireEvent.keyDown(screen.getByTestId("chat-input"), { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables input while streaming", () => {
    render(h({ messages: makeMessages(1), isStreaming: true, onSendMessage: vi.fn() }));
    expect((screen.getByTestId("chat-input") as HTMLTextAreaElement).disabled).toBe(true);
  });

  it("does not send while streaming", () => {
    const onSend = vi.fn();
    render(h({ messages: [], isStreaming: true, onSendMessage: onSend }));
    fireEvent.submit(screen.getByTestId("chat-form"));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables input when disabled prop is true", () => {
    render(h({ messages: [], isStreaming: false, onSendMessage: vi.fn(), disabled: true }));
    expect((screen.getByTestId("chat-input") as HTMLTextAreaElement).disabled).toBe(true);
  });

  it("does not send when disabled", () => {
    const onSend = vi.fn();
    render(h({ messages: [], isStreaming: false, onSendMessage: onSend, disabled: true }));
    fireEvent.change(screen.getByTestId("chat-input"), { target: { value: "test" } });
    fireEvent.submit(screen.getByTestId("chat-form"));
    expect(onSend).not.toHaveBeenCalled();
  });
});

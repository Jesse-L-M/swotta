// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "./message-bubble";

describe("MessageBubble", () => {
  it("renders user message content", () => {
    render(
      <MessageBubble message={{ role: "user", content: "Hello there" }} />
    );
    expect(screen.getByText("Hello there")).toBeDefined();
  });

  it("renders assistant message content", () => {
    render(
      <MessageBubble
        message={{ role: "assistant", content: "Hi! How can I help?" }}
      />
    );
    expect(screen.getByText("Hi! How can I help?")).toBeDefined();
  });

  it("uses correct data-testid for user messages", () => {
    render(
      <MessageBubble message={{ role: "user", content: "Test" }} />
    );
    expect(screen.getByTestId("message-user")).toBeDefined();
  });

  it("uses correct data-testid for assistant messages", () => {
    render(
      <MessageBubble message={{ role: "assistant", content: "Test" }} />
    );
    expect(screen.getByTestId("message-assistant")).toBeDefined();
  });

  it("right-aligns user messages", () => {
    render(
      <MessageBubble message={{ role: "user", content: "Test" }} />
    );
    const container = screen.getByTestId("message-user");
    expect(container.className).toContain("justify-end");
  });

  it("left-aligns assistant messages", () => {
    render(
      <MessageBubble message={{ role: "assistant", content: "Test" }} />
    );
    const container = screen.getByTestId("message-assistant");
    expect(container.className).toContain("justify-start");
  });

  it("applies teal-light background to user messages", () => {
    render(
      <MessageBubble message={{ role: "user", content: "Test" }} />
    );
    const bubble = screen.getByTestId("message-user").firstChild as HTMLElement;
    expect(bubble.className).toContain("bg-[#E4F0ED]");
  });

  it("applies white background with shadow to assistant messages", () => {
    render(
      <MessageBubble message={{ role: "assistant", content: "Test" }} />
    );
    const bubble = screen.getByTestId("message-assistant")
      .firstChild as HTMLElement;
    expect(bubble.className).toContain("bg-white");
    expect(bubble.className).toContain("shadow-");
  });

  it("preserves whitespace in content", () => {
    render(
      <MessageBubble
        message={{ role: "user", content: "Line 1\nLine 2" }}
      />
    );
    const textEl = screen.getByText(/Line 1/);
    expect(textEl.className).toContain("whitespace-pre-wrap");
  });
});

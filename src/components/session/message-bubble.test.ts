// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { MessageBubble } from "./message-bubble";

function h(props: { role: "user" | "assistant"; content: string; isStreaming?: boolean }) {
  return createElement(MessageBubble, props);
}

describe("MessageBubble", () => {
  it("renders user message with correct alignment", () => {
    render(h({ role: "user", content: "Hello" }));
    const wrapper = screen.getByTestId("message-user");
    expect(wrapper.className).toContain("justify-end");
    expect(wrapper.textContent).toContain("Hello");
  });

  it("renders assistant message with correct alignment", () => {
    render(h({ role: "assistant", content: "Hi there" }));
    const wrapper = screen.getByTestId("message-assistant");
    expect(wrapper.className).toContain("justify-start");
    expect(wrapper.textContent).toContain("Hi there");
  });

  it("shows streaming indicator when streaming with empty content", () => {
    render(h({ role: "assistant", content: "", isStreaming: true }));
    expect(screen.getByTestId("streaming-indicator")).toBeTruthy();
  });

  it("does not show streaming indicator when there is content", () => {
    render(h({ role: "assistant", content: "Text", isStreaming: true }));
    expect(screen.queryByTestId("streaming-indicator")).toBeNull();
  });

  it("does not show streaming indicator when not streaming", () => {
    render(h({ role: "assistant", content: "", isStreaming: false }));
    expect(screen.queryByTestId("streaming-indicator")).toBeNull();
  });

  it("defaults isStreaming to false", () => {
    render(h({ role: "assistant", content: "" }));
    expect(screen.queryByTestId("streaming-indicator")).toBeNull();
  });
});

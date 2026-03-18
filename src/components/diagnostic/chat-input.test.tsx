// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatInput } from "./chat-input";

describe("ChatInput", () => {
  const defaultProps = {
    value: "",
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    loading: false,
  };

  it("renders the textarea", () => {
    render(<ChatInput {...defaultProps} />);
    expect(screen.getByTestId("chat-input")).toBeDefined();
  });

  it("renders the send button", () => {
    render(<ChatInput {...defaultProps} />);
    expect(screen.getByTestId("send-btn")).toBeDefined();
  });

  it("displays the current value in the textarea", () => {
    render(<ChatInput {...defaultProps} value="Hello" />);
    expect(
      (screen.getByTestId("chat-input") as HTMLTextAreaElement).value
    ).toBe("Hello");
  });

  it("calls onChange when typing", () => {
    const onChange = vi.fn();
    render(<ChatInput {...defaultProps} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Hi" },
    });
    expect(onChange).toHaveBeenCalledWith("Hi");
  });

  it("calls onSubmit when form is submitted", () => {
    const onSubmit = vi.fn();
    render(
      <ChatInput {...defaultProps} value="Hello" onSubmit={onSubmit} />
    );
    fireEvent.submit(screen.getByTestId("chat-input-form"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("does not call onSubmit when value is empty", () => {
    const onSubmit = vi.fn();
    render(<ChatInput {...defaultProps} value="" onSubmit={onSubmit} />);
    fireEvent.submit(screen.getByTestId("chat-input-form"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not call onSubmit when value is only whitespace", () => {
    const onSubmit = vi.fn();
    render(
      <ChatInput {...defaultProps} value="   " onSubmit={onSubmit} />
    );
    fireEvent.submit(screen.getByTestId("chat-input-form"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit on Enter key press (without Shift)", () => {
    const onSubmit = vi.fn();
    render(
      <ChatInput {...defaultProps} value="Hello" onSubmit={onSubmit} />
    );
    fireEvent.keyDown(screen.getByTestId("chat-input"), {
      key: "Enter",
      shiftKey: false,
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("does not call onSubmit on Shift+Enter", () => {
    const onSubmit = vi.fn();
    render(
      <ChatInput {...defaultProps} value="Hello" onSubmit={onSubmit} />
    );
    fireEvent.keyDown(screen.getByTestId("chat-input"), {
      key: "Enter",
      shiftKey: true,
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables textarea when loading", () => {
    render(<ChatInput {...defaultProps} loading={true} />);
    expect(
      (screen.getByTestId("chat-input") as HTMLTextAreaElement).disabled
    ).toBe(true);
  });

  it("disables send button when loading", () => {
    render(
      <ChatInput {...defaultProps} value="Hello" loading={true} />
    );
    expect(
      (screen.getByTestId("send-btn") as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("disables send button when value is empty", () => {
    render(<ChatInput {...defaultProps} value="" />);
    expect(
      (screen.getByTestId("send-btn") as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("enables send button when value has content and not loading", () => {
    render(<ChatInput {...defaultProps} value="Hello" />);
    expect(
      (screen.getByTestId("send-btn") as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it("disables textarea when disabled prop is true", () => {
    render(<ChatInput {...defaultProps} disabled={true} />);
    expect(
      (screen.getByTestId("chat-input") as HTMLTextAreaElement).disabled
    ).toBe(true);
  });

  it("does not call onSubmit when disabled", () => {
    const onSubmit = vi.fn();
    render(
      <ChatInput
        {...defaultProps}
        value="Hello"
        onSubmit={onSubmit}
        disabled={true}
      />
    );
    fireEvent.submit(screen.getByTestId("chat-input-form"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not submit on Enter when loading", () => {
    const onSubmit = vi.fn();
    render(
      <ChatInput
        {...defaultProps}
        value="Hello"
        onSubmit={onSubmit}
        loading={true}
      />
    );
    fireEvent.keyDown(screen.getByTestId("chat-input"), {
      key: "Enter",
      shiftKey: false,
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

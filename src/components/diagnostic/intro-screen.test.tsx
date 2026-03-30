// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IntroScreen } from "./intro-screen";

describe("IntroScreen", () => {
  const defaultProps = {
    qualificationLabel: "GCSE Biology (AQA)",
    remainingPendingCount: 0,
    mode: "start" as const,
    onStart: vi.fn(),
    onSkip: vi.fn(),
    loading: false,
    error: null,
  };

  it("renders the intro heading", () => {
    render(<IntroScreen {...defaultProps} />);
    expect(
      screen.getByText(/see what you already know/)
    ).toBeDefined();
  });

  it("renders description text", () => {
    render(<IntroScreen {...defaultProps} />);
    expect(
      screen.getByText(/Before we build your study plan/)
    ).toBeDefined();
  });

  it("renders the qualification label", () => {
    render(<IntroScreen {...defaultProps} />);
    expect(screen.getByTestId("qualification-label").textContent).toBe(
      "GCSE Biology (AQA)"
    );
  });

  it("renders start button", () => {
    render(<IntroScreen {...defaultProps} />);
    expect(screen.getByTestId("start-btn")).toBeDefined();
    expect(screen.getByTestId("start-btn").textContent).toBe(
      "Start diagnostic"
    );
  });

  it("renders skip button", () => {
    render(<IntroScreen {...defaultProps} />);
    expect(screen.getByTestId("skip-btn")).toBeDefined();
    expect(screen.getByTestId("skip-btn").textContent).toBe("Skip for now");
  });

  it("renders skip explanation", () => {
    render(<IntroScreen {...defaultProps} />);
    expect(screen.getByTestId("skip-explanation")).toBeDefined();
    expect(screen.getByTestId("skip-explanation").textContent).toContain(
      "all topics start at zero mastery"
    );
  });

  it("explains when the dashboard unlocks immediately after this diagnostic", () => {
    render(<IntroScreen {...defaultProps} />);
    expect(screen.getByTestId("diagnostic-flow-note").textContent).toContain(
      "dashboard will be ready"
    );
  });

  it("explains when more diagnostics remain", () => {
    render(
      <IntroScreen {...defaultProps} remainingPendingCount={2} />
    );
    expect(screen.getByTestId("diagnostic-flow-note").textContent).toContain(
      "2 more diagnostics"
    );
  });

  it("calls onStart when start button is clicked", () => {
    const onStart = vi.fn();
    render(<IntroScreen {...defaultProps} onStart={onStart} />);
    fireEvent.click(screen.getByTestId("start-btn"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("calls onSkip when skip button is clicked", () => {
    const onSkip = vi.fn();
    render(<IntroScreen {...defaultProps} onSkip={onSkip} />);
    fireEvent.click(screen.getByTestId("skip-btn"));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("shows 'Starting...' text when loading", () => {
    render(<IntroScreen {...defaultProps} loading={true} />);
    expect(screen.getByTestId("start-btn").textContent).toBe("Starting...");
  });

  it("disables buttons when loading", () => {
    render(<IntroScreen {...defaultProps} loading={true} />);
    expect(
      (screen.getByTestId("start-btn") as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (screen.getByTestId("skip-btn") as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("renders error message when error is set", () => {
    render(
      <IntroScreen {...defaultProps} error="Something went wrong" />
    );
    expect(screen.getByTestId("intro-error")).toBeDefined();
    expect(screen.getByTestId("intro-error").textContent).toBe(
      "Something went wrong"
    );
  });

  it("does not render error element when error is null", () => {
    render(<IntroScreen {...defaultProps} error={null} />);
    expect(screen.queryByTestId("intro-error")).toBeNull();
  });

  it("switches to restart copy when recovering an expired diagnostic", () => {
    render(<IntroScreen {...defaultProps} mode="restart" />);
    expect(screen.getByText(/restart your diagnostic/i)).toBeDefined();
    expect(screen.getByTestId("start-btn").textContent).toBe(
      "Restart diagnostic"
    );
  });

  it("has the correct data-testid on the root", () => {
    render(<IntroScreen {...defaultProps} />);
    expect(screen.getByTestId("diagnostic-intro")).toBeDefined();
  });
});

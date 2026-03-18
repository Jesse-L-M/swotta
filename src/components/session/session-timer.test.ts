// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { SessionTimer, formatTime, type SessionTimerProps } from "./session-timer";

function h(props: SessionTimerProps) {
  return createElement(SessionTimer, props);
}

describe("formatTime", () => {
  it("formats 0 seconds", () => {
    expect(formatTime(0)).toBe("0:00");
  });

  it("formats seconds under a minute", () => {
    expect(formatTime(45)).toBe("0:45");
  });

  it("formats exact minutes", () => {
    expect(formatTime(120)).toBe("2:00");
  });

  it("formats minutes and seconds", () => {
    expect(formatTime(185)).toBe("3:05");
  });

  it("pads single digit seconds", () => {
    expect(formatTime(62)).toBe("1:02");
  });
});

describe("SessionTimer", () => {
  it("renders elapsed time for non-timed blocks", () => {
    render(h({ elapsedSeconds: 125, durationMinutes: 15, blockType: "retrieval_drill" }));
    expect(screen.getByTestId("timer-display").textContent).toBe("2:05");
  });

  it("renders remaining time for timed blocks", () => {
    render(h({ elapsedSeconds: 60, durationMinutes: 5, blockType: "timed_problems" }));
    expect(screen.getByTestId("timer-display").textContent).toBe("4:00");
  });

  it("shows 0:00 when timed block goes overtime", () => {
    render(h({ elapsedSeconds: 400, durationMinutes: 5, blockType: "timed_problems" }));
    expect(screen.getByTestId("timer-display").textContent).toBe("0:00");
  });

  it("applies overtime styling for timed blocks past duration", () => {
    render(h({ elapsedSeconds: 400, durationMinutes: 5, blockType: "timed_problems" }));
    expect(screen.getByTestId("timer-display").className).toContain("text-destructive");
  });

  it("does not apply overtime styling for non-timed blocks", () => {
    render(h({ elapsedSeconds: 2000, durationMinutes: 15, blockType: "explanation" }));
    expect(screen.getByTestId("timer-display").className).not.toContain("text-destructive");
  });

  it("renders progress bar", () => {
    render(h({ elapsedSeconds: 450, durationMinutes: 15, blockType: "retrieval_drill" }));
    expect(screen.getByTestId("timer-progress-bar").style.width).toBe("50%");
  });

  it("caps progress at 100%", () => {
    render(h({ elapsedSeconds: 2000, durationMinutes: 15, blockType: "explanation" }));
    expect(screen.getByTestId("timer-progress-bar").style.width).toBe("100%");
  });

  it("renders destructive color for overtime progress bar", () => {
    render(h({ elapsedSeconds: 400, durationMinutes: 5, blockType: "timed_problems" }));
    expect(screen.getByTestId("timer-progress-bar").className).toContain("bg-destructive");
  });

  it("renders teal color for normal progress bar", () => {
    render(h({ elapsedSeconds: 60, durationMinutes: 15, blockType: "retrieval_drill" }));
    expect(screen.getByTestId("timer-progress-bar").className).toContain("bg-teal-500");
  });
});

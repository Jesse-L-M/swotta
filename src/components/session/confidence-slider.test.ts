// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createElement } from "react";
import { ConfidenceSlider, type ConfidenceSliderProps } from "./confidence-slider";

function h(props: ConfidenceSliderProps) {
  return createElement(ConfidenceSlider, props);
}

describe("ConfidenceSlider", () => {
  it("renders label and description", () => {
    render(h({ label: "How confident?", description: "Rate yourself", onSubmit: vi.fn() }));
    expect(screen.getByText("How confident?")).toBeTruthy();
    expect(screen.getByText("Rate yourself")).toBeTruthy();
  });

  it("renders all 5 confidence levels", () => {
    render(h({ label: "Test", description: "Test", onSubmit: vi.fn() }));
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByTestId(`confidence-${i}`)).toBeTruthy();
    }
  });

  it("submit button is disabled when no selection", () => {
    render(h({ label: "Test", description: "Test", onSubmit: vi.fn() }));
    const btn = screen.getByTestId("confidence-submit");
    expect(btn.hasAttribute("disabled") || btn.getAttribute("aria-disabled") === "true").toBe(true);
  });

  it("selecting a level enables the submit button", () => {
    render(h({ label: "Test", description: "Test", onSubmit: vi.fn() }));
    fireEvent.click(screen.getByTestId("confidence-3"));
    const btn = screen.getByTestId("confidence-submit");
    expect(btn.hasAttribute("disabled")).toBe(false);
  });

  it("calls onSubmit with normalised value (value/5)", () => {
    const onSubmit = vi.fn();
    render(h({ label: "Test", description: "Test", onSubmit }));
    fireEvent.click(screen.getByTestId("confidence-4"));
    fireEvent.click(screen.getByTestId("confidence-submit"));
    expect(onSubmit).toHaveBeenCalledWith(0.8);
  });

  it("can change selection before submitting", () => {
    const onSubmit = vi.fn();
    render(h({ label: "Test", description: "Test", onSubmit }));
    fireEvent.click(screen.getByTestId("confidence-2"));
    fireEvent.click(screen.getByTestId("confidence-5"));
    fireEvent.click(screen.getByTestId("confidence-submit"));
    expect(onSubmit).toHaveBeenCalledWith(1.0);
  });

  it("applies selected styling to chosen level", () => {
    render(h({ label: "Test", description: "Test", onSubmit: vi.fn() }));
    const btn = screen.getByTestId("confidence-3");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-checked")).toBe("true");
  });

  it("shows the selected label outside the button row for compact layouts", () => {
    render(h({ label: "Test", description: "Test", onSubmit: vi.fn() }));
    fireEvent.click(screen.getByTestId("confidence-3"));
    expect(screen.getByTestId("confidence-selection-label").textContent).toBe(
      "Somewhat"
    );
  });

  it("has correct aria roles", () => {
    render(h({ label: "Test label", description: "Test", onSubmit: vi.fn() }));
    expect(screen.getByRole("radiogroup")).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(5);
  });
});

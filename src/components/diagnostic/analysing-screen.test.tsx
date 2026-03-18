// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnalysingScreen } from "./analysing-screen";

describe("AnalysingScreen", () => {
  it("renders the analysing heading", () => {
    render(<AnalysingScreen />);
    expect(screen.getByText("Analysing your responses")).toBeDefined();
  });

  it("renders the loading description", () => {
    render(<AnalysingScreen />);
    expect(
      screen.getByText("Building your personalised knowledge map...")
    ).toBeDefined();
  });

  it("has the correct data-testid", () => {
    render(<AnalysingScreen />);
    expect(screen.getByTestId("diagnostic-analysing")).toBeDefined();
  });

  it("renders a spinner element", () => {
    render(<AnalysingScreen />);
    const container = screen.getByTestId("diagnostic-analysing");
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();
  });
});

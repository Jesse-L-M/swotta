import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FlagAlert, FlagAlertList } from "./flag-alerts";
import type { AlertVariant } from "./flag-alerts";

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe("FlagAlert", () => {
  it("renders title and description", () => {
    const html = render(
      React.createElement(FlagAlert, {
        variant: "success",
        title: "Great progress",
        description: "Topic improved by 20%",
      }),
    );
    expect(html).toContain("Great progress");
    expect(html).toContain("Topic improved by 20%");
  });

  it.each<{ variant: AlertVariant; borderClass: string }>([
    { variant: "success", borderClass: "border-l-emerald-500" },
    { variant: "warning", borderClass: "border-l-amber-500" },
    { variant: "danger", borderClass: "border-l-red-500" },
  ])("renders $variant variant with correct border class", ({ variant, borderClass }) => {
    const html = render(
      React.createElement(FlagAlert, {
        variant,
        title: "Test",
        description: "Desc",
      }),
    );
    expect(html).toContain(borderClass);
    expect(html).toContain(`data-variant="${variant}"`);
  });

  it("renders success variant with green text", () => {
    const html = render(
      React.createElement(FlagAlert, {
        variant: "success",
        title: "Strength",
        description: "Good",
      }),
    );
    expect(html).toContain("text-emerald-700");
  });

  it("renders warning variant with amber text", () => {
    const html = render(
      React.createElement(FlagAlert, {
        variant: "warning",
        title: "Watch",
        description: "Caution",
      }),
    );
    expect(html).toContain("text-amber-700");
  });

  it("renders danger variant with red text", () => {
    const html = render(
      React.createElement(FlagAlert, {
        variant: "danger",
        title: "Alert",
        description: "Critical",
      }),
    );
    expect(html).toContain("text-red-700");
  });

  it("applies custom className", () => {
    const html = render(
      React.createElement(FlagAlert, {
        variant: "success",
        title: "Test",
        description: "Desc",
        className: "my-custom-class",
      }),
    );
    expect(html).toContain("my-custom-class");
  });
});

describe("FlagAlertList", () => {
  it("renders nothing when flags array is empty", () => {
    const html = render(
      React.createElement(FlagAlertList, { flags: [] }),
    );
    expect(html).toBe("");
  });

  it("renders one flag per entry", () => {
    const flags = [
      { type: "disengagement", description: "No sessions in 5 days", severity: "high" as const },
      { type: "avoidance", description: "Skipping chemistry", severity: "medium" as const },
    ];
    const html = render(
      React.createElement(FlagAlertList, { flags }),
    );
    expect(html).toContain("Disengagement");
    expect(html).toContain("No sessions in 5 days");
    expect(html).toContain("Avoidance");
    expect(html).toContain("Skipping chemistry");
  });

  it("maps high severity to danger variant", () => {
    const html = render(
      React.createElement(FlagAlertList, {
        flags: [{ type: "test", description: "desc", severity: "high" }],
      }),
    );
    expect(html).toContain('data-variant="danger"');
  });

  it("maps medium severity to warning variant", () => {
    const html = render(
      React.createElement(FlagAlertList, {
        flags: [{ type: "test", description: "desc", severity: "medium" }],
      }),
    );
    expect(html).toContain('data-variant="warning"');
  });

  it("maps low severity to success variant", () => {
    const html = render(
      React.createElement(FlagAlertList, {
        flags: [{ type: "test", description: "desc", severity: "low" }],
      }),
    );
    expect(html).toContain('data-variant="success"');
  });

  it("capitalizes flag type for title", () => {
    const html = render(
      React.createElement(FlagAlertList, {
        flags: [{ type: "disengagement", description: "desc", severity: "low" }],
      }),
    );
    expect(html).toContain("Disengagement");
  });

  it("applies custom className", () => {
    const html = render(
      React.createElement(FlagAlertList, {
        flags: [{ type: "test", description: "desc", severity: "low" }],
        className: "extra-class",
      }),
    );
    expect(html).toContain("extra-class");
  });
});

// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StudentShell } from "./student-shell";

const mockUsePathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

describe("StudentShell", () => {
  it("renders navigation links on standard student routes", () => {
    mockUsePathname.mockReturnValue("/dashboard");

    render(
      <StudentShell>
        <div>Dashboard content</div>
      </StudentShell>
    );

    expect(
      screen.getByRole("navigation", { name: "Student navigation" })
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Journey" }).getAttribute("href")
    ).toBe("/journey");
  });

  it("hides the navigation on focused flows", () => {
    mockUsePathname.mockReturnValue("/onboarding");

    render(
      <StudentShell>
        <div>Onboarding content</div>
      </StudentShell>
    );

    expect(
      screen.queryByRole("navigation", { name: "Student navigation" })
    ).toBeNull();
  });
});

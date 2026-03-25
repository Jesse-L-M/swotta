// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FadeIn } from "./fade-in";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

describe("FadeIn", () => {
  const originalMatchMedia = window.matchMedia;
  const originalIntersectionObserver = globalThis.IntersectionObserver;

  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === reducedMotionQuery,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    class MockIntersectionObserver {
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
      takeRecords = vi.fn().mockReturnValue([]);
    }

    Object.defineProperty(globalThis, "IntersectionObserver", {
      writable: true,
      value: MockIntersectionObserver,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: originalMatchMedia,
    });

    Object.defineProperty(globalThis, "IntersectionObserver", {
      writable: true,
      value: originalIntersectionObserver,
    });
  });

  it("renders the visible state without animation when reduced motion is preferred", async () => {
    const { container } = render(
      <FadeIn delay={0.2} y={32}>
        <div>Revision plan</div>
      </FadeIn>
    );

    await waitFor(() => {
      const wrapper = container.firstElementChild as HTMLDivElement | null;
      expect(wrapper).toBeTruthy();
      expect(wrapper?.style.animation).toBe("none");
      expect(wrapper?.style.opacity).toBe("1");
      expect(wrapper?.style.transform).toBe("translateY(0)");
    });
  });
});

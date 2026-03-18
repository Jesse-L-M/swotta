import { describe, it, expect, vi } from "vitest";

vi.mock("inngest/next", () => ({
  serve: vi.fn().mockReturnValue({
    GET: vi.fn(),
    POST: vi.fn(),
    PUT: vi.fn(),
  }),
}));

vi.mock("../../../../inngest/client", () => ({
  inngest: { id: "swotta" },
}));

vi.mock("../../../../inngest/index", () => ({
  functions: [{ opts: { id: "test/fn" } }],
}));

import { serve } from "inngest/next";

describe("inngest API route", () => {
  it("exports GET, POST, PUT handlers", async () => {
    const route = await import("./route");
    expect(route.GET).toBeDefined();
    expect(route.POST).toBeDefined();
    expect(route.PUT).toBeDefined();
    expect(typeof route.GET).toBe("function");
    expect(typeof route.POST).toBe("function");
    expect(typeof route.PUT).toBe("function");
  });

  it("calls serve with correct client and functions", async () => {
    await import("./route");

    const mockServe = vi.mocked(serve);
    expect(mockServe).toHaveBeenCalledWith({
      client: { id: "swotta" },
      functions: [{ opts: { id: "test/fn" } }],
    });
  });
});

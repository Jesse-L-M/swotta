import { describe, it, expect } from "vitest";
import { inngest } from "./client";
import { asTestable } from "./test-helpers";

describe("inngest client", () => {
  it("has the correct app id", () => {
    expect(inngest.id).toBe("swotta");
  });

  it("exports typed event schemas", () => {
    const fn1 = asTestable(
      inngest.createFunction(
        { id: "test/source" },
        { event: "source.file.uploaded" },
        async () => {},
      ),
    );
    expect(fn1.opts.triggers).toEqual([{ event: "source.file.uploaded" }]);

    const fn2 = asTestable(
      inngest.createFunction(
        { id: "test/report" },
        { event: "report.generate" },
        async () => {},
      ),
    );
    expect(fn2.opts.triggers).toEqual([{ event: "report.generate" }]);

    const fn3 = asTestable(
      inngest.createFunction(
        { id: "test/attempt" },
        { event: "attempt.completed" },
        async () => {},
      ),
    );
    expect(fn3.opts.triggers).toEqual([{ event: "attempt.completed" }]);
  });

  it("is a singleton instance", async () => {
    const { inngest: inngest2 } = await import("./client");
    expect(inngest2).toBe(inngest);
  });
});

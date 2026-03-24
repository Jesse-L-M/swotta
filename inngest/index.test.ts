import { describe, it, expect } from "vitest";
import { functions } from "./index";
import { asTestable } from "./test-helpers";

describe("inngest function registry", () => {
  it("registers exactly 9 functions", () => {
    expect(functions).toHaveLength(9);
  });

  it("includes all expected function ids", () => {
    const ids = functions.map((fn) => fn.opts.id);

    expect(ids).toContain("ingestion/process-file");
    expect(ids).toContain("scheduling/update-queue");
    expect(ids).toContain("scheduling/rebuild-plans");
    expect(ids).toContain("mastery/decay-check");
    expect(ids).toContain("reporting/weekly-report-trigger");
    expect(ids).toContain("reporting/weekly-report-generate");
    expect(ids).toContain("reporting/detect-flags");
    expect(ids).toContain("notifications/daily-check");
    expect(ids).toContain("student/weekly-email");
  });

  it("has correct event triggers", () => {
    const triggerMap = new Map(
      functions.map((fn) => [fn.opts.id, asTestable(fn).opts.triggers]),
    );

    expect(triggerMap.get("ingestion/process-file")).toEqual([
      { event: "source.file.uploaded" },
    ]);
    expect(triggerMap.get("scheduling/update-queue")).toEqual([
      { event: "attempt.completed" },
    ]);
    expect(triggerMap.get("reporting/weekly-report-generate")).toEqual([
      { event: "report.generate" },
    ]);
  });

  it("has correct cron schedules", () => {
    const triggerMap = new Map(
      functions.map((fn) => [fn.opts.id, asTestable(fn).opts.triggers]),
    );

    expect(triggerMap.get("scheduling/rebuild-plans")).toEqual([
      { cron: "0 0 * * 1" },
    ]);
    expect(triggerMap.get("mastery/decay-check")).toEqual([
      { cron: "0 0 * * *" },
    ]);
    expect(triggerMap.get("reporting/weekly-report-trigger")).toEqual([
      { cron: "5 0 * * 1" },
    ]);
    expect(triggerMap.get("reporting/detect-flags")).toEqual([
      { cron: "0 6 * * *" },
    ]);
    expect(triggerMap.get("notifications/daily-check")).toEqual([
      { cron: "0 17 * * *" },
    ]);
    expect(triggerMap.get("student/weekly-email")).toEqual([
      { cron: "TZ=Europe/London 0 7 * * 1" },
    ]);
  });

  it("has retry config on event-triggered functions", () => {
    const processFile = functions.find((fn) => fn.opts.id === "ingestion/process-file");
    expect(asTestable(processFile!).opts.retries).toBe(3);

    const updateQueue = functions.find((fn) => fn.opts.id === "scheduling/update-queue");
    expect(asTestable(updateQueue!).opts.retries).toBe(3);

    const reportGenerate = functions.find((fn) => fn.opts.id === "reporting/weekly-report-generate");
    expect(asTestable(reportGenerate!).opts.retries).toBe(3);
  });
});

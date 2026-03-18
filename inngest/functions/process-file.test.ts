import { describe, it, expect, vi, beforeEach } from "vitest";
import { processFileFunction } from "./process-file";
import { asTestable } from "../test-helpers";
import type { TopicId } from "@/lib/types";

vi.mock("@/engine/ingestion", () => ({
  processFile: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  structuredLog: vi.fn(),
}));

import { processFile } from "@/engine/ingestion";

const mockProcessFile = vi.mocked(processFile);
const testable = asTestable(processFileFunction);

describe("ingestion/process-file function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has correct function config", () => {
    expect(testable.opts.id).toBe("ingestion/process-file");
    expect(testable.opts.triggers).toEqual([
      { event: "source.file.uploaded" },
    ]);
    expect(testable.opts.retries).toBe(3);
  });

  it("calls processFile with fileId from event data", async () => {
    const mockResult = {
      chunksCreated: 10,
      embeddingsCreated: 10,
      mappingsCreated: 5,
      topicsCovered: ["topic-1" as TopicId, "topic-2" as TopicId],
    };
    mockProcessFile.mockResolvedValue(mockResult);

    const stepRun = vi.fn().mockImplementation((_name: string, fn: () => Promise<unknown>) => fn());

    const result = await testable.fn(
      {
        event: {
          data: { fileId: "file-123" },
          name: "source.file.uploaded" as const,
        },
        step: { run: stepRun },
      },
      undefined,
    );

    expect(mockProcessFile).toHaveBeenCalledWith("file-123", undefined, undefined);
    expect(result).toEqual(mockResult);
    expect(stepRun).toHaveBeenCalledWith("process-file", expect.any(Function));
  });

  it("passes qualificationVersionId when present", async () => {
    const mockResult = {
      chunksCreated: 5,
      embeddingsCreated: 5,
      mappingsCreated: 3,
      topicsCovered: ["topic-1" as TopicId],
    };
    mockProcessFile.mockResolvedValue(mockResult);

    const stepRun = vi.fn().mockImplementation((_name: string, fn: () => Promise<unknown>) => fn());

    await testable.fn(
      {
        event: {
          data: { fileId: "file-456", qualificationVersionId: "qv-789" },
          name: "source.file.uploaded" as const,
        },
        step: { run: stepRun },
      },
      undefined,
    );

    expect(mockProcessFile).toHaveBeenCalledWith("file-456", undefined, {
      qualificationVersionId: "qv-789",
    });
  });

  it("propagates errors from processFile for Inngest retry", async () => {
    mockProcessFile.mockRejectedValue(new Error("File not found"));

    const stepRun = vi.fn().mockImplementation((_name: string, fn: () => Promise<unknown>) => fn());

    await expect(
      testable.fn(
        {
          event: {
            data: { fileId: "bad-file" },
            name: "source.file.uploaded" as const,
          },
          step: { run: stepRun },
        },
        undefined,
      ),
    ).rejects.toThrow("File not found");
  });
});

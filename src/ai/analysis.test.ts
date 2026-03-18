import { describe, it, expect, vi, beforeEach } from "vitest";
import { classifyChunks, clearPromptCache, type TopicInfo } from "./analysis";
import type { TopicId } from "@/lib/types";

function mockTopics(): TopicInfo[] {
  return [
    { id: "topic-1" as TopicId, name: "Cell Structure", code: "1.1" },
    { id: "topic-2" as TopicId, name: "Cell Division", code: "1.2" },
    { id: "topic-3" as TopicId, name: "Ecology", code: "4.1" },
  ];
}

function makeMockClient(responseText: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text" as const, text: responseText }],
      }),
    },
  } as unknown as import("@anthropic-ai/sdk").default;
}

function makeMockClientFailing(error: Error) {
  return {
    messages: {
      create: vi.fn().mockRejectedValue(error),
    },
  } as unknown as import("@anthropic-ai/sdk").default;
}

describe("classifyChunks", () => {
  beforeEach(() => {
    clearPromptCache();
  });

  it("returns empty array for empty chunks", async () => {
    const result = await classifyChunks([], mockTopics());
    expect(result).toEqual([]);
  });

  it("returns empty mappings for each chunk when no topics provided", async () => {
    const chunks = [{ index: 0, content: "Cell biology content" }];
    const result = await classifyChunks(chunks, []);
    expect(result).toEqual([{ chunkIndex: 0, mappings: [] }]);
  });

  it("classifies a single chunk against topics", async () => {
    const client = makeMockClient(
      JSON.stringify({
        mappings: [{ topicCode: "1.1", confidence: 0.9 }],
      })
    );
    const result = await classifyChunks(
      [{ index: 0, content: "The cell membrane controls what enters and leaves the cell." }],
      mockTopics(),
      client
    );

    expect(result).toHaveLength(1);
    expect(result[0].chunkIndex).toBe(0);
    expect(result[0].mappings).toHaveLength(1);
    expect(result[0].mappings[0].topicId).toBe("topic-1");
    expect(result[0].mappings[0].confidence).toBe(0.9);
  });

  it("handles multiple topics per chunk", async () => {
    const client = makeMockClient(
      JSON.stringify({
        mappings: [
          { topicCode: "1.1", confidence: 0.85 },
          { topicCode: "1.2", confidence: 0.6 },
        ],
      })
    );
    const result = await classifyChunks(
      [{ index: 0, content: "Cell structure is important for understanding cell division." }],
      mockTopics(),
      client
    );

    expect(result[0].mappings).toHaveLength(2);
    expect(result[0].mappings[0].topicId).toBe("topic-1");
    expect(result[0].mappings[1].topicId).toBe("topic-2");
  });

  it("processes multiple chunks", async () => {
    let callCount = 0;
    const client = {
      messages: {
        create: vi.fn().mockImplementation(() => {
          callCount++;
          const code = callCount === 1 ? "1.1" : "4.1";
          return Promise.resolve({
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  mappings: [{ topicCode: code, confidence: 0.8 }],
                }),
              },
            ],
          });
        }),
      },
    } as unknown as import("@anthropic-ai/sdk").default;

    const result = await classifyChunks(
      [
        { index: 0, content: "Cell structure content" },
        { index: 1, content: "Ecology content" },
      ],
      mockTopics(),
      client
    );

    expect(result).toHaveLength(2);
    expect(result[0].mappings[0].topicId).toBe("topic-1");
    expect(result[1].mappings[0].topicId).toBe("topic-3");
  });

  it("filters out unknown topic codes", async () => {
    const client = makeMockClient(
      JSON.stringify({
        mappings: [
          { topicCode: "1.1", confidence: 0.9 },
          { topicCode: "UNKNOWN", confidence: 0.8 },
        ],
      })
    );
    const result = await classifyChunks(
      [{ index: 0, content: "Cell content" }],
      mockTopics(),
      client
    );

    expect(result[0].mappings).toHaveLength(1);
    expect(result[0].mappings[0].topicId).toBe("topic-1");
  });

  it("clamps confidence to [0, 1]", async () => {
    const client = makeMockClient(
      JSON.stringify({
        mappings: [
          { topicCode: "1.1", confidence: 1.5 },
          { topicCode: "1.2", confidence: -0.3 },
        ],
      })
    );
    const result = await classifyChunks(
      [{ index: 0, content: "Cell content" }],
      mockTopics(),
      client
    );

    expect(result[0].mappings[0].confidence).toBe(1);
    expect(result[0].mappings[1].confidence).toBe(0);
  });

  it("handles Claude returning empty mappings", async () => {
    const client = makeMockClient(JSON.stringify({ mappings: [] }));
    const result = await classifyChunks(
      [{ index: 0, content: "Unrelated content about cooking" }],
      mockTopics(),
      client
    );

    expect(result[0].mappings).toHaveLength(0);
  });

  it("handles invalid JSON response gracefully", async () => {
    const client = makeMockClient("This is not valid JSON at all");
    const result = await classifyChunks(
      [{ index: 0, content: "Some content" }],
      mockTopics(),
      client
    );

    expect(result[0].mappings).toHaveLength(0);
  });

  it("handles API errors gracefully", async () => {
    const client = makeMockClientFailing(new Error("API rate limit exceeded"));
    const result = await classifyChunks(
      [{ index: 0, content: "Some content" }],
      mockTopics(),
      client
    );

    expect(result[0].mappings).toHaveLength(0);
  });

  it("handles response with missing mappings field", async () => {
    const client = makeMockClient(JSON.stringify({ results: [] }));
    const result = await classifyChunks(
      [{ index: 0, content: "Some content" }],
      mockTopics(),
      client
    );

    expect(result[0].mappings).toHaveLength(0);
  });

  it("filters out mappings with invalid types", async () => {
    const client = makeMockClient(
      JSON.stringify({
        mappings: [
          { topicCode: "1.1", confidence: 0.9 },
          { topicCode: 123, confidence: 0.8 },
          { topicCode: "1.2", confidence: "high" },
        ],
      })
    );
    const result = await classifyChunks(
      [{ index: 0, content: "Cell content" }],
      mockTopics(),
      client
    );

    expect(result[0].mappings).toHaveLength(1);
    expect(result[0].mappings[0].topicId).toBe("topic-1");
  });

  it("batches chunks in groups of 5", async () => {
    const client = makeMockClient(
      JSON.stringify({ mappings: [{ topicCode: "1.1", confidence: 0.7 }] })
    );

    const chunks = Array.from({ length: 7 }, (_, i) => ({
      index: i,
      content: `Chunk ${i} about cells`,
    }));

    const result = await classifyChunks(chunks, mockTopics(), client);

    expect(result).toHaveLength(7);
    // First batch of 5 + second batch of 2 = 7 API calls
    expect(client.messages.create).toHaveBeenCalledTimes(7);
  });

  it("uses topic ID as key when code is null", async () => {
    const topicsNoCode: TopicInfo[] = [
      { id: "topic-x" as TopicId, name: "No Code Topic", code: null },
    ];
    const client = makeMockClient(
      JSON.stringify({
        mappings: [{ topicCode: "topic-x", confidence: 0.8 }],
      })
    );

    const result = await classifyChunks(
      [{ index: 0, content: "Content" }],
      topicsNoCode,
      client
    );

    expect(result[0].mappings[0].topicId).toBe("topic-x");
  });
});

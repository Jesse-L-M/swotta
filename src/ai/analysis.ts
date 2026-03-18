import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import path from "path";
import type { TopicId } from "@/lib/types";

export interface TopicInfo {
  id: TopicId;
  name: string;
  code: string | null;
}

export interface ChunkClassification {
  chunkIndex: number;
  mappings: Array<{
    topicId: TopicId;
    confidence: number;
  }>;
}

interface ClassificationResponse {
  mappings: Array<{ topicCode: string; confidence: number }>;
}

let cachedPrompt: string | null = null;

function getClassificationPrompt(): string {
  if (!cachedPrompt) {
    cachedPrompt = readFileSync(
      path.join(process.cwd(), "src", "ai", "prompts", "chunk-classification.md"),
      "utf-8"
    );
  }
  return cachedPrompt;
}

export function clearPromptCache(): void {
  cachedPrompt = null;
}

const BATCH_SIZE = 5;

export async function classifyChunks(
  chunks: Array<{ index: number; content: string }>,
  topics: TopicInfo[],
  client?: Anthropic
): Promise<ChunkClassification[]> {
  if (chunks.length === 0) return [];
  if (topics.length === 0) {
    return chunks.map((c) => ({ chunkIndex: c.index, mappings: [] }));
  }

  const anthropic = client ?? new Anthropic();
  const topicList = topics
    .map((t) => `${t.code ?? t.id}: ${t.name}`)
    .join("\n");

  const results: ChunkClassification[] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((chunk) =>
        classifySingleChunk(anthropic, chunk, topicList, topics)
      )
    );
    results.push(...batchResults);
  }

  return results;
}

async function classifySingleChunk(
  client: Anthropic,
  chunk: { index: number; content: string },
  topicList: string,
  topics: TopicInfo[]
): Promise<ChunkClassification> {
  const codeToId = new Map<string, TopicId>();
  for (const topic of topics) {
    codeToId.set(topic.code ?? topic.id, topic.id);
  }

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: getClassificationPrompt(),
      messages: [
        {
          role: "user",
          content: `Topics:\n${topicList}\n\nText chunk:\n${chunk.content}`,
        },
      ],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const parsed: ClassificationResponse = JSON.parse(text);

    if (!Array.isArray(parsed.mappings)) {
      return { chunkIndex: chunk.index, mappings: [] };
    }

    const mappings = parsed.mappings
      .filter(
        (m) =>
          typeof m.topicCode === "string" &&
          typeof m.confidence === "number" &&
          codeToId.has(m.topicCode)
      )
      .map((m) => ({
        topicId: codeToId.get(m.topicCode)!,
        confidence: Math.max(0, Math.min(1, m.confidence)),
      }));

    return { chunkIndex: chunk.index, mappings };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown classification error";
    const logger = { error: structuredLog };
    logger.error("chunk_classification_failed", {
      chunkIndex: chunk.index,
      error: message,
    });
    return { chunkIndex: chunk.index, mappings: [] };
  }
}

function structuredLog(event: string, data: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "test") {
    process.stderr.write(JSON.stringify({ event, ...data, ts: new Date().toISOString() }) + "\n");
  }
}

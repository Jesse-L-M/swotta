import { readFile } from "fs/promises";
import path from "path";
import type {
  BlockType,
  StudyBlock,
  PolicyValue,
  RetrievalResult,
} from "@/lib/types";

export interface LearnerContext {
  masteryLevel: number;
  knownMisconceptions: string[];
  confirmedMemory: Array<{ category: string; content: string }>;
  preferences: Record<string, unknown>;
  policies: PolicyValue[];
}

const BLOCK_TYPE_TO_FILENAME: Record<BlockType, string> = {
  retrieval_drill: "retrieval-drill.md",
  explanation: "explanation.md",
  worked_example: "worked-example.md",
  timed_problems: "timed-problems.md",
  essay_planning: "essay-planning.md",
  source_analysis: "source-analysis.md",
  mistake_review: "mistake-review.md",
  reentry: "reentry.md",
};

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  retrieval_drill: "Retrieval Drill",
  explanation: "Explanation",
  worked_example: "Worked Example",
  timed_problems: "Timed Problems",
  essay_planning: "Essay Planning",
  source_analysis: "Source Analysis",
  mistake_review: "Mistake Review",
  reentry: "Re-entry",
};

function getPromptsDir(): string {
  return path.resolve(process.cwd(), "src/ai/prompts");
}

const promptCache = new Map<BlockType, string>();

export async function loadPromptTemplate(
  blockType: BlockType
): Promise<string> {
  const cached = promptCache.get(blockType);
  if (cached) {
    return cached;
  }
  const filename = BLOCK_TYPE_TO_FILENAME[blockType];
  const filePath = path.join(getPromptsDir(), filename);
  const content = await readFile(filePath, "utf-8");
  promptCache.set(blockType, content);
  return content;
}

export function clearPromptCache(): void {
  promptCache.clear();
}

function formatPolicies(policies: PolicyValue[]): string {
  if (policies.length === 0) {
    return "No specific policies apply.";
  }
  return policies
    .map(
      (p) =>
        `- **${p.key}** (${p.scopeType}${p.scopeId ? `: ${p.scopeId}` : ""}): ${JSON.stringify(p.value)}`
    )
    .join("\n");
}

function formatSourceChunks(chunks: RetrievalResult[]): string {
  if (chunks.length === 0) {
    return "No source materials available for this topic.";
  }
  return chunks
    .map(
      (chunk, i) =>
        `### Source ${i + 1} (from "${chunk.sourceFileName}")\n\n${chunk.content}`
    )
    .join("\n\n");
}

function formatMisconceptions(misconceptions: string[]): string {
  if (misconceptions.length === 0) {
    return "None recorded.";
  }
  return misconceptions.map((m) => `- ${m}`).join("\n");
}

function formatMemory(
  memory: Array<{ category: string; content: string }>
): string {
  if (memory.length === 0) {
    return "None recorded.";
  }
  return memory.map((m) => `- **${m.category}**: ${m.content}`).join("\n");
}

function formatPreferences(preferences: Record<string, unknown>): string {
  const entries = Object.entries(preferences);
  if (entries.length === 0) {
    return "No specific preferences set.";
  }
  return entries
    .map(([key, value]) => `- **${key}**: ${JSON.stringify(value)}`)
    .join("\n");
}

export async function buildSystemPrompt(
  block: StudyBlock,
  learnerContext: LearnerContext,
  sourceChunks: RetrievalResult[]
): Promise<string> {
  const template = await loadPromptTemplate(block.blockType);
  const label = BLOCK_TYPE_LABELS[block.blockType];

  const sections = [
    `You are Swotta, an AI study tutor. You are running a **${label}** session.`,
    "",
    "## Session Mode Instructions",
    "",
    template,
    "",
    "## Topic Context",
    "",
    `- **Topic**: ${block.topicName}`,
    `- **Session type**: ${label}`,
    `- **Estimated duration**: ${block.durationMinutes} minutes`,
    `- **Session reason**: ${block.reason}`,
    "",
    "## Learner Context",
    "",
    `- **Current mastery level**: ${(learnerContext.masteryLevel * 100).toFixed(0)}%`,
    `- **Known misconceptions**:`,
    formatMisconceptions(learnerContext.knownMisconceptions),
    `- **Confirmed memory**:`,
    formatMemory(learnerContext.confirmedMemory),
    `- **Preferences**:`,
    formatPreferences(learnerContext.preferences),
    "",
    "## Policy Context",
    "",
    formatPolicies(learnerContext.policies),
    "",
    "## Source Materials",
    "",
    formatSourceChunks(sourceChunks),
    "",
    "## Important Guidelines",
    "",
    "- Guide the student to discover answers themselves. Never give answers directly unless reviewing after an attempt.",
    "- Keep responses focused and exam-relevant.",
    "- When the session block is complete, include `<session_status>complete</session_status>` at the very end of your message.",
    "- Do not include the session_status tag until the block is genuinely complete.",
  ];

  return sections.join("\n");
}

export function parseSessionStatus(reply: string): {
  isComplete: boolean;
  cleanReply: string;
} {
  const statusMatch = reply.match(
    /<session_status>(complete)<\/session_status>/
  );
  const isComplete = statusMatch !== null;
  const cleanReply = reply
    .replace(/<session_status>complete<\/session_status>/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { isComplete, cleanReply };
}

export function buildOutcomeExtractionPrompt(
  blockType: BlockType,
  topicName: string
): string {
  return [
    "You are an assessment analysis system. Analyse the preceding study session conversation and extract a structured outcome.",
    "",
    `Session type: ${BLOCK_TYPE_LABELS[blockType]}`,
    `Topic: ${topicName}`,
    "",
    "Respond with ONLY a JSON object (no markdown fences, no explanation) with this exact structure:",
    "",
    "{",
    '  "score": <number 0-100 or null if not assessable>,',
    '  "misconceptions": [',
    '    {',
    '      "description": "<what the student got wrong>",',
    '      "severity": <1|2|3>',
    "    }",
    "  ],",
    '  "helpRequested": <boolean>,',
    '  "helpTiming": <"before_attempt"|"after_attempt"|null>,',
    '  "retentionOutcome": <"remembered"|"partial"|"forgotten"|null>,',
    '  "summary": "<2-3 sentence summary of the session>"',
    "}",
  ].join("\n");
}

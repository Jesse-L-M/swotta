import { readFile } from "fs/promises";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { eq, and, isNull } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { topics, qualifications, qualificationVersions, learnerQualifications } from "@/db/schema";
import type {
  TopicId,
  QualificationVersionId,
  LearnerId,
  TopicTreeNode,
} from "@/lib/types";
import { getTopicTree } from "@/engine/curriculum";
import { processDiagnosticResult, initTopicStates } from "@/engine/mastery";
import { structuredLog } from "@/lib/logger";

const DIAGNOSTIC_MODEL = "claude-sonnet-4-20250514";

export interface DiagnosticTopic {
  id: TopicId;
  name: string;
  code: string | null;
}

export interface DiagnosticProgress {
  explored: string[];
  current: string | null;
  total: number;
  isComplete: boolean;
}

export interface DiagnosticResult {
  topicId: TopicId;
  topicName: string;
  score: number;
  confidence: number;
}

// --- Prompt loading ---

const promptCache = new Map<string, string>();

function getPromptsDir(): string {
  return path.resolve(process.cwd(), "src/ai/prompts");
}

export async function loadDiagnosticPromptSections(): Promise<{
  conversation: string;
  analysis: string;
}> {
  const cacheKey = "diagnostic_full";
  const cached = promptCache.get(cacheKey);
  let content: string;
  if (cached) {
    content = cached;
  } else {
    const filePath = path.join(getPromptsDir(), "diagnostic.md");
    content = await readFile(filePath, "utf-8");
    promptCache.set(cacheKey, content);
  }

  const marker = "<!-- ANALYSIS -->";
  const idx = content.indexOf(marker);
  if (idx === -1) {
    return { conversation: content.trim(), analysis: "" };
  }
  return {
    conversation: content.slice(0, idx).trim(),
    analysis: content.slice(idx + marker.length).trim(),
  };
}

export function clearDiagnosticPromptCache(): void {
  promptCache.clear();
}

// --- Topic fetching ---

export async function getDiagnosticTopics(
  db: Database,
  qualificationVersionId: QualificationVersionId
): Promise<DiagnosticTopic[]> {
  const rows = await db
    .select({
      id: topics.id,
      name: topics.name,
      code: topics.code,
    })
    .from(topics)
    .where(
      and(
        eq(topics.qualificationVersionId, qualificationVersionId),
        isNull(topics.parentTopicId)
      )
    )
    .orderBy(topics.sortOrder);

  return rows.map((r) => ({
    id: r.id as TopicId,
    name: r.name,
    code: r.code,
  }));
}

export async function getQualificationName(
  db: Database,
  qualificationVersionId: QualificationVersionId
): Promise<string | null> {
  const [row] = await db
    .select({ name: qualifications.name })
    .from(qualificationVersions)
    .innerJoin(
      qualifications,
      eq(qualificationVersions.qualificationId, qualifications.id)
    )
    .where(eq(qualificationVersions.id, qualificationVersionId))
    .limit(1);

  return row?.name ?? null;
}

export async function isLearnerEnrolled(
  db: Database,
  learnerId: LearnerId,
  qualificationVersionId: QualificationVersionId
): Promise<boolean> {
  const [row] = await db
    .select({ id: learnerQualifications.id })
    .from(learnerQualifications)
    .where(
      and(
        eq(learnerQualifications.learnerId, learnerId),
        eq(
          learnerQualifications.qualificationVersionId,
          qualificationVersionId
        )
      )
    )
    .limit(1);

  return row !== undefined;
}

// --- System prompt building ---

export async function buildDiagnosticSystemPrompt(
  qualificationName: string,
  diagnosticTopics: DiagnosticTopic[]
): Promise<string> {
  const { conversation } = await loadDiagnosticPromptSections();

  const topicList = diagnosticTopics
    .map((t, i) => `${i + 1}. ${t.name}${t.code ? ` (${t.code})` : ""}`)
    .join("\n");

  return conversation
    .replaceAll("{{QUALIFICATION_NAME}}", qualificationName)
    .replaceAll("{{TOPIC_LIST}}", topicList)
    .replaceAll("{{TOPIC_COUNT}}", String(diagnosticTopics.length));
}

// --- Response parsing ---

export function parseDiagnosticProgress(reply: string): DiagnosticProgress {
  const match = reply.match(
    /<diagnostic_progress>([\s\S]*?)<\/diagnostic_progress>/
  );
  if (!match) {
    return { explored: [], current: null, total: 0, isComplete: false };
  }

  try {
    const data = JSON.parse(match[1]) as {
      explored?: string[];
      current?: string | null;
      total?: number;
    };
    return {
      explored: Array.isArray(data.explored) ? data.explored : [],
      current: typeof data.current === "string" ? data.current : null,
      total: typeof data.total === "number" ? data.total : 0,
      isComplete: false,
    };
  } catch (error: unknown) {
    structuredLog("diagnostic.progress.parse_error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { explored: [], current: null, total: 0, isComplete: false };
  }
}

export function cleanDiagnosticReply(reply: string): string {
  return reply
    .replace(/<diagnostic_progress>[\s\S]*?<\/diagnostic_progress>/g, "")
    .replace(/<diagnostic_complete\s*\/>/g, "")
    .trim();
}

export function isDiagnosticComplete(reply: string): boolean {
  return /<diagnostic_complete\s*\/>/.test(reply);
}

// --- Claude API calls ---

function getAnthropicClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export async function sendDiagnosticMessage(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  client?: Anthropic
): Promise<string> {
  const anthropic = client ?? getAnthropicClient();

  const response = await anthropic.messages.create({
    model: DIAGNOSTIC_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in Claude response");
  }

  return textBlock.text;
}

export async function analyseDiagnosticConversation(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  diagnosticTopics: DiagnosticTopic[],
  qualificationName: string,
  client?: Anthropic
): Promise<DiagnosticResult[]> {
  const anthropic = client ?? getAnthropicClient();
  const { analysis } = await loadDiagnosticPromptSections();

  if (!analysis) {
    throw new Error("Analysis prompt section not found in diagnostic.md");
  }

  const topicList = diagnosticTopics
    .map((t) => `- ${t.name} (ID: ${t.id})`)
    .join("\n");

  const conversationText = messages
    .map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}`)
    .join("\n\n");

  const prompt = analysis
    .replace("{{QUALIFICATION_NAME}}", qualificationName)
    .replace("{{TOPICS}}", topicList)
    .replace("{{CONVERSATION}}", conversationText);

  const response = await anthropic.messages.create({
    model: DIAGNOSTIC_MODEL,
    max_tokens: 2048,
    system:
      "You are an assessment analyst. Analyse the diagnostic conversation and return a JSON array of topic scores.",
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in analysis response");
  }

  const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("No JSON array found in analysis response");
  }

  const parsed: Array<{
    topicId: string;
    topicName: string;
    score: number;
    confidence: number;
  }> = JSON.parse(jsonMatch[0]);

  return parsed.map((r) => ({
    topicId: r.topicId as TopicId,
    topicName: r.topicName,
    score: Math.min(1, Math.max(0, r.score)),
    confidence: Math.min(1, Math.max(0, r.confidence)),
  }));
}

// --- Completion ---

function collectDescendantIds(node: TopicTreeNode): TopicId[] {
  const ids: TopicId[] = [];
  for (const child of node.children) {
    ids.push(child.id);
    ids.push(...collectDescendantIds(child));
  }
  return ids;
}

export async function completeDiagnostic(
  db: Database,
  learnerId: LearnerId,
  qualificationVersionId: QualificationVersionId,
  majorTopicResults: DiagnosticResult[]
): Promise<{ topicsUpdated: number }> {
  await initTopicStates(learnerId, qualificationVersionId, db);

  const tree = await getTopicTree(db, qualificationVersionId);

  const majorTopicMap = new Map<string, TopicTreeNode>();
  for (const node of tree) {
    majorTopicMap.set(node.id, node);
  }

  const allResults: Array<{
    topicId: TopicId;
    score: number;
    confidence: number;
  }> = [];

  for (const result of majorTopicResults) {
    allResults.push({
      topicId: result.topicId,
      score: result.score,
      confidence: result.confidence,
    });

    const node = majorTopicMap.get(result.topicId);
    if (node) {
      const descendantIds = collectDescendantIds(node);
      for (const id of descendantIds) {
        allResults.push({
          topicId: id,
          score: result.score,
          confidence: result.confidence,
        });
      }
    }
  }

  return processDiagnosticResult(learnerId, allResults, db);
}

export async function skipDiagnostic(
  db: Database,
  learnerId: LearnerId,
  qualificationVersionId: QualificationVersionId
): Promise<{ topicsInitialised: number }> {
  const result = await initTopicStates(
    learnerId,
    qualificationVersionId,
    db
  );
  return { topicsInitialised: result.topicsCreated };
}

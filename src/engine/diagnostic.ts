import { readFile } from "fs/promises";
import path from "path";
import { createHash, createHmac, timingSafeEqual } from "crypto";
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
import { getDiagnosticSessionEnv } from "@/lib/env";
import { setQualificationDiagnosticStatus } from "@/lib/pending-diagnostics";

const DIAGNOSTIC_MODEL = "claude-sonnet-4-20250514";
const DIAGNOSTIC_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export const DIAGNOSTIC_START_MESSAGE = "I'm ready to start the diagnostic.";

export interface DiagnosticTopic {
  id: TopicId;
  name: string;
  code: string | null;
}

export interface DiagnosticMessage {
  role: "user" | "assistant";
  content: string;
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

export interface DiagnosticSessionState {
  learnerId: LearnerId;
  qualificationVersionId: QualificationVersionId;
  transcriptHash: string;
  messageCount: number;
  isComplete: boolean;
  expiresAt: number;
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
        eq(learnerQualifications.status, "active"),
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

// --- Diagnostic session integrity ---

export function getDiagnosticSessionSecret(): string {
  const secret = getDiagnosticSessionEnv().DIAGNOSTIC_SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error(
      "DIAGNOSTIC_SESSION_SECRET environment variable is required in production"
    );
  }
  return secret ?? "dev-diagnostic-secret";
}

export function getDiagnosticSessionCookieName(
  qualificationVersionId: QualificationVersionId
): string {
  return `diagnostic_session_${qualificationVersionId}`;
}

export function hashDiagnosticMessages(
  messages: DiagnosticMessage[]
): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        messages.map((message) => ({
          role: message.role,
          content: message.content,
        }))
      )
    )
    .digest("hex");
}

export function createDiagnosticSessionState(
  learnerId: LearnerId,
  qualificationVersionId: QualificationVersionId,
  messages: DiagnosticMessage[],
  isComplete: boolean,
  now: Date = new Date()
): DiagnosticSessionState {
  return {
    learnerId,
    qualificationVersionId,
    transcriptHash: hashDiagnosticMessages(messages),
    messageCount: messages.length,
    isComplete,
    expiresAt: now.getTime() + DIAGNOSTIC_SESSION_TTL_MS,
  };
}

export function generateDiagnosticSessionToken(
  state: DiagnosticSessionState,
  secret?: string
): string {
  const payload = JSON.stringify({
    learnerId: state.learnerId,
    qualificationVersionId: state.qualificationVersionId,
    transcriptHash: state.transcriptHash,
    messageCount: state.messageCount,
    isComplete: state.isComplete,
    expiresAt: state.expiresAt,
  });
  const signature = createHmac(
    "sha256",
    secret ?? getDiagnosticSessionSecret()
  )
    .update(payload)
    .digest("hex");

  return Buffer.from(`${payload}::${signature}`).toString("base64url");
}

function parseDiagnosticSessionState(
  raw: unknown
): DiagnosticSessionState | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const state = raw as Partial<DiagnosticSessionState>;
  if (
    typeof state.learnerId !== "string" ||
    typeof state.qualificationVersionId !== "string" ||
    typeof state.transcriptHash !== "string" ||
    typeof state.messageCount !== "number" ||
    !Number.isInteger(state.messageCount) ||
    state.messageCount < 0 ||
    typeof state.isComplete !== "boolean" ||
    typeof state.expiresAt !== "number"
  ) {
    return null;
  }

  return {
    learnerId: state.learnerId as LearnerId,
    qualificationVersionId:
      state.qualificationVersionId as QualificationVersionId,
    transcriptHash: state.transcriptHash,
    messageCount: state.messageCount,
    isComplete: state.isComplete,
    expiresAt: state.expiresAt,
  };
}

export function verifyDiagnosticSessionToken(
  token: string,
  secret?: string
): DiagnosticSessionState | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts = decoded.split("::");
    if (parts.length !== 2) {
      return null;
    }

    const [payload, signature] = parts;
    if (!payload || !signature) {
      return null;
    }

    const expected = createHmac(
      "sha256",
      secret ?? getDiagnosticSessionSecret()
    )
      .update(payload)
      .digest("hex");

    const actualBuffer = Buffer.from(signature, "utf-8");
    const expectedBuffer = Buffer.from(expected, "utf-8");
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      return null;
    }

    const state = parseDiagnosticSessionState(JSON.parse(payload));
    if (!state || state.expiresAt < Date.now()) {
      return null;
    }

    return state;
  } catch (error: unknown) {
    structuredLog("diagnostic.session.verify_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function matchesDiagnosticTranscript(
  messages: DiagnosticMessage[],
  state: DiagnosticSessionState
): boolean {
  return (
    messages.length === state.messageCount &&
    hashDiagnosticMessages(messages) === state.transcriptHash
  );
}

export function extendsDiagnosticTranscript(
  messages: DiagnosticMessage[],
  state: DiagnosticSessionState
): boolean {
  if (messages.length !== state.messageCount + 1) {
    return false;
  }

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== "user") {
    return false;
  }

  return (
    hashDiagnosticMessages(messages.slice(0, -1)) === state.transcriptHash
  );
}

export function normaliseDiagnosticResults(
  results: DiagnosticResult[],
  diagnosticTopics: DiagnosticTopic[]
): DiagnosticResult[] {
  const topicMap = new Map(
    diagnosticTopics.map((topic) => [topic.id, topic] as const)
  );
  const seen = new Set<string>();
  const normalised: DiagnosticResult[] = [];
  let droppedCount = 0;

  for (const result of results) {
    const topic = topicMap.get(result.topicId);
    if (!topic || seen.has(result.topicId)) {
      droppedCount++;
      continue;
    }

    seen.add(result.topicId);
    normalised.push({
      topicId: topic.id,
      topicName: topic.name,
      score: Math.min(1, Math.max(0, result.score)),
      confidence: Math.min(1, Math.max(0, result.confidence)),
    });
  }

  if (droppedCount > 0) {
    structuredLog("diagnostic.analysis.filtered_results", {
      droppedCount,
      expectedTopics: diagnosticTopics.length,
      acceptedTopics: normalised.length,
    });
  }

  return normalised;
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
  messages: DiagnosticMessage[],
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
  messages: DiagnosticMessage[],
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

  return normaliseDiagnosticResults(
    parsed.map((r) => ({
      topicId: r.topicId as TopicId,
      topicName: r.topicName,
      score: r.score,
      confidence: r.confidence,
    })),
    diagnosticTopics
  );
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
  return db.transaction(async (tx) => {
    const transactionalDb = tx as unknown as Database;

    await initTopicStates(
      learnerId,
      qualificationVersionId,
      transactionalDb
    );

    const tree = await getTopicTree(transactionalDb, qualificationVersionId);

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

    const diagnosticResult = await processDiagnosticResult(
      learnerId,
      allResults,
      transactionalDb
    );

    await setQualificationDiagnosticStatus(
      transactionalDb,
      learnerId,
      qualificationVersionId,
      "completed",
      { expectedCurrentStatus: "pending" }
    );

    return diagnosticResult;
  });
}

export async function skipDiagnostic(
  db: Database,
  learnerId: LearnerId,
  qualificationVersionId: QualificationVersionId
): Promise<{ topicsInitialised: number }> {
  return db.transaction(async (tx) => {
    const transactionalDb = tx as unknown as Database;
    const result = await initTopicStates(
      learnerId,
      qualificationVersionId,
      transactionalDb
    );

    await setQualificationDiagnosticStatus(
      transactionalDb,
      learnerId,
      qualificationVersionId,
      "skipped",
      { expectedCurrentStatus: "pending" }
    );

    return { topicsInitialised: result.topicsCreated };
  });
}

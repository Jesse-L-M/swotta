import { readFile } from "fs/promises";
import path from "path";
import type {
  BlockType,
  StudyBlock,
  PolicyValue,
  RetrievalResult,
} from "@/lib/types";
import { BLOCK_TYPE_LABELS } from "@/lib/labels";
import type { PastPaperSessionIntelligence } from "@/engine/past-paper";

export type ExamSessionContext =
  | ({ source: "past_paper" } & PastPaperSessionIntelligence)
  | {
      source: "fallback";
      qualificationVersionId: string | null;
      topicId: string;
      topicName: string;
      reason: string;
    };

export interface LearnerContext {
  masteryLevel: number;
  knownMisconceptions: string[];
  confirmedMemory: Array<{ category: string; content: string }>;
  preferences: Record<string, unknown>;
  policies: PolicyValue[];
  examSession?: ExamSessionContext | null;
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

function getPromptsDir(): string {
  return path.resolve(process.cwd(), "src/ai/prompts");
}

const promptCache = new Map<string, string>();

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

async function loadOutcomeExtractionTemplate(): Promise<string> {
  const cacheKey = "_outcome_extraction";
  const cached = promptCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const filePath = path.join(getPromptsDir(), "outcome-extraction.md");
  const content = await readFile(filePath, "utf-8");
  promptCache.set(cacheKey, content);
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

function formatExamCommandWords(
  commandWords: PastPaperSessionIntelligence["commandWords"]
): string {
  if (commandWords.length === 0) {
    return "None recorded.";
  }

  return commandWords
    .map(
      (commandWord) =>
        `- **${commandWord.word}** (${commandWord.count} questions, ${commandWord.totalMarks} marks): ${commandWord.definition}`
    )
    .join("\n");
}

function formatExamQuestionTypes(
  questionTypes: PastPaperSessionIntelligence["questionTypes"]
): string {
  if (questionTypes.length === 0) {
    return "None recorded.";
  }

  return questionTypes
    .map((questionType) => {
      const pattern = questionType.markSchemePattern
        ? ` Mark scheme pattern: ${questionType.markSchemePattern}.`
        : "";
      return `- **${questionType.name}** (${questionType.count} questions, ${questionType.totalMarks} marks).${pattern}`;
    })
    .join("\n");
}

function formatExamSignals(
  signals: PastPaperSessionIntelligence["examTechniqueSignals"]
): string {
  if (signals.length === 0) {
    return "None recorded.";
  }

  return signals
    .map(
      (signal) =>
        `- **${signal.label}** (${signal.count} questions): ${signal.note}`
    )
    .join("\n");
}

function formatReferenceQuestions(
  questions: PastPaperSessionIntelligence["referenceQuestions"]
): string {
  if (questions.length === 0) {
    return "None recorded.";
  }

  return questions
    .map((question, index) => {
      const commandWord = question.commandWord
        ? `${question.commandWord.word} — ${question.commandWord.definition}`
        : "No command word stored.";
      const markSchemePattern =
        question.questionType.markSchemePattern ?? "No explicit pattern stored.";
      const techniqueSignals =
        question.examTechniqueSignals.length > 0
          ? question.examTechniqueSignals
              .map((signal) => `${signal.label}: ${signal.note}`)
              .join(" | ")
          : "None recorded.";
      const markSchemeSignals =
        question.markSchemeSignals.length > 0
          ? question.markSchemeSignals
              .map((signal) => `${signal.label}: ${signal.note}`)
              .join(" | ")
          : "None recorded.";

      return [
        `### Reference Question ${index + 1}`,
        `- **Paper**: ${question.examYear} ${question.series} ${question.componentCode} ${question.componentName}`,
        `- **Question**: ${question.locator} (${question.marksAvailable} marks)`,
        `- **Prompt excerpt**: ${question.promptExcerpt}`,
        `- **Command word**: ${commandWord}`,
        `- **Question type**: ${question.questionType.name}`,
        `- **Mark scheme pattern**: ${markSchemePattern}`,
        `- **Exam technique signals**: ${techniqueSignals}`,
        `- **Mark scheme signals**: ${markSchemeSignals}`,
      ].join("\n");
    })
    .join("\n\n");
}

function formatExamSession(examSession: ExamSessionContext | null | undefined): string {
  if (!examSession) {
    return "";
  }

  if (examSession.source === "fallback") {
    return examSession.reason;
  }

  return [
    `- **Coverage**: ${examSession.questionCount} questions across ${examSession.paperCount} papers (${examSession.totalMarks} total marks).`,
    `- **Observed mark allocations**: ${examSession.marks.distinct.join(", ")} marks (average ${examSession.marks.average}).`,
    `- **Common command words**:`,
    formatExamCommandWords(examSession.commandWords),
    `- **Common question types**:`,
    formatExamQuestionTypes(examSession.questionTypes),
    `- **Recurring exam-technique signals**:`,
    formatExamSignals(examSession.examTechniqueSignals),
    `- **Recurring mark-scheme signals**:`,
    formatExamSignals(examSession.markSchemeSignals),
    `- **Reference questions to mirror**:`,
    formatReferenceQuestions(examSession.referenceQuestions),
  ].join("\n");
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
    ...(learnerContext.examSession
      ? [
          "## Exam Intelligence",
          "",
          formatExamSession(learnerContext.examSession),
          "",
        ]
      : []),
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
    "- If an Exam Intelligence section is present, ground the question choice, mark allocations, mark-scheme feedback, and technique coaching in that structured data instead of generic boilerplate.",
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

export async function buildOutcomeExtractionPrompt(
  blockType: BlockType,
  topicName: string
): Promise<string> {
  const template = await loadOutcomeExtractionTemplate();
  return template
    .replace("{{SESSION_TYPE}}", BLOCK_TYPE_LABELS[blockType])
    .replace("{{TOPIC}}", topicName);
}

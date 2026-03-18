import { readFile } from "fs/promises";
import path from "path";
import { eq, and, inArray, desc } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  commandWords,
  blockAttempts,
  studyBlocks,
  learnerQualifications,
} from "@/db/schema";
import type { LearnerId } from "@/lib/types";

export interface TechniqueMastery {
  commandWord: string;
  definition: string;
  expectedDepth: number;
  questionsAttempted: number;
  avgScore: number | null;
  trend: "improving" | "stable" | "declining" | "insufficient_data";
}

export interface CommandWordContext {
  word: string;
  definition: string;
  expectedDepth: number;
}

interface AttemptWithMeta {
  score: string | null;
  createdAt: Date;
}

function computeTrend(attempts: AttemptWithMeta[]): TechniqueMastery["trend"] {
  const scored = attempts
    .filter((a) => a.score !== null)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  if (scored.length < 3) {
    return "insufficient_data";
  }

  const midpoint = Math.floor(scored.length / 2);
  const firstHalf = scored.slice(0, midpoint);
  const secondHalf = scored.slice(midpoint);

  const avg = (items: AttemptWithMeta[]) =>
    items.reduce((sum, a) => sum + Number(a.score), 0) / items.length;

  const firstAvg = avg(firstHalf);
  const secondAvg = avg(secondHalf);
  const delta = secondAvg - firstAvg;

  if (delta > 5) return "improving";
  if (delta < -5) return "declining";
  return "stable";
}

export async function getTechniqueMastery(
  db: Database,
  learnerId: LearnerId
): Promise<TechniqueMastery[]> {
  const qualRows = await db
    .select({
      qualificationVersionId: learnerQualifications.qualificationVersionId,
    })
    .from(learnerQualifications)
    .where(
      and(
        eq(learnerQualifications.learnerId, learnerId),
        eq(learnerQualifications.status, "active")
      )
    );

  if (qualRows.length === 0) {
    return [];
  }

  const qualVersionIds = qualRows.map((r) => r.qualificationVersionId);

  const allCommandWords = await db
    .select({
      id: commandWords.id,
      word: commandWords.word,
      definition: commandWords.definition,
      expectedDepth: commandWords.expectedDepth,
      qualificationVersionId: commandWords.qualificationVersionId,
    })
    .from(commandWords)
    .where(inArray(commandWords.qualificationVersionId, qualVersionIds));

  if (allCommandWords.length === 0) {
    return [];
  }

  const deduped = new Map<
    string,
    { word: string; definition: string; expectedDepth: number }
  >();
  for (const cw of allCommandWords) {
    const key = cw.word.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, {
        word: cw.word,
        definition: cw.definition,
        expectedDepth: cw.expectedDepth,
      });
    }
  }

  const attemptRows = await db
    .select({
      score: blockAttempts.score,
      notes: blockAttempts.notes,
      createdAt: blockAttempts.createdAt,
    })
    .from(blockAttempts)
    .innerJoin(studyBlocks, eq(blockAttempts.blockId, studyBlocks.id))
    .where(eq(studyBlocks.learnerId, learnerId))
    .orderBy(desc(blockAttempts.createdAt));

  const commandWordAttempts = new Map<string, AttemptWithMeta[]>();

  const wordPatterns = new Map<string, RegExp>();
  for (const [key] of deduped) {
    wordPatterns.set(key, new RegExp(`\\b${key}\\b`, "i"));
  }

  for (const row of attemptRows) {
    if (!row.notes) continue;

    for (const [key] of deduped) {
      if (wordPatterns.get(key)!.test(row.notes)) {
        const existing = commandWordAttempts.get(key) ?? [];
        existing.push({ score: row.score, createdAt: row.createdAt });
        commandWordAttempts.set(key, existing);
      }
    }
  }

  const results: TechniqueMastery[] = [];

  for (const [key, cw] of deduped) {
    const attempts = commandWordAttempts.get(key) ?? [];
    const scored = attempts.filter((a) => a.score !== null);
    const avgScore =
      scored.length > 0
        ? Math.round(
            (scored.reduce((sum, a) => sum + Number(a.score), 0) /
              scored.length) *
              10
          ) / 10
        : null;

    results.push({
      commandWord: cw.word,
      definition: cw.definition,
      expectedDepth: cw.expectedDepth,
      questionsAttempted: attempts.length,
      avgScore,
      trend: computeTrend(attempts),
    });
  }

  results.sort((a, b) => a.commandWord.localeCompare(b.commandWord));

  return results;
}

export async function getCommandWordsForQualification(
  db: Database,
  qualificationVersionId: string
): Promise<CommandWordContext[]> {
  const rows = await db
    .select({
      word: commandWords.word,
      definition: commandWords.definition,
      expectedDepth: commandWords.expectedDepth,
    })
    .from(commandWords)
    .where(eq(commandWords.qualificationVersionId, qualificationVersionId))
    .orderBy(commandWords.word);

  return rows;
}

const DEPTH_LABELS: Record<number, string> = {
  1: "recall",
  2: "application",
  3: "analysis",
  4: "evaluation",
};

let coachingTemplateCache: string | null = null;

async function loadCoachingTemplate(): Promise<string> {
  if (coachingTemplateCache) {
    return coachingTemplateCache;
  }
  const filePath = path.resolve(
    process.cwd(),
    "src/ai/prompts/command-word-coaching.md"
  );
  const content = await readFile(filePath, "utf-8");
  coachingTemplateCache = content;
  return content;
}

export function clearCoachingTemplateCache(): void {
  coachingTemplateCache = null;
}

function buildCommandWordTable(words: CommandWordContext[]): string {
  return words
    .map((w) => {
      const depth = DEPTH_LABELS[w.expectedDepth] ?? `level ${w.expectedDepth}`;
      return `| ${w.word} | ${w.definition} | ${depth} |`;
    })
    .join("\n");
}

export async function formatCommandWordSection(
  words: CommandWordContext[]
): Promise<string> {
  if (words.length === 0) {
    return "";
  }

  const template = await loadCoachingTemplate();
  const table = buildCommandWordTable(words);
  return template.replace("{{COMMAND_WORD_TABLE}}", table);
}

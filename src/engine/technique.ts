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

  for (const row of attemptRows) {
    if (!row.notes) continue;
    const notesLower = row.notes.toLowerCase();

    for (const [key] of deduped) {
      if (notesLower.includes(key)) {
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

export function formatCommandWordSection(
  words: CommandWordContext[]
): string {
  if (words.length === 0) {
    return "";
  }

  const depthLabels: Record<number, string> = {
    1: "recall",
    2: "application",
    3: "analysis",
    4: "evaluation",
  };

  const lines = [
    "## Command Word Definitions",
    "",
    "When you use a command word in a question, explicitly coach the student on what it requires.",
    'For example: "This says \'evaluate\' — that means weigh up both sides and reach a judgement."',
    "",
    "| Command Word | Definition | Depth |",
    "|---|---|---|",
  ];

  for (const w of words) {
    const depth = depthLabels[w.expectedDepth] ?? `level ${w.expectedDepth}`;
    lines.push(`| ${w.word} | ${w.definition} | ${depth} |`);
  }

  lines.push("");
  lines.push("## Mark Scheme Coaching");
  lines.push("");
  lines.push("When setting questions, always state the marks available and coach the student on mark allocation:");
  lines.push("");
  lines.push("- A 1-mark question wants one clear point.");
  lines.push('- A 2-mark "describe" question wants two distinct points.');
  lines.push('- A 4-mark "explain" question wants 2 points, each with a reason (point + reason = 2 marks each).');
  lines.push('- A 6-mark "evaluate" question requires evidence for AND against, plus a justified conclusion.');
  lines.push("- Extended response (6+ marks): look for logical structure, specialist terminology, and a clear line of reasoning.");
  lines.push("");
  lines.push("## Timed Practice Awareness");
  lines.push("");
  lines.push("When the session involves timed practice or exam-style questions:");
  lines.push("");
  lines.push("- State the recommended time per question based on marks (roughly 1 minute per mark, plus reading time).");
  lines.push('- For example: "You have about 5 minutes for this 4-mark question."');
  lines.push("- If the student is spending too long, gently prompt them to move on.");
  lines.push("- After the session, reflect on pacing: did they manage time well?");

  return lines.join("\n");
}

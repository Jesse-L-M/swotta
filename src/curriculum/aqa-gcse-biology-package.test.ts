import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  commandWords,
  misconceptionRules,
  questionTypes,
  sourceMappings,
  taskRules,
  topics,
} from "@/db/schema";
import { getTestDb } from "@/test/setup";
import { extractCurriculumDraft } from "./extract";
import { renderCurriculumReviewReport } from "./review-report";
import { seedCurriculumInput } from "./seed";
import type { ApprovedCurriculumPackage, CandidateCurriculumPackage } from "./schema";
import { validateCurriculumPackage } from "./validation";
import { verifyCurriculumInput } from "./verify";
import { normalizeCurriculumDraft } from "./normalize";

const fixtureDirectory = path.resolve(
  process.cwd(),
  "src/curriculum/__fixtures__/aqa-gcse-biology-8461"
);

function loadJsonFile<T>(filename: string): T {
  return JSON.parse(
    readFileSync(path.join(fixtureDirectory, filename), "utf8")
  ) as T;
}

function loadTextFile(filename: string): string {
  return readFileSync(path.join(fixtureDirectory, filename), "utf8");
}

async function buildCandidatePackage(): Promise<CandidateCurriculumPackage> {
  const request = loadJsonFile("extract-request.json");
  const extraction = await extractCurriculumDraft(request, {
    baseDirectory: fixtureDirectory,
  });

  expect(extraction.ok).toBe(true);
  expect(extraction.errors).toEqual([]);
  expect(extraction.warnings).toEqual([]);
  expect(extraction.stats).toMatchObject({
    sources: 4,
    topics: 126,
    edges: 13,
    commandWords: 28,
    questionTypes: 4,
    misconceptionRules: 12,
    taskRules: 12,
  });
  expect(extraction.draft).not.toBeNull();

  const normalization = normalizeCurriculumDraft(extraction.draft);

  expect(normalization.ok).toBe(true);
  expect(normalization.errors).toEqual([]);
  expect(normalization.warnings).toEqual([]);
  expect(normalization.validation?.ok).toBe(true);
  expect(normalization.package).not.toBeNull();

  const candidatePackage = structuredClone(
    normalization.package
  ) as CandidateCurriculumPackage;

  candidatePackage.metadata.updatedAt = "2026-03-28T20:15:00.000Z";
  candidatePackage.review = {
    status: "in_review",
    reviewers: [
      {
        name: "Codex curriculum rebuild",
        role: "ai",
        outcome: "commented",
        reviewedAt: "2026-03-28T20:15:00.000Z",
        notes:
          "Rebuilt from official AQA specification pages, AQA command-word guidance, and June 2023 examiner reports. Candidate awaits human review before approval or reference promotion.",
      },
    ],
  };
  candidatePackage.annotations = {
    markSchemePatterns: [
      {
        id: "mark-scheme-comparative-pairing",
        label: "Comparative pairing",
        description:
          "Comparative questions reward paired similarities or differences, not isolated facts about only one side.",
        questionTypeId: "question-type-structured",
      },
      {
        id: "mark-scheme-graph-precision",
        label: "Graph precision",
        description:
          "Graph marks depend on sensible scales, precise plotted points, and appropriate best-fit lines or curves.",
        questionTypeId: "question-type-structured",
      },
      {
        id: "mark-scheme-causal-chain",
        label: "Causal chain",
        description:
          "Open responses gain credit when biological mechanisms are linked into a clear cause-effect chain.",
        questionTypeId: "question-type-open-response",
      },
    ],
    examTechniquePatterns: [
      {
        id: "exam-technique-compare-paired",
        label: "Compare in pairs",
        description:
          "When the command word is Compare, write matched statements that mention both items explicitly.",
        commandWordId: "command-word-compare",
      },
      {
        id: "exam-technique-explain-consequence",
        label: "Explain then consequence",
        description:
          "For Explain, state the mechanism first and then connect it to the biological outcome.",
        commandWordId: "command-word-explain",
      },
      {
        id: "exam-technique-evaluate-judgement",
        label: "Evaluate with judgement",
        description:
          "For Evaluate, weigh evidence for and against before reaching a final judgement.",
        commandWordId: "command-word-evaluate",
      },
    ],
  };

  const validation = validateCurriculumPackage(candidatePackage);
  expect(validation.ok).toBe(true);
  expect(validation.errors).toEqual([]);
  expect(validation.warnings).toEqual([]);

  return candidatePackage;
}

function buildApprovedEnvelope(
  candidatePackage: CandidateCurriculumPackage
): ApprovedCurriculumPackage {
  const approvedPackage = structuredClone(
    candidatePackage
  ) as ApprovedCurriculumPackage;

  approvedPackage.lifecycle = "approved";
  approvedPackage.review = {
    status: "approved",
    approvedAt: "2026-03-28T20:30:00.000Z",
    reviewers: [
      ...candidatePackage.review.reviewers,
      {
        name: "Fixture approval wrapper",
        role: "human",
        outcome: "approved",
        reviewedAt: "2026-03-28T20:30:00.000Z",
        notes:
          "Test-only approval wrapper used to exercise seed and verify while the committed fixture remains a candidate pending real human sign-off.",
      },
    ],
  };

  return approvedPackage;
}

describe("AQA GCSE Biology rebuilt package", () => {
  it("rebuilds the committed candidate package and review artifact from source fixtures", async () => {
    const builtPackage = await buildCandidatePackage();
    const committedPackage =
      loadJsonFile<CandidateCurriculumPackage>("candidate-package.json");
    const committedReport = loadTextFile("review-report.md");

    expect(builtPackage).toEqual(committedPackage);
    expect(builtPackage.topics).toHaveLength(126);
    expect(
      builtPackage.topics.filter((topic) => topic.parentId === null)
    ).toHaveLength(8);
    expect(
      builtPackage.topics.some((topic) => topic.code === "4.8")
    ).toBe(true);
    expect(builtPackage.sourceMappings).toHaveLength(126);
    expect(builtPackage.commandWords).toHaveLength(28);
    expect(builtPackage.misconceptionRules).toHaveLength(12);
    expect(builtPackage.taskRules).toHaveLength(12);
    expect(builtPackage.taskRules.filter((rule) => !rule.topicId)).toHaveLength(3);

    const rendered = renderCurriculumReviewReport(builtPackage);
    expect(rendered.report.ok).toBe(true);
    expect(rendered.text).toBe(committedReport.trimEnd());
    expect(rendered.text).toContain("## Topic Tree Summary");
    expect(rendered.text).toContain("- 4.8 Key ideas");
    expect(rendered.text).toContain("## Annotations");
  });

  it("exercises verify and seed with a test-only approval wrapper", async () => {
    const db = getTestDb();
    const approvedPackage = buildApprovedEnvelope(await buildCandidatePackage());

    const verification = await verifyCurriculumInput(approvedPackage, { db });
    expect(verification.ok).toBe(true);
    expect(verification.normalizedFrom).toBe("package");
    expect(verification.qualificationVersionPersistence).toBe("dry_run_only");

    const seeded = await seedCurriculumInput(approvedPackage, { db });
    expect(seeded.lifecycle).toBe("approved");
    expect(seeded.normalizedFrom).toBe("package");
    expect(seeded.topicsCreated).toBe(126);
    expect(seeded.edgesCreated).toBe(13);
    expect(seeded.adapterNotes.map((note) => note.code)).toEqual([
      "annotations_not_seeded",
      "global_task_rules_not_seeded",
    ]);

    const seededTopics = await db
      .select()
      .from(topics)
      .where(eq(topics.qualificationVersionId, seeded.qualificationVersionId));
    const seededCommandWords = await db
      .select()
      .from(commandWords)
      .where(
        eq(commandWords.qualificationVersionId, seeded.qualificationVersionId)
      );
    const seededQuestionTypes = await db
      .select()
      .from(questionTypes)
      .where(
        eq(questionTypes.qualificationVersionId, seeded.qualificationVersionId)
      );
    const seededTaskRules = await db
      .select()
      .from(taskRules)
      .innerJoin(topics, eq(taskRules.topicId, topics.id))
      .where(eq(topics.qualificationVersionId, seeded.qualificationVersionId));
    const seededSourceMappings = await db.select().from(sourceMappings);
    const seededMisconceptions = await db
      .select()
      .from(misconceptionRules);

    expect(seededTopics).toHaveLength(126);
    expect(seededCommandWords).toHaveLength(28);
    expect(seededQuestionTypes).toHaveLength(4);
    expect(seededTaskRules).toHaveLength(9);
    expect(seededSourceMappings).toHaveLength(126);
    expect(seededMisconceptions).toHaveLength(12);
  });
});

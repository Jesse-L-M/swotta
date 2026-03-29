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
import { normalizeCurriculumDraft } from "./normalize";
import { renderCurriculumReviewReport } from "./review-report";
import { seedCurriculumInput } from "./seed";
import type { ApprovedCurriculumPackage, CandidateCurriculumPackage } from "./schema";
import { validateCurriculumPackage } from "./validation";
import { verifyCurriculumInput } from "./verify";

const fixtureDirectory = path.resolve(
  process.cwd(),
  "src/curriculum/__fixtures__/aqa-gcse-chemistry-8462"
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
    topics: 165,
    edges: 18,
    commandWords: 28,
    questionTypes: 4,
    misconceptionRules: 12,
    taskRules: 10,
  });
  expect(extraction.draft).not.toBeNull();

  const normalization = normalizeCurriculumDraft(extraction.draft);

  expect(normalization.ok).toBe(true);
  expect(normalization.errors).toEqual([]);
  expect(normalization.warnings).toEqual([]);
  expect(normalization.validation?.ok).toBe(true);
  expect(normalization.package).not.toBeNull();

  const candidatePackage = JSON.parse(
    JSON.stringify(normalization.package)
  ) as CandidateCurriculumPackage;
  const validation = validateCurriculumPackage(candidatePackage);
  expect(validation.ok).toBe(true);
  expect(validation.errors).toEqual([]);
  expect(validation.warnings).toEqual([]);

  return candidatePackage;
}

function buildApprovedEnvelope(
  candidatePackage: CandidateCurriculumPackage
): ApprovedCurriculumPackage {
  return {
    ...structuredClone(candidatePackage),
    lifecycle: "approved",
    review: {
      status: "approved",
      approvedAt: "2026-03-28T21:45:00.000Z",
      reviewers: [
        ...candidatePackage.review.reviewers,
        {
          name: "Fixture approval wrapper",
          role: "human",
          outcome: "approved",
          reviewedAt: "2026-03-28T21:45:00.000Z",
          notes:
            "Test-only approval wrapper used to exercise seed and verify while the committed Chemistry fixture remains a candidate pending human sign-off.",
        },
      ],
    },
  };
}

describe("AQA GCSE Chemistry rebuilt package", () => {
  it("rebuilds the committed candidate package and review artifact from source fixtures", async () => {
    const builtPackage = await buildCandidatePackage();
    const committedPackage =
      loadJsonFile<CandidateCurriculumPackage>("candidate-package.json");
    const committedReport = loadTextFile("review-report.md");

    expect(builtPackage).toEqual(committedPackage);
    expect(builtPackage.topics).toHaveLength(165);
    expect(
      builtPackage.topics.filter((topic) => topic.parentId === null)
    ).toHaveLength(11);
    expect(
      builtPackage.topics.some((topic) => topic.code === "4.10.4")
    ).toBe(true);
    expect(builtPackage.sourceMappings).toHaveLength(238);
    expect(builtPackage.commandWords).toHaveLength(28);
    expect(builtPackage.misconceptionRules).toHaveLength(12);
    expect(builtPackage.taskRules).toHaveLength(10);
    expect(builtPackage.taskRules.filter((rule) => !rule.topicId)).toHaveLength(0);
    expect(builtPackage.metadata.updatedAt).toBeUndefined();
    expect(builtPackage.review.status).toBe("unreviewed");
    expect(builtPackage.review.reviewers).toEqual([]);
    expect(builtPackage.annotations).toBeUndefined();
    expect(
      new Set(builtPackage.sourceMappings.map((mapping) => mapping.sourceId))
    ).toEqual(
      new Set([
        "aqa-chemistry-8462-spec",
        "aqa-science-command-words",
        "aqa-84621h-jun23-report",
        "aqa-84622h-jun23-report",
      ])
    );

    const rendered = renderCurriculumReviewReport(builtPackage);
    expect(rendered.report.ok).toBe(true);
    expect(rendered.text).toBe(committedReport.trimEnd());
    expect(rendered.text).toContain("## Topic Tree Summary");
    expect(rendered.text).toContain(
      "- 4.10.4 The Haber process and the use of NPK fertilisers (chemistry only)"
    );
    expect(rendered.text).toContain("Task rules (10 rules)");
    expect(rendered.text).toContain("Source mappings (238 mappings)");
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
    expect(seeded.topicsCreated).toBe(165);
    expect(seeded.edgesCreated).toBe(18);
    expect(seeded.adapterNotes).toEqual([]);

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

    expect(seededTopics).toHaveLength(165);
    expect(seededCommandWords).toHaveLength(28);
    expect(seededQuestionTypes).toHaveLength(4);
    expect(seededTaskRules).toHaveLength(10);
    expect(seededSourceMappings).toHaveLength(238);
    expect(seededMisconceptions).toHaveLength(12);
  });
});

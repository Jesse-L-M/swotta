import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import legacyBiologySeed from "@/data/seeds/gcse-biology-aqa.json";
import {
  assessmentComponents,
  assignments,
  commandWords,
  confidenceEvents,
  learnerComponentState,
  learnerTopicState,
  misconceptionEvents,
  misconceptionRules,
  questionTypes,
  retentionEvents,
  reviewQueue,
  sourceChunks,
  sourceCollections,
  sourceFiles,
  sourceMappings,
  studyBlocks,
  taskRules,
  teacherNotes,
  topics,
} from "@/db/schema";
import {
  createTestLearner,
  createTestOrg,
  createTestUser,
  enrollLearnerInQualification,
} from "@/test/fixtures";
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
    taskRules: 9,
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
  const approvedPackage: ApprovedCurriculumPackage = {
    ...structuredClone(candidatePackage),
    lifecycle: "approved",
    review: {
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
    },
  };

  return approvedPackage;
}

async function loadTopicIdsByCode(
  db: ReturnType<typeof getTestDb>,
  qualificationVersionId: string
): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: topics.id, code: topics.code })
    .from(topics)
    .where(eq(topics.qualificationVersionId, qualificationVersionId));

  return new Map(
    rows.flatMap((row) => (row.code ? [[row.code, row.id] as const] : []))
  );
}

async function loadComponentIdsByCode(
  db: ReturnType<typeof getTestDb>,
  qualificationVersionId: string
): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: assessmentComponents.id, code: assessmentComponents.code })
    .from(assessmentComponents)
    .where(
      eq(assessmentComponents.qualificationVersionId, qualificationVersionId)
    );

  return new Map(rows.map((row) => [row.code, row.id] as const));
}

async function createManualSourceChunk(
  db: ReturnType<typeof getTestDb>,
  uploadedByUserId: string,
  suffix: string
): Promise<string> {
  const [collection] = await db
    .insert(sourceCollections)
    .values({
      scope: "system",
      name: `legacy-biology-${suffix}`,
      description: "Manual test collection for Biology migration coverage",
    })
    .returning();
  const [file] = await db
    .insert(sourceFiles)
    .values({
      collectionId: collection.id,
      uploadedByUserId,
      filename: `${suffix}.txt`,
      mimeType: "text/plain",
      storagePath: `manual/${suffix}.txt`,
      sizeBytes: 32,
    })
    .returning();
  const [chunk] = await db
    .insert(sourceChunks)
    .values({
      fileId: file.id,
      content: `Legacy Biology ${suffix}`,
      chunkIndex: 0,
      tokenCount: 3,
    })
    .returning();

  return chunk.id;
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
    expect(builtPackage.sourceMappings).toHaveLength(198);
    expect(builtPackage.commandWords).toHaveLength(28);
    expect(builtPackage.misconceptionRules).toHaveLength(12);
    expect(builtPackage.taskRules).toHaveLength(9);
    expect(builtPackage.taskRules.filter((rule) => !rule.topicId)).toHaveLength(0);
    expect(builtPackage.metadata.updatedAt).toBeUndefined();
    expect(builtPackage.review.status).toBe("unreviewed");
    expect(builtPackage.review.reviewers).toEqual([]);
    expect(builtPackage.annotations).toBeUndefined();
    expect(
      new Set(builtPackage.sourceMappings.map((mapping) => mapping.sourceId))
    ).toEqual(
      new Set([
        "aqa-biology-8461-spec",
        "aqa-science-command-words",
        "aqa-8461-1h-jun23-report",
        "aqa-8461-2h-jun23-report",
      ])
    );

    const rendered = renderCurriculumReviewReport(builtPackage);
    expect(rendered.report.ok).toBe(true);
    expect(rendered.text).toBe(committedReport.trimEnd());
    expect(rendered.text).toContain("## Topic Tree Summary");
    expect(rendered.text).toContain("- 4.8 Key ideas");
    expect(rendered.text).toContain("Source mappings (198 mappings)");
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

    expect(seededTopics).toHaveLength(126);
    expect(seededCommandWords).toHaveLength(28);
    expect(seededQuestionTypes).toHaveLength(4);
    expect(seededTaskRules).toHaveLength(9);
    expect(seededSourceMappings).toHaveLength(198);
    expect(seededMisconceptions).toHaveLength(12);
  });

  it("replaces the legacy Biology 8461 core in place and seeds package runtime artifacts", async () => {
    const db = getTestDb();
    const approvedPackage = buildApprovedEnvelope(await buildCandidatePackage());

    const legacySeeded = await seedCurriculumInput(legacyBiologySeed, { db });
    const rebuilt = await seedCurriculumInput(approvedPackage, { db });

    expect(rebuilt.qualificationVersionId).toBe(legacySeeded.qualificationVersionId);
    expect(rebuilt.normalizedFrom).toBe("package");
    expect(rebuilt.topicsCreated).toBe(126);
    expect(rebuilt.edgesCreated).toBe(13);

    const seededTopics = await db
      .select()
      .from(topics)
      .where(eq(topics.qualificationVersionId, rebuilt.qualificationVersionId));
    const seededCommandWords = await db
      .select()
      .from(commandWords)
      .where(
        eq(commandWords.qualificationVersionId, rebuilt.qualificationVersionId)
      );
    const seededQuestionTypes = await db
      .select()
      .from(questionTypes)
      .where(
        eq(questionTypes.qualificationVersionId, rebuilt.qualificationVersionId)
      );
    const seededTaskRules = await db
      .select()
      .from(taskRules)
      .innerJoin(topics, eq(taskRules.topicId, topics.id))
      .where(eq(topics.qualificationVersionId, rebuilt.qualificationVersionId));
    const seededSourceMappings = await db.select().from(sourceMappings);

    expect(seededTopics).toHaveLength(126);
    expect(seededTopics.some((topic) => topic.code === "4.8")).toBe(true);
    expect(seededCommandWords).toHaveLength(28);
    expect(seededQuestionTypes).toHaveLength(4);
    expect(seededTaskRules).toHaveLength(9);
    expect(seededSourceMappings).toHaveLength(198);
  });

  it("migrates learner state and topic-linked dependent rows onto rebuilt Biology topic ids", async () => {
    const db = getTestDb();
    const approvedPackage = buildApprovedEnvelope(await buildCandidatePackage());

    const legacySeeded = await seedCurriculumInput(legacyBiologySeed, { db });
    const legacyTopicIds = await loadTopicIdsByCode(
      db,
      legacySeeded.qualificationVersionId
    );
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const staffUser = await createTestUser();
    await enrollLearnerInQualification(
      learner.id,
      legacySeeded.qualificationVersionId
    );

    const legacyVaccinationTopicId = legacyTopicIds.get("4.3.2.1");
    const legacyDiseaseTopicId = legacyTopicIds.get("4.3.2");
    const legacyRespirationTopicId = legacyTopicIds.get("4.4.2.2");
    const legacyHormonesTopicId = legacyTopicIds.get("4.5.3.3");
    expect(legacyVaccinationTopicId).toBeTruthy();
    expect(legacyDiseaseTopicId).toBeTruthy();
    expect(legacyRespirationTopicId).toBeTruthy();
    expect(legacyHormonesTopicId).toBeTruthy();

    const [legacyDiseaseRule] = await db
      .select({ id: misconceptionRules.id })
      .from(misconceptionRules)
      .where(eq(misconceptionRules.topicId, legacyDiseaseTopicId!));
    expect(legacyDiseaseRule).toBeDefined();

    const [topicState] = await db
      .insert(learnerTopicState)
      .values({
        learnerId: learner.id,
        topicId: legacyVaccinationTopicId!,
        masteryLevel: "0.650",
        confidence: "0.550",
        easeFactor: "2.70",
        intervalDays: 9,
        nextReviewAt: new Date("2026-04-05T09:00:00.000Z"),
        lastReviewedAt: new Date("2026-03-28T09:00:00.000Z"),
        reviewCount: 4,
        streak: 3,
      })
      .returning();
    const [misconceptionEvent] = await db
      .insert(misconceptionEvents)
      .values({
        learnerId: learner.id,
        topicId: legacyDiseaseTopicId!,
        misconceptionRuleId: legacyDiseaseRule.id,
        description: "Legacy misconception event should survive the Biology upgrade.",
        severity: 3,
      })
      .returning();
    const [confidenceEvent] = await db
      .insert(confidenceEvents)
      .values({
        learnerId: learner.id,
        topicId: legacyRespirationTopicId!,
        selfRated: "0.800",
        actual: "0.300",
        delta: "-0.500",
      })
      .returning();
    const [retentionEvent] = await db
      .insert(retentionEvents)
      .values({
        learnerId: learner.id,
        topicId: legacyHormonesTopicId!,
        intervalDays: 6,
        outcome: "remembered",
        easeFactorBefore: "2.30",
        easeFactorAfter: "2.45",
      })
      .returning();
    const [studyBlock] = await db
      .insert(studyBlocks)
      .values({
        learnerId: learner.id,
        topicId: legacyRespirationTopicId!,
        blockType: "retrieval_drill",
        durationMinutes: 25,
        priority: 7,
      })
      .returning();
    const [queueItem] = await db
      .insert(reviewQueue)
      .values({
        learnerId: learner.id,
        topicId: legacyHormonesTopicId!,
        reason: "scheduled",
        priority: 4,
        dueAt: new Date("2026-04-06T07:30:00.000Z"),
      })
      .returning();
    const [assignment] = await db
      .insert(assignments)
      .values({
        learnerId: learner.id,
        setByUserId: staffUser.id,
        title: "Legacy Biology assignment",
        topicId: legacyHormonesTopicId!,
      })
      .returning();
    const [note] = await db
      .insert(teacherNotes)
      .values({
        staffUserId: staffUser.id,
        learnerId: learner.id,
        topicId: legacyHormonesTopicId!,
        content: "Legacy Biology teacher note",
      })
      .returning();
    const topicChunkId = await createManualSourceChunk(
      db,
      staffUser.id,
      "topic-remap"
    );
    const [manualTopicMapping] = await db
      .insert(sourceMappings)
      .values({
        chunkId: topicChunkId,
        topicId: legacyHormonesTopicId!,
        confidence: "0.82",
        mappingMethod: "manual",
      })
      .returning();

    const rebuilt = await seedCurriculumInput(approvedPackage, { db });
    const rebuiltTopicIds = await loadTopicIdsByCode(
      db,
      rebuilt.qualificationVersionId
    );

    const rebuiltVaccinationTopicId = rebuiltTopicIds.get("4.3.1.7");
    const rebuiltDiseaseTopicId = rebuiltTopicIds.get("4.3.1");
    const rebuiltRespirationTopicId = rebuiltTopicIds.get("4.4.2.1");
    const rebuiltHormonesTopicId = rebuiltTopicIds.get("4.5.3.4");
    expect(rebuiltVaccinationTopicId).toBeTruthy();
    expect(rebuiltDiseaseTopicId).toBeTruthy();
    expect(rebuiltRespirationTopicId).toBeTruthy();
    expect(rebuiltHormonesTopicId).toBeTruthy();

    const [migratedTopicState] = await db
      .select()
      .from(learnerTopicState)
      .where(eq(learnerTopicState.id, topicState.id));
    const [migratedMisconceptionEvent] = await db
      .select()
      .from(misconceptionEvents)
      .where(eq(misconceptionEvents.id, misconceptionEvent.id));
    const [migratedConfidenceEvent] = await db
      .select()
      .from(confidenceEvents)
      .where(eq(confidenceEvents.id, confidenceEvent.id));
    const [migratedRetentionEvent] = await db
      .select()
      .from(retentionEvents)
      .where(eq(retentionEvents.id, retentionEvent.id));
    const [migratedStudyBlock] = await db
      .select()
      .from(studyBlocks)
      .where(eq(studyBlocks.id, studyBlock.id));
    const [migratedQueueItem] = await db
      .select()
      .from(reviewQueue)
      .where(eq(reviewQueue.id, queueItem.id));
    const [migratedAssignment] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, assignment.id));
    const [migratedNote] = await db
      .select()
      .from(teacherNotes)
      .where(eq(teacherNotes.id, note.id));
    const [migratedTopicMapping] = await db
      .select()
      .from(sourceMappings)
      .where(eq(sourceMappings.id, manualTopicMapping.id));

    expect(migratedTopicState.topicId).toBe(rebuiltVaccinationTopicId);
    expect(migratedTopicState.masteryLevel).toBe("0.650");
    expect(migratedTopicState.reviewCount).toBe(4);
    expect(migratedMisconceptionEvent.topicId).toBe(rebuiltDiseaseTopicId);
    expect(migratedMisconceptionEvent.misconceptionRuleId).toBeNull();
    expect(migratedMisconceptionEvent.description).toContain(
      "should survive the Biology upgrade"
    );
    expect(migratedConfidenceEvent.topicId).toBe(rebuiltRespirationTopicId);
    expect(migratedRetentionEvent.topicId).toBe(rebuiltHormonesTopicId);
    expect(migratedStudyBlock.topicId).toBe(rebuiltRespirationTopicId);
    expect(migratedQueueItem.topicId).toBe(rebuiltHormonesTopicId);
    expect(migratedAssignment.topicId).toBe(rebuiltHormonesTopicId);
    expect(migratedNote.topicId).toBe(rebuiltHormonesTopicId);
    expect(migratedTopicMapping.topicId).toBe(rebuiltHormonesTopicId);

    expect(
      await db
        .select({ id: topics.id })
        .from(topics)
        .where(eq(topics.id, legacyVaccinationTopicId!))
    ).toHaveLength(0);
  });

  it("migrates component-linked dependent rows onto rebuilt Biology component ids", async () => {
    const db = getTestDb();
    const approvedPackage = buildApprovedEnvelope(await buildCandidatePackage());

    const legacySeeded = await seedCurriculumInput(legacyBiologySeed, { db });
    const legacyComponentIds = await loadComponentIdsByCode(
      db,
      legacySeeded.qualificationVersionId
    );
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const staffUser = await createTestUser();
    await enrollLearnerInQualification(
      learner.id,
      legacySeeded.qualificationVersionId
    );

    const legacyPaper1ComponentId = legacyComponentIds.get("8461/1H");
    const legacyPaper2ComponentId = legacyComponentIds.get("8461/2H");
    expect(legacyPaper1ComponentId).toBeTruthy();
    expect(legacyPaper2ComponentId).toBeTruthy();

    const [componentState] = await db
      .insert(learnerComponentState)
      .values({
        learnerId: learner.id,
        componentId: legacyPaper1ComponentId!,
        predictedGrade: "6",
        predictedPercent: "67.50",
        confidence: "0.720",
        lastAssessedAt: new Date("2026-03-25T10:00:00.000Z"),
      })
      .returning();
    const componentChunkId = await createManualSourceChunk(
      db,
      staffUser.id,
      "component-remap"
    );
    const [manualComponentMapping] = await db
      .insert(sourceMappings)
      .values({
        chunkId: componentChunkId,
        componentId: legacyPaper2ComponentId!,
        confidence: "0.74",
        mappingMethod: "manual",
      })
      .returning();

    const rebuilt = await seedCurriculumInput(approvedPackage, { db });
    const rebuiltComponentIds = await loadComponentIdsByCode(
      db,
      rebuilt.qualificationVersionId
    );

    const rebuiltPaper1ComponentId = rebuiltComponentIds.get("paper-1");
    const rebuiltPaper2ComponentId = rebuiltComponentIds.get("paper-2");
    expect(rebuiltPaper1ComponentId).toBeTruthy();
    expect(rebuiltPaper2ComponentId).toBeTruthy();

    const [migratedComponentState] = await db
      .select()
      .from(learnerComponentState)
      .where(eq(learnerComponentState.id, componentState.id));
    const [migratedComponentMapping] = await db
      .select()
      .from(sourceMappings)
      .where(eq(sourceMappings.id, manualComponentMapping.id));

    expect(migratedComponentState.componentId).toBe(rebuiltPaper1ComponentId);
    expect(migratedComponentState.predictedGrade).toBe("6");
    expect(migratedComponentState.predictedPercent).toBe("67.50");
    expect(migratedComponentMapping.componentId).toBe(rebuiltPaper2ComponentId);

    expect(
      await db
        .select({ id: assessmentComponents.id })
        .from(assessmentComponents)
        .where(eq(assessmentComponents.id, legacyPaper1ComponentId!))
    ).toHaveLength(0);
  });

  it("rejects a legacy reseed over rebuilt Biology 8461 and preserves package runtime artifacts", async () => {
    const db = getTestDb();
    const approvedPackage = buildApprovedEnvelope(await buildCandidatePackage());

    const rebuilt = await seedCurriculumInput(approvedPackage, { db });
    expect(rebuilt.normalizedFrom).toBe("package");

    await expect(seedCurriculumInput(legacyBiologySeed, { db })).rejects.toThrow(
      "package-only runtime artifacts already exist"
    );

    const seededTaskRules = await db
      .select()
      .from(taskRules)
      .innerJoin(topics, eq(taskRules.topicId, topics.id))
      .where(eq(topics.qualificationVersionId, rebuilt.qualificationVersionId));
    const seededSourceMappings = await db.select().from(sourceMappings);

    expect(seededTaskRules).toHaveLength(9);
    expect(seededSourceMappings).toHaveLength(198);
  });
});

import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "@/test/setup";
import {
  commandWords,
  misconceptionRules,
  questionTypes,
  sourceChunks,
  sourceCollections,
  sourceFiles,
  sourceMappings,
  taskRules,
  topics,
} from "@/db/schema";
import { getTopicTree } from "@/engine/curriculum";
import { buildLegacySeedFromCurriculumPackage, seedCurriculumInput } from "./seed";
import {
  buildApprovedCurriculumPackage,
  buildLegacyQualificationSeed,
} from "./test-fixtures";

describe("curriculum seed bridge", () => {
  it("seeds an approved package through the real legacy loader", async () => {
    const db = getTestDb();

    const result = await seedCurriculumInput(buildApprovedCurriculumPackage(), {
      db,
    });

    expect(result.normalizedFrom).toBe("package");
    expect(result.lifecycle).toBe("approved");
    expect(result.componentsCreated).toBe(2);
    expect(result.topicsCreated).toBe(3);
    expect(result.edgesCreated).toBe(1);
    expect(result.adapterNotes.map((note) => note.code)).toEqual([
      "annotations_not_seeded",
    ]);

    const tree = await getTopicTree(db, result.qualificationVersionId as never);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(2);

    const seededTopics = await db
      .select()
      .from(topics)
      .where(eq(topics.qualificationVersionId, result.qualificationVersionId));
    const seededCommandWords = await db
      .select()
      .from(commandWords)
      .where(
        eq(commandWords.qualificationVersionId, result.qualificationVersionId)
      );
    const seededQuestionTypes = await db
      .select()
      .from(questionTypes)
      .where(
        eq(questionTypes.qualificationVersionId, result.qualificationVersionId)
      );
    const seededTaskRules = await db
      .select()
      .from(taskRules)
      .innerJoin(topics, eq(taskRules.topicId, topics.id))
      .where(eq(topics.qualificationVersionId, result.qualificationVersionId));
    const seededCollections = await db.select().from(sourceCollections);
    const seededFiles = await db.select().from(sourceFiles);
    const seededChunks = await db.select().from(sourceChunks);
    const seededSourceMappings = await db.select().from(sourceMappings);
    const seededMisconceptions = await db
      .select()
      .from(misconceptionRules);

    expect(seededTopics).toHaveLength(3);
    expect(seededCommandWords).toHaveLength(1);
    expect(seededQuestionTypes).toHaveLength(1);
    expect(seededTaskRules).toHaveLength(1);
    expect(seededCollections).toHaveLength(1);
    expect(seededFiles).toHaveLength(1);
    expect(seededChunks).toHaveLength(1);
    expect(seededSourceMappings).toHaveLength(1);
    expect(seededMisconceptions).toHaveLength(1);
  });

  it("accepts a legacy seed JSON shape directly", async () => {
    const db = getTestDb();

    const result = await seedCurriculumInput(buildLegacyQualificationSeed(), {
      db,
    });

    expect(result.normalizedFrom).toBe("legacy_seed");
    expect(result.lifecycle).toBe("legacy");
    expect(result.adapterNotes).toEqual([]);
  });

  it("keeps the real seed path idempotent", async () => {
    const db = getTestDb();

    const first = await seedCurriculumInput(buildApprovedCurriculumPackage(), {
      db,
    });
    const second = await seedCurriculumInput(buildApprovedCurriculumPackage(), {
      db,
    });

    expect(second.qualificationVersionId).toBe(first.qualificationVersionId);
    expect(second.componentsCreated).toBe(0);
    expect(second.topicsCreated).toBe(0);
    expect(second.edgesCreated).toBe(0);
  });

  it("repairs partial runtime artifacts on reseed", async () => {
    const db = getTestDb();

    const seeded = await seedCurriculumInput(buildApprovedCurriculumPackage(), {
      db,
    });
    const existingTaskRules = await db.select().from(taskRules);
    const existingSourceMappings = await db.select().from(sourceMappings);

    await db
      .delete(taskRules)
      .where(eq(taskRules.id, existingTaskRules[0]!.id));
    await db
      .delete(sourceMappings)
      .where(eq(sourceMappings.id, existingSourceMappings[0]!.id));

    const repaired = await seedCurriculumInput(buildApprovedCurriculumPackage(), {
      db,
    });

    expect(repaired.qualificationVersionId).toBe(seeded.qualificationVersionId);
    expect(await db.select().from(taskRules)).toHaveLength(1);
    expect(await db.select().from(sourceCollections)).toHaveLength(1);
    expect(await db.select().from(sourceFiles)).toHaveLength(1);
    expect(await db.select().from(sourceChunks)).toHaveLength(1);
    expect(await db.select().from(sourceMappings)).toHaveLength(1);
  });

  it("persists component-targeted synthetic source mappings", async () => {
    const db = getTestDb();
    const input = buildApprovedCurriculumPackage();
    input.sourceMappings.push({
      id: "source-mapping-paper-2-guidance",
      sourceId: "specification",
      componentId: "component-paper-2",
      locator: "Assessment overview",
      excerptHint: "Applies across both papers",
      confidence: "high",
    });

    await seedCurriculumInput(input, { db });

    const seededSourceMappings = await db
      .select({
        topicId: sourceMappings.topicId,
        componentId: sourceMappings.componentId,
      })
      .from(sourceMappings);

    expect(seededSourceMappings).toHaveLength(2);
    expect(
      seededSourceMappings.some(
        (mapping) => mapping.componentId !== null && mapping.topicId === null
      )
    ).toBe(true);
  });

  it("rejects a package when existing seeded content for the version differs", async () => {
    const db = getTestDb();
    const original = buildApprovedCurriculumPackage();
    const changed = buildApprovedCurriculumPackage();
    changed.questionTypes[0].description = "Changed after the first seed";

    await seedCurriculumInput(original, { db });

    await expect(seedCurriculumInput(changed, { db })).rejects.toThrow(
      "question types"
    );
  });

  it("fails early when a package targets an incompatible existing qualification version", async () => {
    const db = getTestDb();

    await seedCurriculumInput(buildLegacyQualificationSeed(), { db });

    await expect(
      seedCurriculumInput(buildApprovedCurriculumPackage(), { db })
    ).rejects.toThrow(
      "cannot replace an incompatible existing version in place"
    );
  });

  it("rejects runtime artifact drift instead of overwriting it", async () => {
    const db = getTestDb();
    const original = buildApprovedCurriculumPackage();
    const changed = buildApprovedCurriculumPackage();
    changed.taskRules[0]!.guidance = "Changed after the first seed";

    const seeded = await seedCurriculumInput(original, { db });

    await expect(seedCurriculumInput(changed, { db })).rejects.toThrow(
      "task rules"
    );

    const seededTaskRules = await db
      .select({ instructions: taskRules.instructions })
      .from(taskRules)
      .innerJoin(topics, eq(taskRules.topicId, topics.id))
      .where(eq(topics.qualificationVersionId, seeded.qualificationVersionId));

    expect(seededTaskRules).toEqual([
      expect.objectContaining({
        instructions: expect.stringContaining(
          "Use a worked example before any timed response on mitosis stages."
        ),
      }),
    ]);
  });

  it("skips global task rules while keeping topic-scoped rules seedable", async () => {
    const db = getTestDb();
    const input = buildApprovedCurriculumPackage();
    input.taskRules.push({
      id: "task-rule-global-compare-structure",
      taskType: "mixed_practice",
      title: "Compare with paired statements",
      guidance:
        "Force paired statements that mention both items explicitly before free response.",
      conditions: ["command word compare"],
      priority: "medium",
    });

    const result = await seedCurriculumInput(input, { db });
    const seededTaskRules = await db
      .select()
      .from(taskRules)
      .innerJoin(topics, eq(taskRules.topicId, topics.id))
      .where(eq(topics.qualificationVersionId, result.qualificationVersionId));

    expect(result.adapterNotes.map((note) => note.code)).toEqual([
      "annotations_not_seeded",
      "global_task_rules_not_seeded",
    ]);
    expect(seededTaskRules).toHaveLength(1);
  });

  it("clears package-only runtime artifacts when reseeding the same version from legacy input", async () => {
    const db = getTestDb();
    const packageInput = buildApprovedCurriculumPackage();
    const legacyInput = buildLegacySeedFromCurriculumPackage(packageInput);

    const seededPackage = await seedCurriculumInput(packageInput, { db });
    expect(seededPackage.normalizedFrom).toBe("package");
    expect(await db.select().from(taskRules)).toHaveLength(1);
    expect(await db.select().from(sourceCollections)).toHaveLength(1);
    expect(await db.select().from(sourceFiles)).toHaveLength(1);
    expect(await db.select().from(sourceChunks)).toHaveLength(1);
    expect(await db.select().from(sourceMappings)).toHaveLength(1);

    const seededLegacy = await seedCurriculumInput(legacyInput, { db });

    expect(seededLegacy.normalizedFrom).toBe("legacy_seed");
    expect(await db.select().from(taskRules)).toHaveLength(0);
    expect(await db.select().from(sourceCollections)).toHaveLength(0);
    expect(await db.select().from(sourceFiles)).toHaveLength(0);
    expect(await db.select().from(sourceChunks)).toHaveLength(0);
    expect(await db.select().from(sourceMappings)).toHaveLength(0);
  });
});

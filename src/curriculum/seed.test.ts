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
import { seedCurriculumInput } from "./seed";
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
});

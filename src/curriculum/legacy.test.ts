import { describe, expect, it } from "vitest";
import seedJson from "@/data/seeds/gcse-biology-aqa.json";
import { qualificationSeedSchema } from "@/engine/curriculum";
import {
  buildLegacyCurriculumPackage,
  isLegacyQualificationSeed,
} from "./legacy";
import { buildLegacyQualificationSeed } from "./test-fixtures";
import { validateCurriculumPackage } from "./validation";

describe("legacy curriculum adapter", () => {
  it("normalizes the legacy seed shape into the flat package contract", () => {
    const curriculumPackage = buildLegacyCurriculumPackage(
      buildLegacyQualificationSeed(),
      {
        generatedAt: "2026-03-28T12:00:00.000Z",
      }
    );

    expect(curriculumPackage.lifecycle).toBe("legacy");
    expect(curriculumPackage.metadata.packageId).toBe(
      "aqa-gcse-biology-8461"
    );
    expect(curriculumPackage.components).toHaveLength(2);
    expect(curriculumPackage.topics).toHaveLength(3);
    expect(curriculumPackage.edges).toEqual([
      {
        fromTopicId: "topic-4-1-2",
        toTopicId: "topic-4-1-1",
        type: "prerequisite",
      },
    ]);
    expect(curriculumPackage.commandWords[0].id).toBe(
      "command-word-explain"
    );
    expect(curriculumPackage.questionTypes[0].id).toBe(
      "question-type-extended-response"
    );
    expect(curriculumPackage.misconceptionRules[0].topicId).toBe(
      "topic-4-1-2"
    );
  });

  it("recognizes the repo seed file as a legacy qualification seed", () => {
    expect(isLegacyQualificationSeed(seedJson)).toBe(true);
  });

  it("validates a legacy seed by normalizing it first", () => {
    const report = validateCurriculumPackage(seedJson);

    expect(report.ok).toBe(true);
    expect(report.normalizedFrom).toBe("legacy_seed");
    expect(report.lifecycle).toBe("legacy");
    expect(report.packageId).toBe("aqa-gcse-biology-8461");
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "completeness.taskRules",
        }),
        expect.objectContaining({
          code: "completeness.sourceMappings",
        }),
      ])
    );
  });

  it("rejects legacy seeds that would fail the current seed loader", () => {
    const invalidSeed = {
      ...buildLegacyQualificationSeed(),
    };

    delete (invalidSeed as Partial<typeof invalidSeed>).commandWords;
    delete (invalidSeed as Partial<typeof invalidSeed>).questionTypes;

    const validationReport = validateCurriculumPackage(invalidSeed);
    const seedSchemaResult = qualificationSeedSchema.safeParse(invalidSeed);

    expect(validationReport.ok).toBe(false);
    expect(validationReport.normalizedFrom).toBe("legacy_seed");
    expect(validationReport.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "commandWords",
        }),
        expect.objectContaining({
          path: "questionTypes",
        }),
      ])
    );
    expect(seedSchemaResult.success).toBe(false);
  });
});

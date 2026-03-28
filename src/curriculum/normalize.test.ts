import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractCurriculumDraft } from "./extract";
import { normalizeCurriculumDraft } from "./normalize";

const fixtureDirectory = path.resolve(
  process.cwd(),
  "src/curriculum/__fixtures__"
);
const extractionRequestPath = path.join(fixtureDirectory, "extract-request.json");

async function loadExtractedDraft() {
  const extractionRequest = JSON.parse(
    readFileSync(extractionRequestPath, "utf8")
  ) as unknown;
  const extractionResult = await extractCurriculumDraft(extractionRequest, {
    baseDirectory: fixtureDirectory,
  });

  expect(extractionResult.ok).toBe(true);
  expect(extractionResult.draft).not.toBeNull();

  return extractionResult.draft!;
}

describe("curriculum normalization", () => {
  it("normalizes an extracted draft into a valid candidate package", async () => {
    const draft = await loadExtractedDraft();
    const result = normalizeCurriculumDraft(draft);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.validation?.ok).toBe(true);
    expect(result.package?.lifecycle).toBe("candidate");
    expect(result.package?.metadata.packageId).toBe("aqa-gcse-biology-8461");
    expect(result.package?.components).toHaveLength(2);
    expect(result.package?.topics).toHaveLength(3);
    expect(result.package?.sourceMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topicId: "topic-4-1-2",
          locator: "Section 4.1.2",
        }),
      ])
    );
    expect(result.traces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "metadata",
          entityKey: "metadata.packageId",
          origin: "source",
        }),
        expect.objectContaining({
          entityType: "topic",
          entityKey: "topic-4-1-2",
          origin: "source",
        }),
      ])
    );
  });

  it("fails honestly when required canonical metadata is absent", async () => {
    const draft = await loadExtractedDraft();
    delete draft.metadataBlocks[0]?.values.generatedAt;

    const result = normalizeCurriculumDraft(draft);

    expect(result.ok).toBe(false);
    expect(result.package).toBeNull();
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "normalize.missing_required_field",
          path: "metadata.generatedAt",
        }),
      ])
    );
  });

  it("does not expose a package when normalization leaves unresolved refs", async () => {
    const draft = await loadExtractedDraft();
    draft.taskRules[0]!.values.topicRef = "missing-topic";

    const result = normalizeCurriculumDraft(draft);

    expect(result.ok).toBe(false);
    expect(result.package).toBeNull();
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "normalize.task_rule_topic_unresolved",
          path: "taskRules.0.topicRef",
        }),
      ])
    );
  });

  it("prefers the later block when the same source corrects metadata", async () => {
    const draft = await loadExtractedDraft();
    draft.metadataBlocks.push({
      values: {
        packageVersion: "0.2.0-candidate",
      },
      provenance: draft.metadataBlocks[0]!.provenance,
    });

    const result = normalizeCurriculumDraft(draft);

    expect(result.ok).toBe(true);
    expect(result.package?.metadata.packageVersion).toBe("0.2.0-candidate");
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "normalize.metadata_conflict",
          path: "metadata.packageVersion",
        }),
      ])
    );
  });
});

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

function addSupportSource() {
  return {
    id: "aqa-biology-support",
    kind: "support_material" as const,
    authority: "secondary" as const,
    title: "AQA Biology support note",
    uri: "https://example.com/support-note",
  };
}

function addSupportCitation(locator: string, excerpt: string) {
  return {
    sourceId: "aqa-biology-support",
    locator,
    startLine: 1,
    endLine: 4,
    excerpt,
  };
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

  it("surfaces package validation failures in normalization errors", async () => {
    const draft = await loadExtractedDraft();
    for (let index = 0; index < 5; index += 1) {
      draft.taskRules.push({
        values: {
          ...draft.taskRules[0]!.values,
          title: `Extra rule ${index + 1}`,
          guidance: `Extra guidance ${index + 1}`,
          conditions: [`condition-${index + 1}`],
        },
        provenance: draft.taskRules[0]!.provenance,
      });
    }

    const result = normalizeCurriculumDraft(draft);

    expect(result.ok).toBe(false);
    expect(result.package).toBeNull();
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "task_rules.topic_rule_limit",
        }),
      ])
    );
    expect(result.validation?.ok).toBe(false);
  });

  it("reports wrapped draft validation errors against the wrapped draft payload", () => {
    const result = normalizeCurriculumDraft({
      draft: {
        schemaVersion: "1.0",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "normalize.invalid_draft",
          path: "draftVersion",
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

  it("reconciles repeated multi-source components and topics without duplicating them", async () => {
    const draft = await loadExtractedDraft();
    draft.provenance.sources.push(addSupportSource());
    draft.components.push({
      values: {
        ...draft.components[0]!.values,
        durationMinutes: undefined,
      },
      provenance: [
        addSupportCitation(
          "Support overview",
          "[component]\nname: Paper 1\ncode: 8461-1h"
        ),
      ],
    });
    draft.topics.push({
      values: {
        name: "Cell Division",
        parentRef: "4.1",
        sortOrder: 2,
        description: "Covers mitosis and the cell cycle.",
      },
      provenance: [
        addSupportCitation(
          "Support topic note",
          "[topic]\nname: Cell Division\nparentRef: 4.1"
        ),
      ],
    });

    const result = normalizeCurriculumDraft(draft);

    expect(result.ok).toBe(true);
    expect(result.package?.components).toHaveLength(2);
    expect(result.package?.components[0]?.durationMinutes).toBe(105);
    expect(result.package?.topics).toHaveLength(3);
    expect(
      result.package?.topics.find((topic) => topic.id === "topic-4-1-2")
        ?.description
    ).toBe("Covers mitosis and the cell cycle.");
    expect(
      result.package?.sourceMappings.filter(
        (mapping) => mapping.topicId === "topic-4-1-2"
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: "aqa-biology-spec" }),
        expect.objectContaining({ sourceId: "aqa-biology-support" }),
      ])
    );
  });

  it("stabilizes misconception ids against prose edits when provenance stays the same", async () => {
    const draft = await loadExtractedDraft();

    const firstResult = normalizeCurriculumDraft(draft);
    expect(firstResult.ok).toBe(true);

    draft.misconceptionRules[0]!.values.description =
      "Reworded misconception without changing the cited source anchor.";
    draft.misconceptionRules[0]!.values.correctionGuidance =
      "Reworded correction guidance without changing the cited source anchor.";

    const secondResult = normalizeCurriculumDraft(draft);

    expect(secondResult.ok).toBe(true);
    expect(secondResult.package?.misconceptionRules[0]?.id).toBe(
      firstResult.package?.misconceptionRules[0]?.id
    );
  });

  it("maps command-word provenance onto assessment components when no finer runtime target exists", async () => {
    const draft = await loadExtractedDraft();

    const result = normalizeCurriculumDraft(draft);

    expect(result.ok).toBe(true);
    expect(
      result.package?.sourceMappings.filter(
        (mapping) =>
          mapping.sourceId === "aqa-biology-spec" &&
          mapping.componentId === "component-8461-1h"
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          locator: "Command word glossary",
        }),
      ])
    );
  });

  it("fails explicitly when repeated component blocks conflict", async () => {
    const draft = await loadExtractedDraft();
    draft.provenance.sources.push(addSupportSource());
    draft.components.push({
      values: {
        ...draft.components[0]!.values,
        totalMarks: 90,
      },
      provenance: [
        addSupportCitation(
          "Support overview",
          "[component]\nname: Paper 1\ncode: 8461-1h\ntotalMarks: 90"
        ),
      ],
    });

    const result = normalizeCurriculumDraft(draft);

    expect(result.ok).toBe(false);
    expect(result.package).toBeNull();
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "normalize.component_conflict",
          path: "components.code:8461-1h",
        }),
      ])
    );
  });

  it("fails explicitly when repeated topic blocks conflict", async () => {
    const draft = await loadExtractedDraft();
    draft.provenance.sources.push(addSupportSource());
    draft.topics.push({
      values: {
        ...draft.topics[2]!.values,
        name: "Mitosis",
      },
      provenance: [
        addSupportCitation(
          "Support topic note",
          "[topic]\nname: Mitosis\ncode: 4.1.2"
        ),
      ],
    });

    const result = normalizeCurriculumDraft(draft);

    expect(result.ok).toBe(false);
    expect(result.package).toBeNull();
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "normalize.topic_conflict",
          path: "topics.code:4.1.2",
        }),
      ])
    );
  });

  it("fails explicitly when a coded and uncoded topic collapse to the same parent and name", async () => {
    const draft = await loadExtractedDraft();
    draft.provenance.sources.push(addSupportSource());
    draft.topics.push({
      values: {
        name: "Cell Division",
        parentRef: "Cell Biology",
        sortOrder: 2,
      },
      provenance: [
        addSupportCitation(
          "Support topic note",
          "[topic]\nname: Cell Division\nparentRef: Cell Biology"
        ),
      ],
    });

    const result = normalizeCurriculumDraft(draft);

    expect(result.ok).toBe(false);
    expect(result.package).toBeNull();
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "normalize.topic_duplicate_unresolved",
          path: "topics.parent:code:4.1|name:cell division",
        }),
      ])
    );
  });

  it("deduplicates semantically identical task rules and misconceptions", async () => {
    const draft = await loadExtractedDraft();
    draft.provenance.sources.push(addSupportSource());
    draft.misconceptionRules.push({
      values: {
        ...draft.misconceptionRules[0]!.values,
        triggerPatterns: [...draft.misconceptionRules[0]!.values.triggerPatterns]
          .reverse(),
      },
      provenance: [
        addSupportCitation(
          "Support misconception note",
          "[misconception]\ntopicRef: 4.1.2\ndescription: Confuses mitosis with meiosis."
        ),
      ],
    });
    draft.taskRules.push({
      values: {
        ...draft.taskRules[0]!.values,
        conditions: [...draft.taskRules[0]!.values.conditions].reverse(),
      },
      provenance: [
        addSupportCitation(
          "Support task note",
          "[task-rule]\ntaskType: worked_example\ntopicRef: 4.1.2"
        ),
      ],
    });

    const result = normalizeCurriculumDraft(draft);

    expect(result.ok).toBe(true);
    expect(result.package?.misconceptionRules).toHaveLength(1);
    expect(result.package?.taskRules).toHaveLength(1);
    expect(
      result.traces.filter((trace) => trace.entityType === "misconception_rule")
    ).toEqual([
      expect.objectContaining({
        provenance: expect.arrayContaining([
          expect.objectContaining({ sourceId: "aqa-biology-spec" }),
          expect.objectContaining({ sourceId: "aqa-biology-support" }),
        ]),
      }),
    ]);
    expect(result.traces.filter((trace) => trace.entityType === "task_rule")).toEqual([
      expect.objectContaining({
        provenance: expect.arrayContaining([
          expect.objectContaining({ sourceId: "aqa-biology-spec" }),
          expect.objectContaining({ sourceId: "aqa-biology-support" }),
        ]),
      }),
    ]);
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractCurriculumDraft } from "./extract";

const fixtureDirectory = path.resolve(
  process.cwd(),
  "src/curriculum/__fixtures__"
);
const extractionRequestPath = path.join(fixtureDirectory, "extract-request.json");

function loadExtractionRequest(): unknown {
  return JSON.parse(readFileSync(extractionRequestPath, "utf8")) as unknown;
}

describe("curriculum extraction", () => {
  it("extracts a structured draft with block provenance", async () => {
    const result = await extractCurriculumDraft(loadExtractionRequest(), {
      baseDirectory: fixtureDirectory,
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.stats.blocks).toBe(12);
    expect(result.stats.topics).toBe(3);
    expect(result.draft?.metadataBlocks).toHaveLength(1);
    expect(result.draft?.qualificationBlocks).toHaveLength(1);
    expect(result.draft?.topics[2].values.code).toBe("4.1.2");
    expect(result.draft?.topics[2].provenance).toEqual([
      expect.objectContaining({
        sourceId: "aqa-biology-spec",
        locator: "Section 4.1.2",
        excerpt: expect.stringContaining("[topic]"),
      }),
    ]);
  });

  it("fails when a block contains unsupported fields", async () => {
    const request = {
      sources: [
        {
          source: {
            id: "aqa-biology-spec",
            kind: "specification" as const,
            authority: "primary" as const,
            title: "AQA GCSE Biology specification",
          },
          content: {
            format: "record_text" as const,
            text: [
              "[metadata]",
              "packageId: aqa-gcse-biology-8461",
              "packageVersoin: typo",
            ].join("\n"),
          },
        },
      ],
    };

    const result = await extractCurriculumDraft(request);

    expect(result.ok).toBe(false);
    expect(result.draft).toBeNull();
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "extract.unknown_field",
          message: expect.stringContaining("packageVersoin"),
        }),
      ])
    );
  });
});

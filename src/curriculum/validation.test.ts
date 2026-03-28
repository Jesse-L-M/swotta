import { describe, expect, it } from "vitest";
import type { CurriculumPackage } from "./schema";
import { buildApprovedCurriculumPackage } from "./test-fixtures";
import { validateCurriculumPackage } from "./validation";

describe("curriculum package validation", () => {
  it("accepts a reviewed approved package", () => {
    const report = validateCurriculumPackage(
      buildApprovedCurriculumPackage()
    );

    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.stats.topics).toBe(3);
    expect(report.stats.sourceMappings).toBe(1);
  });

  it("requires sign-off metadata for approved packages", () => {
    const curriculumPackage = buildApprovedCurriculumPackage();
    curriculumPackage.review.status = "in_review";
    curriculumPackage.review.approvedAt = undefined;
    curriculumPackage.review.reviewers = [];

    const report = validateCurriculumPackage(curriculumPackage);

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "review.status_required",
        }),
        expect.objectContaining({
          code: "review.approved_at_required",
        }),
        expect.objectContaining({
          code: "review.human_signoff_required",
        }),
      ])
    );
  });

  it("requires exemplar metadata for reference packages", () => {
    const curriculumPackage =
      buildApprovedCurriculumPackage() as CurriculumPackage;
    curriculumPackage.lifecycle = "reference";
    curriculumPackage.review.referenceNotes = undefined;
    curriculumPackage.provenance.sources = [
      {
        id: "legacy-seed",
        kind: "legacy_seed",
        authority: "legacy",
        title: "Legacy package",
      },
    ];

    const report = validateCurriculumPackage(curriculumPackage);

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "review.reference_notes_required",
        }),
        expect.objectContaining({
          code: "provenance.primary_source_required",
        }),
      ])
    );
  });

  it("detects graph, reference, and ordering failures", () => {
    const curriculumPackage = buildApprovedCurriculumPackage();
    curriculumPackage.topics.push({
      id: "topic-bad-child",
      name: "Bad Child",
      parentId: "topic-missing-parent",
      depth: 4,
      sortOrder: 1,
    });
    curriculumPackage.topics[2].sortOrder = 1;
    curriculumPackage.edges.push({
      fromTopicId: "topic-cell-division",
      toTopicId: "topic-missing-target",
      type: "related",
    });
    curriculumPackage.taskRules[0].topicId = "topic-missing-target";
    curriculumPackage.metadata.updatedAt = "2026-03-28T11:00:00.000Z";

    const report = validateCurriculumPackage(curriculumPackage);

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "topics.parent_missing",
        }),
        expect.objectContaining({
          code: "topics.duplicate_sort_order",
        }),
        expect.objectContaining({
          code: "edges.to_topic_missing",
        }),
        expect.objectContaining({
          code: "task_rules.topic_missing",
        }),
        expect.objectContaining({
          code: "metadata.updated_before_generated",
        }),
      ])
    );
  });

  it("rejects unknown fields instead of silently stripping them", () => {
    const curriculumPackage = buildApprovedCurriculumPackage() as Record<
      string,
      unknown
    >;
    curriculumPackage.extraTopLevel = true;
    (
      curriculumPackage.metadata as Record<string, unknown>
    ).typoField = "unexpected";

    const report = validateCurriculumPackage(curriculumPackage);

    expect(report.ok).toBe(false);
    expect(report.package).toBeNull();
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "package.unrecognized_keys",
          path: "",
        }),
        expect.objectContaining({
          code: "package.unrecognized_keys",
          path: "metadata",
        }),
      ])
    );
  });
});

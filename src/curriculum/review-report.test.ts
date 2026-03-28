import { describe, expect, it } from "vitest";
import {
  buildApprovedCurriculumPackage,
  buildLegacyQualificationSeed,
} from "./test-fixtures";
import { renderCurriculumReviewReport } from "./review-report";

describe("curriculum review report", () => {
  it("renders a deterministic human-readable report for canonical packages", () => {
    const curriculumPackage = buildApprovedCurriculumPackage();
    const shuffledPackage = structuredClone(curriculumPackage);

    shuffledPackage.components.reverse();
    shuffledPackage.topics.reverse();
    shuffledPackage.edges.reverse();
    shuffledPackage.commandWords.reverse();
    shuffledPackage.questionTypes.reverse();
    shuffledPackage.misconceptionRules.reverse();
    shuffledPackage.taskRules.reverse();
    shuffledPackage.sourceMappings.reverse();
    shuffledPackage.provenance.sources.reverse();
    shuffledPackage.provenance.derivedFrom.reverse();
    shuffledPackage.review.reviewers.reverse();
    shuffledPackage.annotations?.markSchemePatterns.reverse();
    shuffledPackage.annotations?.examTechniquePatterns.reverse();

    const report = renderCurriculumReviewReport(curriculumPackage);
    const shuffledReport = renderCurriculumReviewReport(shuffledPackage);

    expect(report.report.ok).toBe(true);
    expect(report.text).toBe(shuffledReport.text);
    expect(report.text).toContain("# Curriculum Review Report");
    expect(report.text).toContain("## Package Metadata");
    expect(report.text).toContain("## Qualification Summary");
    expect(report.text).toContain(
      "## Component Summary (2 components, total weight 100%)"
    );
    expect(report.text).toContain(
      "## Topic Tree Summary (3 topics, 1 root topic, 2 leaf topics, max depth 1)"
    );
    expect(report.text).toContain(
      "- 4.1.2 Cell Division [id=topic-cell-division]"
    );
    expect(report.text).toContain("## Edge Summary (1 edge)");
    expect(report.text).toContain("## Command Words and Question Types");
    expect(report.text).toContain(
      "## Misconceptions, Task Rules, and Source Mappings"
    );
    expect(report.text).toContain("## Annotations");
    expect(report.text).toContain("## Validation");
    expect(report.text).toContain("- Status: WARNINGS (1 warning)");
    expect(report.text).toContain(
      "[annotations.review_only] annotations: 2 annotation record(s) are review-only in the current curriculum runtime and will not be persisted by seed"
    );
  });

  it("sanitizes multiline content and renders annotations", () => {
    const curriculumPackage = buildApprovedCurriculumPackage();

    curriculumPackage.metadata.summary = "Reviewed\ncurriculum package";
    curriculumPackage.topics[0]!.description =
      "Cell structure,\ntransport,\nand division";
    curriculumPackage.review.reviewers[0]!.notes =
      "Ready for production\nNeeds final skim";
    curriculumPackage.taskRules[0]!.guidance =
      "Use a worked example\nbefore any timed response";
    curriculumPackage.sourceMappings[0]!.excerptHint =
      "Mitosis\nand the cell cycle";
    curriculumPackage.annotations!.markSchemePatterns[0]!.description =
      "Credit grows\nwith linked reasoning and precision.";
    curriculumPackage.annotations!.examTechniquePatterns[0]!.description =
      "State the mechanism,\nthen connect it to the outcome.";

    const report = renderCurriculumReviewReport(curriculumPackage);

    expect(report.text).toContain("Summary: Reviewed / curriculum package");
    expect(report.text).toContain(
      "description=Cell structure, / transport, / and division"
    );
    expect(report.text).toContain(
      "Reviewer: Jess Reviewer | human | approved | 2026-03-28T12:25:00.000Z | Ready for production / Needs final skim"
    );
    expect(report.text).toContain(
      "guidance: Use a worked example / before any timed response"
    );
    expect(report.text).toContain("excerpt: Mitosis / and the cell cycle");
    expect(report.text).toContain("## Annotations");
    expect(report.text).toContain("Mark scheme patterns (1 pattern)");
    expect(report.text).toContain(
      "- Levelled response | Credit grows / with linked reasoning and precision. | question type: Extended response | component: 8461-2h Paper 2"
    );
    expect(report.text).toContain("Exam technique patterns (1 pattern)");
    expect(report.text).toContain(
      "- Explain pattern | State the mechanism, / then connect it to the outcome. | command word: Explain"
    );
    expect(report.text).not.toContain("production\nNeeds");
    expect(report.text).not.toContain("example\nbefore");
    expect(report.text).not.toContain("Mitosis\nand the cell cycle");
  });

  it("renders component-targeted source mappings with clear targets", () => {
    const curriculumPackage = buildApprovedCurriculumPackage();
    curriculumPackage.sourceMappings.push({
      id: "source-mapping-paper-2-guidance",
      sourceId: "specification",
      componentId: "component-paper-2",
      locator: "Assessment overview",
      excerptHint: "Applies across both papers",
      confidence: "high",
    });

    const report = renderCurriculumReviewReport(curriculumPackage);

    expect(report.text).toContain(
      "AQA GCSE Biology specification (specification) -> component: 8461-2h Paper 2 | high | Assessment overview"
    );
  });

  it("normalizes legacy seeds before rendering and surfaces validation warnings", () => {
    const firstReport = renderCurriculumReviewReport(
      buildLegacyQualificationSeed()
    );
    const secondReport = renderCurriculumReviewReport(
      buildLegacyQualificationSeed()
    );

    expect(firstReport.report.ok).toBe(true);
    expect(firstReport.report.normalizedFrom).toBe("legacy_seed");
    expect(firstReport.report.lifecycle).toBe("legacy");
    expect(firstReport.text).toBe(secondReport.text);
    expect(firstReport.text).toContain(
      "- Normalization: legacy seed input was normalized into the canonical package shape before rendering"
    );
    expect(firstReport.text).toContain("Input: legacy_seed");
    expect(firstReport.text).toContain("Lifecycle: legacy");
    expect(firstReport.text).toContain(
      "Generated at: legacy seed normalization runtime omitted for report stability"
    );
    expect(firstReport.text).toContain("Warnings:");
    expect(firstReport.text).toContain(
      "[completeness.taskRules] taskRules: Package is missing task rules"
    );
    expect(firstReport.text).toContain(
      "[completeness.sourceMappings] sourceMappings: Package is missing source mapping hints"
    );
  });
});

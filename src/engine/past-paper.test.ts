import { eq, and } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import biologyCurriculumPackage from "@/curriculum/__fixtures__/aqa-gcse-biology-8461/candidate-package.json";
import chemistryCurriculumPackage from "@/curriculum/__fixtures__/aqa-gcse-chemistry-8462/candidate-package.json";
import biologyPastPaperFixture from "@/engine/__fixtures__/past-papers/aqa-gcse-biology-8461.json";
import chemistryPastPaperFixture from "@/engine/__fixtures__/past-papers/aqa-gcse-chemistry-8462.json";
import {
  pastPapers,
  pastPaperQuestions,
  pastPaperQuestionSignals,
  pastPaperQuestionTopics,
  topics,
} from "@/db/schema";
import { getTestDb } from "@/test/setup";
import { seedCurriculumInput } from "@/curriculum/seed";
import type {
  ApprovedCurriculumPackage,
  CandidateCurriculumPackage,
} from "@/curriculum/schema";
import {
  analyzePastPaperFixture,
  getPastPaperQualificationOverview,
  getPastPaperTopicIntelligence,
  listPastPaperQuestionIntelligence,
  loadQualificationPastPaperCatalog,
  seedPastPaperAnalyses,
} from "./past-paper";

function buildApprovedEnvelope(
  candidatePackage: CandidateCurriculumPackage,
  approvedAt: string
): ApprovedCurriculumPackage {
  return {
    ...structuredClone(candidatePackage),
    lifecycle: "approved",
    review: {
      status: "approved",
      approvedAt,
      reviewers: [
        {
          name: "Past paper fixture approval wrapper",
          role: "human",
          outcome: "approved",
          reviewedAt: approvedAt,
          notes:
            "Test-only approval wrapper used to exercise the real seed path against the committed candidate fixture.",
        },
      ],
    },
  };
}

async function seedWedgeQualificationFixtures() {
  const db = getTestDb();
  const biologySeeded = await seedCurriculumInput(
    buildApprovedEnvelope(
      biologyCurriculumPackage as CandidateCurriculumPackage,
      "2026-03-30T09:00:00.000Z"
    ),
    { db }
  );
  const chemistrySeeded = await seedCurriculumInput(
    buildApprovedEnvelope(
      chemistryCurriculumPackage as CandidateCurriculumPackage,
      "2026-03-30T09:15:00.000Z"
    ),
    { db }
  );

  return {
    db,
    biologyQualificationVersionId: biologySeeded.qualificationVersionId,
    chemistryQualificationVersionId: chemistrySeeded.qualificationVersionId,
  };
}

async function loadTopicIdByCode(
  qualificationVersionId: string,
  topicCode: string
): Promise<string> {
  const db = getTestDb();
  const [row] = await db
    .select({ id: topics.id })
    .from(topics)
    .where(
      and(
        eq(topics.qualificationVersionId, qualificationVersionId),
        eq(topics.code, topicCode)
      )
    )
    .limit(1);

  if (!row) {
    throw new Error(`Could not find topic ${topicCode}`);
  }

  return row.id;
}

describe("past-paper intelligence foundation", () => {
  it("analyzes the Biology and Chemistry wedge fixtures into structured records", async () => {
    const {
      biologyQualificationVersionId,
      chemistryQualificationVersionId,
    } = await seedWedgeQualificationFixtures();

    const biologyCatalog = await loadQualificationPastPaperCatalog(
      getTestDb(),
      biologyQualificationVersionId
    );
    const chemistryCatalog = await loadQualificationPastPaperCatalog(
      getTestDb(),
      chemistryQualificationVersionId
    );

    const biologyAnalyses = analyzePastPaperFixture(
      biologyCatalog,
      biologyPastPaperFixture
    );
    const chemistryAnalyses = analyzePastPaperFixture(
      chemistryCatalog,
      chemistryPastPaperFixture
    );

    expect(biologyAnalyses).toHaveLength(2);
    expect(chemistryAnalyses).toHaveLength(2);

    const chooseQuestion = biologyAnalyses[0]!.questions[0]!;
    expect(chooseQuestion.commandWord.word).toBe("Choose");
    expect(chooseQuestion.questionType.name).toBe("Multiple choice");
    expect(chooseQuestion.topicLinks).toEqual([
      expect.objectContaining({
        topicCode: "4.1.1.2",
        topicName: "Animal and plant cells",
        isPrimary: true,
      }),
    ]);
    expect(chooseQuestion.signals.map((signal) => signal.code)).toEqual([
      "single_point",
      "one_point_per_mark",
    ]);

    const osmosisQuestion = biologyAnalyses[0]!.questions[1]!;
    expect(osmosisQuestion.commandWord.word).toBe("Explain");
    expect(osmosisQuestion.questionType.name).toBe("Structured");
    expect(osmosisQuestion.signals.map((signal) => signal.code)).toEqual([
      "point_plus_reason",
      "link_cause_and_effect",
    ]);

    const bioleachingQuestion = chemistryAnalyses[1]!.questions[1]!;
    expect(bioleachingQuestion.commandWord.word).toBe("Evaluate");
    expect(bioleachingQuestion.questionType.name).toBe("Open response");
    expect(bioleachingQuestion.topicLinks).toEqual([
      expect.objectContaining({
        topicCode: "4.10.1.4",
        topicName: "Alternative methods of extracting metals (HT only)",
      }),
    ]);
    expect(bioleachingQuestion.signals.map((signal) => signal.code)).toEqual([
      "balanced_judgement",
      "justify_overall_judgement",
    ]);
  });

  it("enforces fixture qualification identity against the catalog", async () => {
    const {
      biologyQualificationVersionId,
      chemistryQualificationVersionId,
    } = await seedWedgeQualificationFixtures();

    const biologyCatalog = await loadQualificationPastPaperCatalog(
      getTestDb(),
      biologyQualificationVersionId
    );
    const chemistryCatalog = await loadQualificationPastPaperCatalog(
      getTestDb(),
      chemistryQualificationVersionId
    );

    expect(() =>
      analyzePastPaperFixture(biologyCatalog, biologyPastPaperFixture)
    ).not.toThrow();

    expect(() =>
      analyzePastPaperFixture(chemistryCatalog, biologyPastPaperFixture)
    ).toThrow(
      "Past-paper fixture qualification mismatch: subjectSlug fixture=biology catalog=chemistry; versionCode fixture=8461 catalog=8462"
    );
  });

  it("persists analyzed wedge fixtures and exposes overview and topic query surfaces", async () => {
    const {
      db,
      biologyQualificationVersionId,
      chemistryQualificationVersionId,
    } = await seedWedgeQualificationFixtures();

    const biologyAnalyses = analyzePastPaperFixture(
      await loadQualificationPastPaperCatalog(db, biologyQualificationVersionId),
      biologyPastPaperFixture
    );
    const chemistryAnalyses = analyzePastPaperFixture(
      await loadQualificationPastPaperCatalog(db, chemistryQualificationVersionId),
      chemistryPastPaperFixture
    );

    const seeded = await seedPastPaperAnalyses(db, [
      ...biologyAnalyses,
      ...chemistryAnalyses,
    ]);

    expect(seeded).toEqual({
      papersUpserted: 4,
      questionsUpserted: 8,
      topicLinksInserted: 8,
      signalsInserted: 16,
    });

    expect(await db.select().from(pastPapers)).toHaveLength(4);
    expect(await db.select().from(pastPaperQuestions)).toHaveLength(8);
    expect(await db.select().from(pastPaperQuestionTopics)).toHaveLength(8);
    expect(await db.select().from(pastPaperQuestionSignals)).toHaveLength(16);

    const biologyOverview = await getPastPaperQualificationOverview(
      db,
      biologyQualificationVersionId
    );
    expect(biologyOverview.paperCount).toBe(2);
    expect(biologyOverview.questionCount).toBe(4);
    expect(biologyOverview.totalMarks).toBe(11);
    expect(
      biologyOverview.components.map(({ label, count, totalMarks }) => ({
        label: label.split(":")[0],
        count,
        totalMarks,
      }))
    ).toEqual([
      { label: "paper-2 Paper 2", count: 2, totalMarks: 6 },
      { label: "paper-1 Paper 1", count: 2, totalMarks: 5 },
    ]);

    const chemistryOverview = await getPastPaperQualificationOverview(
      db,
      chemistryQualificationVersionId
    );
    expect(chemistryOverview.paperCount).toBe(2);
    expect(chemistryOverview.questionCount).toBe(4);
    expect(chemistryOverview.totalMarks).toBe(15);
    expect(chemistryOverview.commandWords).toEqual([
      { label: "Describe", count: 2, totalMarks: 6 },
      { label: "Evaluate", count: 1, totalMarks: 6 },
      { label: "Calculate", count: 1, totalMarks: 3 },
    ]);

    const biologyOsmosisTopicId = await loadTopicIdByCode(
      biologyQualificationVersionId,
      "4.1.3.2"
    );
    const biologyOsmosis = await getPastPaperTopicIntelligence(
      db,
      biologyQualificationVersionId,
      biologyOsmosisTopicId
    );
    expect(biologyOsmosis.topicName).toBe("Osmosis");
    expect(biologyOsmosis.questionCount).toBe(1);
    expect(biologyOsmosis.totalMarks).toBe(4);
    expect(biologyOsmosis.commandWords).toEqual([
      { label: "Explain", count: 1, totalMarks: 4 },
    ]);
    expect(biologyOsmosis.signals).toEqual([
      {
        signalType: "exam_technique",
        code: "link_cause_and_effect",
        label: "Link cause and effect",
        count: 1,
      },
      {
        signalType: "mark_scheme_pattern",
        code: "point_plus_reason",
        label: "Point-plus-reason explanation",
        count: 1,
      },
    ]);

    const chemistryQuestionList = await listPastPaperQuestionIntelligence(db, {
      qualificationVersionId: chemistryQualificationVersionId,
      commandWord: "Evaluate",
    });
    expect(chemistryQuestionList).toHaveLength(1);
    expect(chemistryQuestionList[0]!.paperSlug).toBe(
      "aqa-gcse-chemistry-8462-june-2023-paper-2"
    );
    expect(chemistryQuestionList[0]!.signals.map((signal) => signal.code)).toEqual(
      ["balanced_judgement", "justify_overall_judgement"]
    );
  });

  it("fails fast when the narrower input format references unknown qualification records", async () => {
    const { biologyQualificationVersionId } = await seedWedgeQualificationFixtures();
    const catalog = await loadQualificationPastPaperCatalog(
      getTestDb(),
      biologyQualificationVersionId
    );

    const brokenFixture = structuredClone(biologyPastPaperFixture);
    brokenFixture.papers[0]!.componentCode = "paper-9";

    expect(() => analyzePastPaperFixture(catalog, brokenFixture)).toThrow(
      'Unknown component code "paper-9"'
    );
  });
});

import { readFileSync } from "node:fs";
import path from "path";
import { getTestDb } from "./setup";
import { seedCurriculumInput } from "@/curriculum/seed";
import { topics } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { QualificationVersionId, TopicId } from "@/lib/types";
import type { Database } from "@/lib/db";
import type {
  ApprovedCurriculumPackage,
  CandidateCurriculumPackage,
} from "@/curriculum/schema";

const biologyFixtureDirectory = path.resolve(
  process.cwd(),
  "src/curriculum/__fixtures__/aqa-gcse-biology-8461"
);

function loadApprovedBiologyPackageFixture(): ApprovedCurriculumPackage {
  const candidatePackage = JSON.parse(
    readFileSync(path.join(biologyFixtureDirectory, "candidate-package.json"), "utf8")
  ) as CandidateCurriculumPackage;

  return {
    ...candidatePackage,
    lifecycle: "approved",
    review: {
      status: "approved",
      approvedAt: "2026-03-28T20:30:00.000Z",
      reviewers: [
        {
          name: "Shared Biology test helper",
          role: "human",
          outcome: "approved",
          reviewedAt: "2026-03-28T20:30:00.000Z",
          notes:
            "Test-only approval wrapper so shared helpers use the rebuilt Biology package path instead of the legacy seed JSON.",
        },
      ],
    },
  };
}

export async function seedGCSEBiology() {
  const db = getTestDb();
  const result = await seedCurriculumInput(loadApprovedBiologyPackageFixture(), {
    db: db as unknown as Database,
  });

  const qvId = result.qualificationVersionId as QualificationVersionId;

  // Build topic map from the loaded topics
  const allTopicRows = await db
    .select({ id: topics.id, code: topics.code })
    .from(topics)
    .where(eq(topics.qualificationVersionId, qvId));

  const topicMap = new Map<string, string>();
  const allTopics: Array<{ id: TopicId; code: string }> = [];

  for (const row of allTopicRows) {
    if (row.code) {
      topicMap.set(row.code, row.id);
      allTopics.push({ id: row.id as TopicId, code: row.code });
    }
  }

  return {
    qualificationVersionId: qvId,
    examBoardId: "",
    subjectId: "",
    qualificationId: "",
    topics: allTopics,
    topicMap,
  };
}

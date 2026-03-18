import { readFileSync } from "fs";
import path from "path";
import { getTestDb } from "./setup";
import { loadQualification } from "@/engine/curriculum";
import { topics } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { QualificationVersionId, TopicId, QualificationSeed } from "@/lib/types";
import type { Database } from "@/lib/db";

export async function seedGCSEBiology() {
  const db = getTestDb();

  const seedPath = path.resolve(
    process.cwd(),
    "src/data/seeds/gcse-biology-aqa.json"
  );
  const seedData: QualificationSeed = JSON.parse(
    readFileSync(seedPath, "utf-8")
  );

  const result = await loadQualification(
    db as unknown as Database,
    seedData
  );

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

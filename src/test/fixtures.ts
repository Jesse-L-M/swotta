import { getTestDb } from "./setup";
import {
  organizations,
  users,
  memberships,
  learners,
  guardianLinks,
  learnerQualifications,
  examBoards,
  subjects,
  qualifications,
  qualificationVersions,
  assessmentComponents,
  topics,
  topicEdges,
} from "@/db/schema";
import type { InferInsertModel } from "drizzle-orm";
import type {
  LearnerId,
  OrgId,
  UserId,
  QualificationVersionId,
  TopicId,
} from "@/lib/types";

type OrgInsert = InferInsertModel<typeof organizations>;
type UserInsert = InferInsertModel<typeof users>;

let counter = 0;
function nextId() {
  return ++counter;
}

export async function createTestOrg(
  overrides?: Partial<OrgInsert>
) {
  const db = getTestDb();
  const n = nextId();
  const [org] = await db
    .insert(organizations)
    .values({
      name: overrides?.name ?? `Test Org ${n}`,
      type: overrides?.type ?? "household",
      slug: overrides?.slug ?? `test-org-${n}`,
      ...overrides,
    })
    .returning();
  return org;
}

export async function createTestUser(
  overrides?: Partial<UserInsert>
) {
  const db = getTestDb();
  const n = nextId();
  const [user] = await db
    .insert(users)
    .values({
      clerkId: overrides?.clerkId ?? `clerk_test_${n}`,
      email: overrides?.email ?? `test${n}@example.com`,
      name: overrides?.name ?? `Test User ${n}`,
      ...overrides,
    })
    .returning();
  return user;
}

export async function createTestMembership(
  userId: string,
  orgId: string,
  role: "learner" | "guardian" | "tutor" | "teacher" | "school_admin" | "org_owner" = "learner"
) {
  const db = getTestDb();
  const [membership] = await db
    .insert(memberships)
    .values({ userId, orgId, role })
    .returning();
  return membership;
}

export async function createTestLearner(
  orgId: string,
  overrides?: { userId?: string; displayName?: string; yearGroup?: number }
) {
  const db = getTestDb();
  let userId = overrides?.userId;
  if (!userId) {
    const user = await createTestUser();
    userId = user.id;
  }

  await createTestMembership(userId, orgId, "learner");

  const n = nextId();
  const [learner] = await db
    .insert(learners)
    .values({
      userId,
      orgId,
      displayName: overrides?.displayName ?? `Test Learner ${n}`,
      yearGroup: overrides?.yearGroup ?? 10,
    })
    .returning();
  return learner;
}

export async function createTestGuardianLink(
  guardianUserId: string,
  learnerId: string,
  relationship = "parent"
) {
  const db = getTestDb();
  const [link] = await db
    .insert(guardianLinks)
    .values({ guardianUserId, learnerId, relationship })
    .returning();
  return link;
}

export async function createTestQualification() {
  const db = getTestDb();

  const [board] = await db
    .insert(examBoards)
    .values({ name: "Test Board", code: `TB${nextId()}`, country: "GB" })
    .returning();

  const [subject] = await db
    .insert(subjects)
    .values({ name: "Test Subject", slug: `test-subject-${nextId()}` })
    .returning();

  const [qualification] = await db
    .insert(qualifications)
    .values({ subjectId: subject.id, level: "GCSE", name: "GCSE Test Subject" })
    .returning();

  const [version] = await db
    .insert(qualificationVersions)
    .values({
      qualificationId: qualification.id,
      examBoardId: board.id,
      versionCode: `T${nextId()}`,
      firstExamYear: 2025,
    })
    .returning();

  const [component] = await db
    .insert(assessmentComponents)
    .values({
      qualificationVersionId: version.id,
      name: "Paper 1",
      code: "TEST/1",
      weightPercent: 100,
      durationMinutes: 90,
      isExam: true,
    })
    .returning();

  // Create a small topic tree: 2 units, each with 2 sub-topics
  const createdTopics: Array<typeof topics.$inferSelect> = [];

  const [unit1] = await db
    .insert(topics)
    .values({
      qualificationVersionId: version.id,
      name: "Unit 1",
      code: "1",
      depth: 0,
      sortOrder: 1,
    })
    .returning();
  createdTopics.push(unit1);

  const [topic1a] = await db
    .insert(topics)
    .values({
      qualificationVersionId: version.id,
      parentTopicId: unit1.id,
      name: "Topic 1.1",
      code: "1.1",
      depth: 1,
      sortOrder: 1,
    })
    .returning();
  createdTopics.push(topic1a);

  const [topic1b] = await db
    .insert(topics)
    .values({
      qualificationVersionId: version.id,
      parentTopicId: unit1.id,
      name: "Topic 1.2",
      code: "1.2",
      depth: 1,
      sortOrder: 2,
    })
    .returning();
  createdTopics.push(topic1b);

  const [unit2] = await db
    .insert(topics)
    .values({
      qualificationVersionId: version.id,
      name: "Unit 2",
      code: "2",
      depth: 0,
      sortOrder: 2,
    })
    .returning();
  createdTopics.push(unit2);

  const [topic2a] = await db
    .insert(topics)
    .values({
      qualificationVersionId: version.id,
      parentTopicId: unit2.id,
      name: "Topic 2.1",
      code: "2.1",
      depth: 1,
      sortOrder: 1,
    })
    .returning();
  createdTopics.push(topic2a);

  // Add an edge: Topic 1.1 is prerequisite for Topic 1.2
  await db.insert(topicEdges).values({
    fromTopicId: topic1a.id,
    toTopicId: topic1b.id,
    edgeType: "prerequisite",
  });

  return {
    examBoard: board,
    subject,
    qualification,
    qualificationVersion: version,
    qualificationVersionId: version.id as QualificationVersionId,
    component,
    topics: createdTopics,
  };
}

export async function enrollLearnerInQualification(
  learnerId: string,
  qualificationVersionId: string,
  overrides?: { targetGrade?: string; examDate?: string }
) {
  const db = getTestDb();
  const [enrollment] = await db
    .insert(learnerQualifications)
    .values({
      learnerId,
      qualificationVersionId,
      targetGrade: overrides?.targetGrade ?? "7",
      examDate: overrides?.examDate ?? "2026-06-15",
    })
    .returning();
  return enrollment;
}

export function resetFixtureCounter() {
  counter = 0;
}

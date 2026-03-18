import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import {
  setupTestDatabase,
  cleanupTestDatabase,
  teardownTestDatabase,
  getTestDb,
} from "@/test/setup";
import {
  createTestOrg,
  createTestLearner,
  createTestUser,
  resetFixtureCounter,
} from "@/test/fixtures";
import {
  policies,
  classes,
  enrollments,
  learnerQualifications,
  examBoards,
  subjects,
  qualifications,
  qualificationVersions,
} from "@/db/schema";
import {
  resolvePolicy,
  resolveAllPolicies,
  getLearnerScopes,
} from "./policies";
import type { LearnerId } from "@/lib/types";

let db: ReturnType<typeof getTestDb>;

beforeAll(async () => {
  db = await setupTestDatabase();
});

beforeEach(async () => {
  await cleanupTestDatabase();
  resetFixtureCounter();
});

afterAll(async () => {
  await teardownTestDatabase();
});

async function createQualificationVersion() {
  const [board] = await db
    .insert(examBoards)
    .values({ name: "AQA", code: "AQA-P", country: "GB" })
    .returning();
  const [subject] = await db
    .insert(subjects)
    .values({ name: "Biology", slug: "biology-p" })
    .returning();
  const [qual] = await db
    .insert(qualifications)
    .values({ subjectId: subject.id, level: "GCSE", name: "GCSE Biology" })
    .returning();
  const [version] = await db
    .insert(qualificationVersions)
    .values({
      qualificationId: qual.id,
      examBoardId: board.id,
      versionCode: "8461",
      firstExamYear: 2018,
    })
    .returning();
  return version;
}

describe("getLearnerScopes", () => {
  it("returns learner and global scopes for a basic learner", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const learnerId = learner.id as LearnerId;

    const scopes = await getLearnerScopes(learnerId, db);

    expect(scopes).toContainEqual({
      scopeType: "learner",
      scopeId: learnerId,
    });
    expect(scopes).toContainEqual({ scopeType: "org", scopeId: org.id });
    expect(scopes).toContainEqual({ scopeType: "global", scopeId: null });
  });

  it("includes class scopes for enrolled learner", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const learnerId = learner.id as LearnerId;

    const [cls] = await db
      .insert(classes)
      .values({
        orgId: org.id,
        name: "10B Biology",
        academicYear: "2025-2026",
      })
      .returning();

    await db.insert(enrollments).values({
      learnerId: learner.id,
      classId: cls.id,
    });

    const scopes = await getLearnerScopes(learnerId, db);

    expect(scopes).toContainEqual({ scopeType: "class", scopeId: cls.id });
  });

  it("excludes unenrolled classes", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const learnerId = learner.id as LearnerId;

    const [cls] = await db
      .insert(classes)
      .values({
        orgId: org.id,
        name: "10B Biology",
        academicYear: "2025-2026",
      })
      .returning();

    await db.insert(enrollments).values({
      learnerId: learner.id,
      classId: cls.id,
      unenrolledAt: new Date(),
    });

    const scopes = await getLearnerScopes(learnerId, db);

    const classScopes = scopes.filter((s) => s.scopeType === "class");
    expect(classScopes).toHaveLength(0);
  });

  it("includes qualification scopes for active qualifications", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const learnerId = learner.id as LearnerId;
    const version = await createQualificationVersion();

    await db.insert(learnerQualifications).values({
      learnerId: learner.id,
      qualificationVersionId: version.id,
      status: "active",
    });

    const scopes = await getLearnerScopes(learnerId, db);

    expect(scopes).toContainEqual({
      scopeType: "qualification",
      scopeId: version.id,
    });
  });

  it("excludes dropped qualifications", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const learnerId = learner.id as LearnerId;
    const version = await createQualificationVersion();

    await db.insert(learnerQualifications).values({
      learnerId: learner.id,
      qualificationVersionId: version.id,
      status: "dropped",
    });

    const scopes = await getLearnerScopes(learnerId, db);

    const qualScopes = scopes.filter((s) => s.scopeType === "qualification");
    expect(qualScopes).toHaveLength(0);
  });
});

describe("resolvePolicy", () => {
  it("returns null when no policy exists", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const learnerId = learner.id as LearnerId;

    const result = await resolvePolicy(
      learnerId,
      "nonexistent_policy",
      db
    );

    expect(result).toBeNull();
  });

  it("resolves a global policy", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const learnerId = learner.id as LearnerId;

    await db.insert(policies).values({
      scopeType: "global",
      scopeId: null,
      key: "session_time_limit",
      value: 45,
    });

    const result = await resolvePolicy(learnerId, "session_time_limit", db);

    expect(result).not.toBeNull();
    expect(result!.scopeType).toBe("global");
    expect(result!.value).toBe(45);
  });

  it("resolves an org-level policy", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const learnerId = learner.id as LearnerId;

    await db.insert(policies).values({
      scopeType: "org",
      scopeId: org.id,
      key: "essay_generation_allowed",
      value: false,
    });

    const result = await resolvePolicy(
      learnerId,
      "essay_generation_allowed",
      db
    );

    expect(result).not.toBeNull();
    expect(result!.scopeType).toBe("org");
    expect(result!.value).toBe(false);
  });

  it("resolves a learner-level policy", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const learnerId = learner.id as LearnerId;

    await db.insert(policies).values({
      scopeType: "learner",
      scopeId: learner.id,
      key: "difficulty_override",
      value: "easy",
    });

    const result = await resolvePolicy(learnerId, "difficulty_override", db);

    expect(result).not.toBeNull();
    expect(result!.scopeType).toBe("learner");
    expect(result!.value).toBe("easy");
  });

  it("learner policy overrides org policy (most specific wins)", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const learnerId = learner.id as LearnerId;

    await db.insert(policies).values([
      {
        scopeType: "org",
        scopeId: org.id,
        key: "session_time_limit",
        value: 30,
      },
      {
        scopeType: "learner",
        scopeId: learner.id,
        key: "session_time_limit",
        value: 60,
      },
    ]);

    const result = await resolvePolicy(learnerId, "session_time_limit", db);

    expect(result).not.toBeNull();
    expect(result!.scopeType).toBe("learner");
    expect(result!.value).toBe(60);
  });

  it("class policy overrides org policy", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const learnerId = learner.id as LearnerId;

    const [cls] = await db
      .insert(classes)
      .values({
        orgId: org.id,
        name: "10B Biology",
        academicYear: "2025-2026",
      })
      .returning();

    await db.insert(enrollments).values({
      learnerId: learner.id,
      classId: cls.id,
    });

    await db.insert(policies).values([
      {
        scopeType: "org",
        scopeId: org.id,
        key: "focus_components",
        value: ["Paper 1"],
      },
      {
        scopeType: "class",
        scopeId: cls.id,
        key: "focus_components",
        value: ["Paper 2"],
      },
    ]);

    const result = await resolvePolicy(learnerId, "focus_components", db);

    expect(result).not.toBeNull();
    expect(result!.scopeType).toBe("class");
    expect(result!.value).toEqual(["Paper 2"]);
  });

  it("learner policy overrides class, org, and global", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const learnerId = learner.id as LearnerId;

    const [cls] = await db
      .insert(classes)
      .values({
        orgId: org.id,
        name: "10B Biology",
        academicYear: "2025-2026",
      })
      .returning();

    await db.insert(enrollments).values({
      learnerId: learner.id,
      classId: cls.id,
    });

    await db.insert(policies).values([
      { scopeType: "global", scopeId: null, key: "max_hints", value: 1 },
      { scopeType: "org", scopeId: org.id, key: "max_hints", value: 2 },
      { scopeType: "class", scopeId: cls.id, key: "max_hints", value: 3 },
      {
        scopeType: "learner",
        scopeId: learner.id,
        key: "max_hints",
        value: 5,
      },
    ]);

    const result = await resolvePolicy(learnerId, "max_hints", db);

    expect(result).not.toBeNull();
    expect(result!.scopeType).toBe("learner");
    expect(result!.value).toBe(5);
  });

  it("does not match policies from other orgs", async () => {
    const org1 = await createTestOrg({ slug: "org-a" });
    const org2 = await createTestOrg({ slug: "org-b" });
    const learner = await createTestLearner(org1.id);
    const learnerId = learner.id as LearnerId;

    await db.insert(policies).values({
      scopeType: "org",
      scopeId: org2.id,
      key: "some_policy",
      value: "should not see",
    });

    const result = await resolvePolicy(learnerId, "some_policy", db);

    expect(result).toBeNull();
  });

  it("resolves qualification-scoped policy", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const learnerId = learner.id as LearnerId;
    const version = await createQualificationVersion();

    await db.insert(learnerQualifications).values({
      learnerId: learner.id,
      qualificationVersionId: version.id,
      status: "active",
    });

    await db.insert(policies).values({
      scopeType: "qualification",
      scopeId: version.id,
      key: "mark_scheme_strict",
      value: true,
    });

    const result = await resolvePolicy(learnerId, "mark_scheme_strict", db);

    expect(result).not.toBeNull();
    expect(result!.scopeType).toBe("qualification");
    expect(result!.value).toBe(true);
  });

  it("org policy overrides qualification policy", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const learnerId = learner.id as LearnerId;
    const version = await createQualificationVersion();

    await db.insert(learnerQualifications).values({
      learnerId: learner.id,
      qualificationVersionId: version.id,
      status: "active",
    });

    await db.insert(policies).values([
      {
        scopeType: "qualification",
        scopeId: version.id,
        key: "ai_features",
        value: "full",
      },
      {
        scopeType: "org",
        scopeId: org.id,
        key: "ai_features",
        value: "limited",
      },
    ]);

    const result = await resolvePolicy(learnerId, "ai_features", db);

    expect(result).not.toBeNull();
    expect(result!.scopeType).toBe("org");
    expect(result!.value).toBe("limited");
  });
});

describe("resolveAllPolicies", () => {
  it("returns empty array when no policies exist", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const learnerId = learner.id as LearnerId;

    const result = await resolveAllPolicies(learnerId, db);

    expect(result).toEqual([]);
  });

  it("returns all applicable policies", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const learnerId = learner.id as LearnerId;

    await db.insert(policies).values([
      { scopeType: "global", scopeId: null, key: "policy_a", value: "global" },
      { scopeType: "org", scopeId: org.id, key: "policy_b", value: "org" },
      {
        scopeType: "learner",
        scopeId: learner.id,
        key: "policy_c",
        value: "learner",
      },
    ]);

    const result = await resolveAllPolicies(learnerId, db);

    expect(result).toHaveLength(3);
    const keys = result.map((r) => r.key).sort();
    expect(keys).toEqual(["policy_a", "policy_b", "policy_c"]);
  });

  it("deduplicates by key, keeping most specific", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const learnerId = learner.id as LearnerId;

    await db.insert(policies).values([
      {
        scopeType: "global",
        scopeId: null,
        key: "shared_policy",
        value: "global_val",
      },
      {
        scopeType: "org",
        scopeId: org.id,
        key: "shared_policy",
        value: "org_val",
      },
      {
        scopeType: "learner",
        scopeId: learner.id,
        key: "shared_policy",
        value: "learner_val",
      },
    ]);

    const result = await resolveAllPolicies(learnerId, db);

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("shared_policy");
    expect(result[0].scopeType).toBe("learner");
    expect(result[0].value).toBe("learner_val");
  });

  it("handles mix of unique and overlapping keys", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const learnerId = learner.id as LearnerId;

    await db.insert(policies).values([
      {
        scopeType: "global",
        scopeId: null,
        key: "time_limit",
        value: 30,
      },
      {
        scopeType: "org",
        scopeId: org.id,
        key: "time_limit",
        value: 45,
      },
      {
        scopeType: "global",
        scopeId: null,
        key: "safety_mode",
        value: true,
      },
      {
        scopeType: "learner",
        scopeId: learner.id,
        key: "custom_pref",
        value: "x",
      },
    ]);

    const result = await resolveAllPolicies(learnerId, db);

    expect(result).toHaveLength(3);

    const timeLimit = result.find((r) => r.key === "time_limit");
    expect(timeLimit!.scopeType).toBe("org");
    expect(timeLimit!.value).toBe(45);

    const safetyMode = result.find((r) => r.key === "safety_mode");
    expect(safetyMode!.scopeType).toBe("global");

    const customPref = result.find((r) => r.key === "custom_pref");
    expect(customPref!.scopeType).toBe("learner");
  });

  it("excludes policies from unrelated scopes", async () => {
    const org1 = await createTestOrg({ slug: "org-resolve-a" });
    const org2 = await createTestOrg({ slug: "org-resolve-b" });
    const learner = await createTestLearner(org1.id);
    const learnerId = learner.id as LearnerId;

    await db.insert(policies).values([
      {
        scopeType: "org",
        scopeId: org1.id,
        key: "my_policy",
        value: "mine",
      },
      {
        scopeType: "org",
        scopeId: org2.id,
        key: "their_policy",
        value: "theirs",
      },
    ]);

    const result = await resolveAllPolicies(learnerId, db);

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("my_policy");
  });
});

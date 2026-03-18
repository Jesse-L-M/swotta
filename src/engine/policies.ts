import { eq, and, isNull, inArray } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  policies,
  learnerQualifications,
  enrollments,
  learners,
} from "@/db/schema";
import type { LearnerId, PolicyValue } from "@/lib/types";

const SCOPE_PRIORITY: Record<string, number> = {
  learner: 0,
  class: 1,
  org: 2,
  qualification: 3,
  global: 4,
};

interface ScopeEntry {
  scopeType: "global" | "qualification" | "org" | "class" | "learner";
  scopeId: string | null;
}

export async function getLearnerScopes(
  learnerId: LearnerId,
  db: Database
): Promise<ScopeEntry[]> {
  const scopes: ScopeEntry[] = [];

  scopes.push({ scopeType: "learner", scopeId: learnerId });

  const learnerRows = await db
    .select({ orgId: learners.orgId })
    .from(learners)
    .where(eq(learners.id, learnerId));

  if (learnerRows.length > 0) {
    scopes.push({ scopeType: "org", scopeId: learnerRows[0].orgId });
  }

  const classRows = await db
    .select({ classId: enrollments.classId })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.learnerId, learnerId),
        isNull(enrollments.unenrolledAt)
      )
    );

  for (const row of classRows) {
    scopes.push({ scopeType: "class", scopeId: row.classId });
  }

  const qualRows = await db
    .select({
      qualificationVersionId: learnerQualifications.qualificationVersionId,
    })
    .from(learnerQualifications)
    .where(
      and(
        eq(learnerQualifications.learnerId, learnerId),
        eq(learnerQualifications.status, "active")
      )
    );

  for (const row of qualRows) {
    scopes.push({
      scopeType: "qualification",
      scopeId: row.qualificationVersionId,
    });
  }

  scopes.push({ scopeType: "global", scopeId: null });

  return scopes;
}

export async function resolvePolicy(
  learnerId: LearnerId,
  key: string,
  db: Database
): Promise<PolicyValue | null> {
  const scopes = await getLearnerScopes(learnerId, db);

  const scopeIds = scopes
    .filter((s) => s.scopeId !== null)
    .map((s) => s.scopeId as string);

  const hasGlobal = scopes.some((s) => s.scopeType === "global");

  const conditions = [eq(policies.key, key)];

  const rows = await db
    .select({
      scopeType: policies.scopeType,
      scopeId: policies.scopeId,
      key: policies.key,
      value: policies.value,
    })
    .from(policies)
    .where(and(...conditions));

  const matching = rows.filter((row) => {
    if (row.scopeType === "global" && row.scopeId === null && hasGlobal) {
      return true;
    }
    return (
      row.scopeId !== null &&
      scopeIds.includes(row.scopeId) &&
      scopes.some(
        (s) => s.scopeType === row.scopeType && s.scopeId === row.scopeId
      )
    );
  });

  if (matching.length === 0) {
    return null;
  }

  matching.sort((a, b) => {
    const aPriority = SCOPE_PRIORITY[a.scopeType] ?? 999;
    const bPriority = SCOPE_PRIORITY[b.scopeType] ?? 999;
    return aPriority - bPriority;
  });

  const best = matching[0];
  return {
    scopeType: best.scopeType as PolicyValue["scopeType"],
    scopeId: best.scopeId,
    key: best.key,
    value: best.value,
  };
}

export async function resolveAllPolicies(
  learnerId: LearnerId,
  db: Database
): Promise<PolicyValue[]> {
  const scopes = await getLearnerScopes(learnerId, db);

  const scopeIds = scopes
    .filter((s) => s.scopeId !== null)
    .map((s) => s.scopeId as string);

  const hasGlobal = scopes.some((s) => s.scopeType === "global");

  const rows = await db
    .select({
      scopeType: policies.scopeType,
      scopeId: policies.scopeId,
      key: policies.key,
      value: policies.value,
    })
    .from(policies);

  const matching = rows.filter((row) => {
    if (row.scopeType === "global" && row.scopeId === null && hasGlobal) {
      return true;
    }
    return (
      row.scopeId !== null &&
      scopeIds.includes(row.scopeId) &&
      scopes.some(
        (s) => s.scopeType === row.scopeType && s.scopeId === row.scopeId
      )
    );
  });

  const byKey = new Map<string, typeof matching>();
  for (const row of matching) {
    const existing = byKey.get(row.key);
    if (!existing) {
      byKey.set(row.key, [row]);
    } else {
      existing.push(row);
    }
  }

  const result: PolicyValue[] = [];
  for (const [, entries] of byKey) {
    entries.sort((a, b) => {
      const aPriority = SCOPE_PRIORITY[a.scopeType] ?? 999;
      const bPriority = SCOPE_PRIORITY[b.scopeType] ?? 999;
      return aPriority - bPriority;
    });
    const best = entries[0];
    result.push({
      scopeType: best.scopeType as PolicyValue["scopeType"],
      scopeId: best.scopeId,
      key: best.key,
      value: best.value,
    });
  }

  return result;
}

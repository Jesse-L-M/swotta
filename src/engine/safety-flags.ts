import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { safetyFlags } from "@/db/schema";
import type { LearnerId } from "@/lib/types";

export interface UnresolvedSafetyFlagInput {
  learnerId: LearnerId | string;
  blockAttemptId?: string | null;
  flagType: "disengagement" | "avoidance" | "distress" | "overreliance";
  severity: "low" | "medium" | "high";
  description: string;
  evidence: Record<string, unknown>;
}

export async function upsertUnresolvedSafetyFlag(
  database: Database,
  input: UnresolvedSafetyFlagInput
): Promise<{ id: string; action: "created" | "updated" }> {
  const [existing] = await database
    .select({ id: safetyFlags.id })
    .from(safetyFlags)
    .where(
      and(
        eq(safetyFlags.learnerId, input.learnerId),
        eq(safetyFlags.flagType, input.flagType),
        eq(safetyFlags.resolved, false)
      )
    )
    .limit(1);

  const [row] = await database
    .insert(safetyFlags)
    .values({
      learnerId: input.learnerId,
      blockAttemptId: input.blockAttemptId ?? null,
      flagType: input.flagType,
      severity: input.severity,
      description: input.description,
      evidence: input.evidence,
    })
    .onConflictDoUpdate({
      target: [safetyFlags.learnerId, safetyFlags.flagType],
      targetWhere: sql`${safetyFlags.resolved} = false`,
      set: {
        blockAttemptId: input.blockAttemptId ?? sql`${safetyFlags.blockAttemptId}`,
        severity: input.severity,
        description: input.description,
        evidence: input.evidence,
      },
    })
    .returning({ id: safetyFlags.id });

  return {
    id: row.id,
    action: existing ? "updated" : "created",
  };
}

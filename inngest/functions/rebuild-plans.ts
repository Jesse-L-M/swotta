import { inngest } from "../client";
import { buildWeeklyPlan } from "@/engine/scheduler";
import { db } from "@/lib/db";
import { learnerQualifications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { structuredLog } from "@/lib/logger";
import type { LearnerId } from "@/lib/types";

/**
 * Cron: Monday 00:00 UTC
 * Rebuilds weekly study plans for all active learners.
 * Each learner is processed in a separate step for independent retries.
 */
export const rebuildPlansFunction = inngest.createFunction(
  { id: "scheduling/rebuild-plans" },
  { cron: "0 0 * * 1" },
  async ({ step }) => {
    const activeLearnerIds = await step.run("get-active-learners", async () => {
      const rows = await db
        .selectDistinct({ learnerId: learnerQualifications.learnerId })
        .from(learnerQualifications)
        .where(eq(learnerQualifications.status, "active"));
      return rows.map((r) => r.learnerId);
    });

    if (activeLearnerIds.length === 0) {
      return { processed: 0, plans: [] };
    }

    const now = new Date();
    const monday = new Date(now);
    monday.setUTCHours(0, 0, 0, 0);

    const plans: Array<{ learnerId: string; planId: string; blockCount: number }> = [];

    for (const learnerId of activeLearnerIds) {
      const result = await step.run(`rebuild-plan-${learnerId}`, async () => {
        const plan = await buildWeeklyPlan(learnerId as LearnerId, monday, db);
        return { learnerId, planId: plan.planId, blockCount: plan.blocks.length };
      });
      plans.push(result);
    }

    structuredLog("scheduling.rebuild-plans.complete", {
      learnersProcessed: activeLearnerIds.length,
      totalBlocks: plans.reduce((sum, p) => sum + p.blockCount, 0),
    });

    return { processed: activeLearnerIds.length, plans };
  },
);

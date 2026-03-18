import { Inngest } from "inngest";
import { db } from "@/lib/db";
import { learnerQualifications, learners } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

const inngest = new Inngest({ id: "swotta" });

/**
 * Cron: Sunday 18:00 UTC
 * Queries all active learners and emits one `report.generate` event per learner.
 */
export const weeklyReportTrigger = inngest.createFunction(
  { id: "reporting/weekly-report-trigger" },
  { cron: "0 18 * * 0" },
  async ({ step }) => {
    // Get all learners with at least one active qualification
    const activeLearnerIds = await step.run("get-active-learners", async () => {
      const rows = await db
        .selectDistinct({ learnerId: learnerQualifications.learnerId })
        .from(learnerQualifications)
        .where(eq(learnerQualifications.status, "active"));
      return rows.map((r) => r.learnerId);
    });

    if (activeLearnerIds.length === 0) {
      return { processed: 0 };
    }

    // Compute the reporting period (previous Monday to Sunday)
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const periodEnd = new Date(now);
    periodEnd.setUTCDate(now.getUTCDate() - dayOfWeek);
    periodEnd.setUTCHours(23, 59, 59, 999);

    const periodStart = new Date(periodEnd);
    periodStart.setUTCDate(periodEnd.getUTCDate() - 6);
    periodStart.setUTCHours(0, 0, 0, 0);

    // Fan-out: emit one event per learner
    await step.sendEvent(
      "emit-report-events",
      activeLearnerIds.map((learnerId) => ({
        name: "report.generate" as const,
        data: {
          learnerId,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        },
      })),
    );

    return { processed: activeLearnerIds.length };
  },
);

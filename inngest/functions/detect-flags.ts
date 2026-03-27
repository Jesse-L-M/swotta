import { inngest } from "../client";
import { db } from "@/lib/db";
import { learnerQualifications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { detectFlags, mapFlagTypeToEnum } from "@/engine/reporting";
import { upsertUnresolvedSafetyFlag } from "@/engine/safety-flags";
import type { LearnerId } from "@/lib/types";

/**
 * Cron: daily 06:00 UTC
 * Scans all active learners for safety/engagement flags.
 */
export const detectFlagsCron = inngest.createFunction(
  { id: "reporting/detect-flags" },
  { cron: "0 6 * * *" },
  async ({ step }) => {
    const activeLearnerIds = await step.run("get-active-learners", async () => {
      const rows = await db
        .selectDistinct({ learnerId: learnerQualifications.learnerId })
        .from(learnerQualifications)
        .where(eq(learnerQualifications.status, "active"));
      return rows.map((r) => r.learnerId);
    });

    let totalFlags = 0;
    let updatedFlags = 0;

    for (const learnerId of activeLearnerIds) {
      const flags = await step.run(`detect-flags-${learnerId}`, async () => {
        return detectFlags(learnerId as LearnerId);
      });

      if (flags.length > 0) {
        await step.run(`store-flags-${learnerId}`, async () => {
          for (const flag of flags) {
            const result = await upsertUnresolvedSafetyFlag(db, {
              learnerId,
              flagType: mapFlagTypeToEnum(flag.type),
              severity: flag.severity,
              description: flag.description,
              evidence: flag.evidence as Record<string, unknown>,
            });
            if (result.action === "created") {
              totalFlags += 1;
              continue;
            }
            updatedFlags += 1;
          }
        });
      }
    }

    return {
      learnersScanned: activeLearnerIds.length,
      flagsCreated: totalFlags,
      flagsUpdated: updatedFlags,
    };
  },
);

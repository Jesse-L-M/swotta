import { Inngest } from "inngest";
import { db } from "@/lib/db";
import { learnerQualifications, safetyFlags } from "@/db/schema";
import { eq } from "drizzle-orm";
import { detectFlags } from "@/engine/reporting";
import type { LearnerId } from "@/lib/types";

const inngest = new Inngest({ id: "swotta" });

type FlagTypeEnum = "disengagement" | "avoidance" | "distress" | "overreliance";

function toFlagType(type: string): FlagTypeEnum {
  const valid: FlagTypeEnum[] = ["disengagement", "avoidance", "distress", "overreliance"];
  return valid.includes(type as FlagTypeEnum) ? (type as FlagTypeEnum) : "distress";
}

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

    for (const learnerId of activeLearnerIds) {
      const flags = await step.run(`detect-flags-${learnerId}`, async () => {
        return detectFlags(learnerId as LearnerId);
      });

      if (flags.length > 0) {
        await step.run(`store-flags-${learnerId}`, async () => {
          for (const flag of flags) {
            await db.insert(safetyFlags).values({
              learnerId,
              flagType: toFlagType(flag.type),
              severity: flag.severity,
              description: flag.description,
              evidence: flag.evidence as Record<string, unknown>,
            });
          }
        });
        totalFlags += flags.length;
      }
    }

    return {
      learnersScanned: activeLearnerIds.length,
      flagsCreated: totalFlags,
    };
  },
);

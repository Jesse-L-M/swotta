import { inngest } from "../client";
import { db } from "@/lib/db";
import {
  getActiveLearnerIds,
  processLearnerNotifications,
} from "@/engine/notifications";
import type { LearnerId } from "@/lib/types";
import { structuredLog } from "@/lib/logger";

/**
 * Daily notification cron — runs once per day, fans out per learner.
 * Checks each active learner for nudge/alert triggers and sends
 * notifications via email + in-app.
 *
 * Schedule: daily at 17:00 UTC (18:00 UK summer, 17:00 UK winter)
 * Chosen to catch students before their evening study window.
 */
export const sendNotificationsCron = inngest.createFunction(
  { id: "notifications/daily-check", retries: 2 },
  { cron: "0 17 * * *" },
  async ({ step }) => {
    const activeLearnerIds = await step.run("get-active-learners", async () => {
      return getActiveLearnerIds(db);
    });

    let totalSent = 0;
    let totalSkipped = 0;

    for (const learnerId of activeLearnerIds) {
      const result = await step.run(`notify-${learnerId}`, async () => {
        try {
          return await processLearnerNotifications(learnerId as LearnerId);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          structuredLog("notification.learner-failed", { learnerId, error: msg });
          return { learnerId, sent: [], skipped: [{ type: "student_nudge" as const, reason: `error: ${msg}` }] };
        }
      });

      totalSent += result.sent.length;
      totalSkipped += result.skipped.length;
    }

    return {
      learnersProcessed: activeLearnerIds.length,
      notificationsSent: totalSent,
      notificationsSkipped: totalSkipped,
    };
  },
);

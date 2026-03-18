import { Inngest } from "inngest";
import { generateWeeklyReport, sendWeeklyReport } from "@/engine/reporting";
import type { LearnerId } from "@/lib/types";

const inngest = new Inngest({ id: "swotta" });

/**
 * Event: report.generate
 * Generates and sends a weekly report for a single learner.
 * Each learner's report is processed independently (fan-out from trigger).
 * Retryable without affecting other learners.
 */
export const weeklyReportGenerate = inngest.createFunction(
  {
    id: "reporting/weekly-report-generate",
    retries: 3,
  },
  { event: "report.generate" },
  async ({ event, step }) => {
    const { learnerId, periodStart, periodEnd } = event.data as {
      learnerId: string;
      periodStart: string;
      periodEnd: string;
    };

    // Step 1: Generate the report
    const report = await step.run("generate-report", async () => {
      return generateWeeklyReport(
        learnerId as LearnerId,
        new Date(periodStart),
        new Date(periodEnd),
      );
    });

    // Step 2: Send the report to guardians
    const sendResult = await step.run("send-report", async () => {
      return sendWeeklyReport(report.reportId);
    });

    return {
      reportId: report.reportId,
      learnerId,
      sentTo: sendResult.sentTo,
    };
  },
);

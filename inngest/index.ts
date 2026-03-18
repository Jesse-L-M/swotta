import { processFileFunction } from "./functions/process-file";
import { updateQueueFunction } from "./functions/update-queue";
import { rebuildPlansFunction } from "./functions/rebuild-plans";
import { decayCheckFunction } from "./functions/decay-check";
import { weeklyReportTrigger } from "./functions/weekly-report-trigger";
import { weeklyReportGenerate } from "./functions/weekly-report-generate";
import { detectFlagsCron } from "./functions/detect-flags";

/**
 * All Inngest functions registered in the application.
 * Passed to serve() in the API route handler.
 *
 * Functions by trigger:
 *   Events:
 *     - ingestion/process-file       → "source.file.uploaded"
 *     - scheduling/update-queue      → "attempt.completed"
 *     - reporting/weekly-report-generate → "report.generate"
 *   Crons:
 *     - scheduling/rebuild-plans     → Monday 00:00 UTC
 *     - mastery/decay-check          → daily 00:00 UTC
 *     - reporting/weekly-report-trigger → Monday 00:05 UTC
 *     - reporting/detect-flags       → daily 06:00 UTC
 */
export const functions = [
  processFileFunction,
  updateQueueFunction,
  rebuildPlansFunction,
  decayCheckFunction,
  weeklyReportTrigger,
  weeklyReportGenerate,
  detectFlagsCron,
];

import { inngest } from "../client";
import { processFile } from "@/engine/ingestion";
import { structuredLog } from "@/lib/logger";

/**
 * Event: "source.file.uploaded"
 * Runs the full ingestion pipeline for one uploaded file:
 * extract text, chunk, embed, map to topics.
 */
export const processFileFunction = inngest.createFunction(
  {
    id: "ingestion/process-file",
    retries: 3,
  },
  { event: "source.file.uploaded" },
  async ({ event, step }) => {
    const { fileId, qualificationVersionId } = event.data;

    const result = await step.run("process-file", async () => {
      return processFile(fileId, undefined, qualificationVersionId ? { qualificationVersionId } : undefined);
    });

    structuredLog("ingestion.process-file.complete", {
      fileId,
      chunksCreated: result.chunksCreated,
      embeddingsCreated: result.embeddingsCreated,
      mappingsCreated: result.mappingsCreated,
      topicsCovered: result.topicsCovered.length,
    });

    return result;
  },
);

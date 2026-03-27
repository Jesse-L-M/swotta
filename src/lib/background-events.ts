import { inngest } from "../../inngest/client";
import type { AttemptOutcome } from "@/lib/types";

export async function queueSourceFileUploaded(
  fileId: string,
  qualificationVersionId?: string
): Promise<void> {
  await inngest.send({
    id: `source-file-uploaded:${fileId}`,
    name: "source.file.uploaded",
    data: qualificationVersionId ? { fileId, qualificationVersionId } : { fileId },
  });
}

export async function queueAttemptCompleted(
  attempt: AttemptOutcome
): Promise<void> {
  await inngest.send({
    id: `attempt-completed:${attempt.blockId}`,
    name: "attempt.completed",
    data: attempt,
  });
}

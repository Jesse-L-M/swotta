import { EventSchemas, Inngest } from "inngest";
import type { AttemptOutcome } from "@/lib/types";

// ---------------------------------------------------------------------------
// Event schemas — type-safe definitions for all Inngest events in the system
// ---------------------------------------------------------------------------

type Events = {
  "source.file.uploaded": {
    data: {
      fileId: string;
      qualificationVersionId?: string;
    };
  };
  "report.generate": {
    data: {
      learnerId: string;
      periodStart: string;
      periodEnd: string;
    };
  };
  "attempt.completed": {
    data: AttemptOutcome;
  };
};

// ---------------------------------------------------------------------------
// Shared client — single Inngest instance for the entire application
// ---------------------------------------------------------------------------

export const inngest = new Inngest({
  id: "swotta",
  schemas: new EventSchemas().fromRecord<Events>(),
});

export type { Events };

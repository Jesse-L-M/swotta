# TODOs

## Wire endSession to call mastery.processAttemptOutcome

**What:** After `endSession` updates the DB, call the mastery engine to update the learner's topic state (mastery level, ease factor, next review date) based on the session outcome.

**Why:** Without this, completed sessions don't update the spaced repetition model. The scheduler will keep scheduling the same topics at the same priority forever.

**Pros:** Closes the feedback loop between sessions and the mastery/scheduling system.

**Cons:** Blocked by Task 1.3 (mastery engine) being built in parallel.

**Context:** INTERFACES.md says session runner "After session ends, calls `mastery.processAttemptOutcome`." The `AttemptOutcome` type is already constructed in `endSession` (`session.ts`) and ready to pass. Once Task 1.3 merges, this is a ~5 line integration: import `processAttemptOutcome`, call it after the DB transaction in `endSession`, pass the `outcome` object.

**Depends on:** Task 1.3 (scheduler + mastery engine) merged to main.

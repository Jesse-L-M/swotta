# TODOs

## Wire Clerk auth into parent pages

**Added:** 2026-03-18 | **Source:** Task 2.3 eng review

**What:** Replace `getGuardianUserId()` stubs with real Clerk auth calls in `src/app/(parent)/dashboard/page.tsx` and `src/app/(parent)/learners/[id]/page.tsx`.

**Why:** Both parent pages currently return `null` from the auth stub, so they always show "Sign in required." Once Task 2.1 (Auth + Layout Shell) merges, these need to call Clerk's `currentUser()` and look up the guardian's user ID via the `users` table.

**Pros:** Makes parent pages functional for real guardian users.

**Cons:** Blocked until Task 2.1 merges and provides `src/lib/auth.ts` helpers.

**Context:** The `getGuardianUserId()` function in each page is a placeholder marked with `// TODO: Replace with real Clerk auth once Task 2.1 (Auth + Layout) is merged`. The pattern should be: call `requireAuth()` → get `userId` → query `users` table by `clerkId` → return `user.id`. The guardian link scoping is already implemented in the page queries.

**Depends on:** Task 2.1 (Auth + Layout Shell) merged to main.

---

## Wire endSession to call mastery.processAttemptOutcome

**What:** After `endSession` updates the DB, call the mastery engine to update the learner's topic state (mastery level, ease factor, next review date) based on the session outcome.

**Why:** Without this, completed sessions don't update the spaced repetition model. The scheduler will keep scheduling the same topics at the same priority forever.

**Pros:** Closes the feedback loop between sessions and the mastery/scheduling system.

**Cons:** Blocked by Task 1.3 (mastery engine) being built in parallel.

**Context:** INTERFACES.md says session runner "After session ends, calls `mastery.processAttemptOutcome`." The `AttemptOutcome` type is already constructed in `endSession` (`session.ts`) and ready to pass. Once Task 1.3 merges, this is a ~5 line integration: import `processAttemptOutcome`, call it after the DB transaction in `endSession`, pass the `outcome` object.

**Depends on:** Task 1.3 (scheduler + mastery engine) merged to main.

---

## Scheduler: Integrate task_rules table into block type selection
**Added:** 2026-03-18 | **Source:** Task 1.3 eng review

`selectBlockType` in `src/engine/scheduler.ts` uses hardcoded mastery/streak/overdue thresholds. The schema has a `task_rules` table designed to map topics to block types with difficulty ranges. Once Task 1.1 populates task_rules with seed data, the scheduler should read those rules and fall back to the heuristic when no rule matches.

**Depends on:** Task 1.1 (curriculum loader providing task_rules seed data)

---

## Scheduler: Add idempotency guard to getNextBlocks

**Added:** 2026-03-18 | **Source:** Task 1.3 eng review

`getNextBlocks` in `src/engine/scheduler.ts` creates new `study_blocks` records every call. Repeated dashboard loads would accumulate duplicate pending blocks. Options: (a) getNextBlocks checks for existing pending blocks before creating new ones, or (b) the Phase 2 API route manages the lifecycle (check-then-call). The caller contract should be documented either way.

**Depends on:** Nothing — should be resolved before Phase 2 Task 2.2 (student dashboard)

---

## Reconcile test seed with curriculum loader

**What:** Replace the manual `seedGCSEBiology()` implementation in `src/test/seed.ts` with a call to `loadQualification(db, seedJson)` from `src/engine/curriculum.ts`.

**Why:** Currently there are two sources of AQA Biology seed data — the hand-written test seeder and the JSON seed file. They will drift over time (the JSON seed has more topics, misconception rules, and richer data). Using the production loader in tests ensures they stay in sync and tests exercise the real codepath.

**Pros:** Single source of truth for seed data. Tests exercise the actual loader. No manual topic insertion to maintain.

**Cons:** Slightly slower test setup (transaction + validation overhead, ~100ms). Couples test infra to the engine module.

**Context:** `src/test/seed.ts` was created in Phase 0 (Task 0.4) as shared test infrastructure. `src/engine/curriculum.ts` was created in Phase 1 (Task 1.1). The JSON seed at `src/data/seeds/gcse-biology-aqa.json` is the canonical data source. The test seeder was written before the loader existed.

**Depends on:** Task 1.1 (curriculum loader) must be merged first. This change touches `src/test/seed.ts` which is shared infra — coordinate with other Phase 1 agents.

---

## Image OCR via Gemini Pro 3 on Vertex AI

**What:** Add image mime type support (PNG, JPG, HEIC) to `defaultExtractText` in `src/engine/ingestion.ts` using Google Vertex AI's Gemini Pro 3 model for OCR.

**Why:** Students upload photos of handwritten notes, screenshots of slides, and scanned worksheets. The architecture spec (`docs/ARCHITECTURE.md`) lists "Images: Claude vision" as part of the ingestion flow, but the preferred model is Gemini Pro 3 due to superior OCR capabilities.

**Approach:** Use `@google-cloud/vertexai` SDK. Add a new branch in `defaultExtractText` for image/* mime types. Send the image buffer to Gemini Pro 3 with a prompt to extract all text content, preserving structure (headings, lists, equations).

**Depends on:** GCP infrastructure setup (Task 3.1) for Vertex AI API access and credentials. The project already uses GCP (Cloud Run, Cloud SQL, Cloud Storage), so Vertex AI fits naturally.

**Added:** 2026-03-18 via /plan-eng-review on branch Jesse-L-M/ingestion-pipeline.

---

## Extract BLOCK_TYPE_LABELS to shared location

**What:** Move the `BLOCK_TYPE_LABELS` mapping (block_type enum to human-readable label) from both `src/ai/study-modes.ts` and `src/components/session/session-view.tsx` to a shared location like `src/lib/labels.ts`.

**Why:** DRY violation — same 8-entry mapping in two files. If a new block type is added or a label changes, both need updating.

**Pros:** Single source of truth. Both engine and UI import from one place.

**Cons:** Touches a file owned by Task 1.4 (`study-modes.ts`), so needs coordination.

**Context:** Both copies are identical. The labels are stable (block types are schema-level). Low risk of drift but a clean-up worth doing. The natural home is `src/lib/labels.ts` or added to `src/lib/types.ts`.

**Depends on:** Nothing — can be done anytime. Coordinate with Task 1.4 owner when modifying `study-modes.ts`.

**Added:** 2026-03-18 via /plan-eng-review on branch Jesse-L-M/study-session-ui.

---

## Persist study block reason string in schema

**Added:** 2026-03-18 | **Source:** Task 2.2 eng review

**What:** Add a `reason` varchar column to `study_blocks` so the human-readable reason ("Overdue review", "Low mastery", "Exam approaching") is persisted at creation time.

**Why:** The scheduler computes the reason in `buildCandidatePool` (`scheduler.ts`) but only returns it in the `StudyBlock` struct — it's never written to the DB. When `loadTodayQueue` (`dashboard/data.ts`) reads existing pending blocks, it has to hardcode `"Scheduled review"` because the real reason is lost.

**Pros:** Dashboard shows accurate context per block. Small schema addition (nullable varchar, no migration risk).

**Cons:** Requires coordinating with schema owner to add column + migration. Low-priority cosmetic issue.

**Context:** The `StudyBlock` interface (`types.ts`) has `reason: string`. The scheduler sets it to "Overdue review", "Low mastery", "Exam approaching", or "Returning after gap" based on topic state. The fix is: (1) add `reason varchar(100)` to `study_blocks`, (2) pass the reason when inserting in `getNextBlocks` and `buildWeeklyPlan`, (3) read it in `loadTodayQueue` instead of hardcoding.

**Depends on:** Schema owner agreement (Phase 0 territory). The scheduler (`scheduler.ts`, Task 1.3) would also need a small update to persist the field.

---

## Add staging environment CD trigger

**Added:** 2026-03-18 | **Source:** Task 3.1 eng review

**What:** Add a staging CD trigger to `.github/workflows/deploy.yml` that deploys to a separate Cloud Run service on push to a `staging` branch or via manual workflow dispatch.

**Why:** Lets you test infrastructure and app changes in a staging environment before they hit production.

**Pros:** Safer deploy workflow. Catches config issues early. Terraform modules already support staging via separate `.tfvars` files.

**Cons:** Requires a second set of GCP resources (second Cloud SQL instance ~$8/mo for db-f1-micro). Adds a second CD job to the workflow.

**Context:** The Terraform modules already parameterize everything via `var.environment`. A staging deploy is mostly duplicating the CD job with `_CLOUD_RUN_SERVICE=swotta-app-staging` and different substitutions. The `terraform/terraform.tfvars.example` shows the staging vs production differences.

**Depends on:** Task 3.1 (GCP deployment) merged. Terraform applied for staging environment.

---

## Wire scheduler to read exam proximity phase

**Added:** 2026-03-18 | **Source:** Task 5.5 eng review

**What:** Update `getNextBlocks` and `buildWeeklyPlan` in `src/engine/scheduler.ts` to call `getExamPhase` from `src/engine/proximity.ts` and apply the returned `schedulerWeights` when selecting block types and prioritizing topics.

**Why:** The proximity engine (Task 5.5) returns per-phase weights for block types (`blockTypeWeights`), topic priorities (`newTopicWeight`, `weakTopicWeight`, `reviewTopicWeight`), and session length (`sessionMinutesMultiplier`). Without this wiring, the scheduler ignores exam proximity entirely — a student 3 days before their exam gets the same block mix as one 3 months out.

**Pros:** Makes the scheduler time-aware. Students get retrieval drills and timed practice as exams approach instead of exploratory essay planning.

**Cons:** Adds a DB query per `getNextBlocks` call (reads `learner_qualifications` for exam date). Minimal overhead.

**Context:** The integration point is in `buildCandidatePool` (scheduler.ts) where block types and priorities are assigned. Multiply each candidate's priority by the relevant weight from `schedulerWeights`. For block type selection in `selectBlockType`/`selectBlockTypeSync`, use `blockTypeWeights` to bias the selection. The `toneModifiers` are consumed by the session runner (separate TODO), not the scheduler.

**Depends on:** Task 5.5 (proximity engine) merged. Touches `src/engine/scheduler.ts` (Task 1.3 territory).

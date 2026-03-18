# TODOs

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

## Scheduler: Create Inngest function wrappers

**Added:** 2026-03-18 | **Source:** Task 1.3 eng review

PLAN.md Task 1.3 owns `inngest/functions/update-queue.ts`, `rebuild-plans.ts`, `decay-check.ts`. These are thin wrappers that call engine functions on cron/event triggers:
- `update-queue`: on `attempt.completed` event, update review queue
- `rebuild-plans`: Monday 00:00 UTC cron, call `buildWeeklyPlan` for all active learners
- `decay-check`: daily 00:00 UTC cron, scan `learner_topic_state` for overdue topics, insert `review_queue` entries

The engine functions are ready. The wrappers need the Inngest client from Task 3.2.

**Depends on:** Task 3.2 (Inngest client config and function registry)

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

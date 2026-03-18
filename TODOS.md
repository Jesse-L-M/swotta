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

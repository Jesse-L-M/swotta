# TODOs

## Reconcile test seed with curriculum loader

**What:** Replace the manual `seedGCSEBiology()` implementation in `src/test/seed.ts` with a call to `loadQualification(db, seedJson)` from `src/engine/curriculum.ts`.

**Why:** Currently there are two sources of AQA Biology seed data — the hand-written test seeder and the JSON seed file. They will drift over time (the JSON seed has more topics, misconception rules, and richer data). Using the production loader in tests ensures they stay in sync and tests exercise the real codepath.

**Pros:** Single source of truth for seed data. Tests exercise the actual loader. No manual topic insertion to maintain.

**Cons:** Slightly slower test setup (transaction + validation overhead, ~100ms). Couples test infra to the engine module.

**Context:** `src/test/seed.ts` was created in Phase 0 (Task 0.4) as shared test infrastructure. `src/engine/curriculum.ts` was created in Phase 1 (Task 1.1). The JSON seed at `src/data/seeds/gcse-biology-aqa.json` is the canonical data source. The test seeder was written before the loader existed.

**Depends on:** Task 1.1 (curriculum loader) must be merged first. This change touches `src/test/seed.ts` which is shared infra — coordinate with other Phase 1 agents.

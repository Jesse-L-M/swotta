# Build Plan

This document defines the phased build plan with task breakdown. Each task is designed to be picked up by a single agent in a Conductor workspace. Tasks within the same phase can run in parallel.

For architecture context see `ARCHITECTURE.md`. For schema see `SCHEMA.md`. For interfaces see `INTERFACES.md`.

Note: this is the original build plan. Some early-task details reflect the intended scaffold at the time they were written. When the current code differs, treat `DECISIONS.md` and the source tree as authoritative.

---

## Phase 0: Foundation

**Sequential. One agent. Must complete before anything else starts.**

Everything in Phase 1+ depends on the scaffolding and schema being in place.

### Task 0.1: Project scaffolding

**Creates the project structure, installs dependencies, and configures tooling.**

Files created:
- `package.json`
- `tsconfig.json`
- `next.config.ts`
- `tailwind.config.ts`
- `postcss.config.mjs`
- `drizzle.config.ts`
- `Dockerfile`
- `docker-compose.yml` (Postgres + pgvector for local dev)
- `.env.example`
- `.env.local` (gitignored)
- `.gitignore`
- `src/app/layout.tsx` (root layout and global shell)
- `src/app/page.tsx` (landing page stub)
- `src/app/globals.css` (Tailwind imports)
- `src/lib/db.ts` (Drizzle client singleton)
- `src/lib/env.ts` (zod-validated env vars)
- `vitest.config.ts`

Dependencies:
- next, react, react-dom
- drizzle-orm, drizzle-kit, postgres (node-postgres driver)
- firebase, firebase-admin
- @anthropic-ai/sdk
- inngest
- tailwindcss, @tailwindcss/postcss
- shadcn/ui (init)
- vitest, @testing-library/react
- zod
- resend

Acceptance criteria:
- [ ] `npm run dev` starts the app on localhost:3000
- [ ] `docker compose up -d` starts Postgres with pgvector extension
- [ ] Drizzle can connect to the local database
- [ ] TypeScript compiles with zero errors
- [ ] `npm run test` runs vitest (no tests yet, but runner works)
- [ ] Dockerfile builds and runs the app

### Task 0.2: Database schema

**Implements all 40 tables across 5 schema files, exactly matching SCHEMA.md.**

The schema now includes `learner_qualifications`, `policies`, and `study_sessions` (replacing `session_summaries`).

Files created:
- `src/db/schema/identity.ts`
- `src/db/schema/curriculum.ts`
- `src/db/schema/sources.ts`
- `src/db/schema/learner-state.ts`
- `src/db/schema/planning.ts`
- `src/db/schema/index.ts` (re-exports all tables)
- `src/db/schema/enums.ts` (pgEnum definitions)
- `src/db/migrations/` (initial migration)

Acceptance criteria:
- [ ] All 40 tables defined with correct columns, types, constraints
- [ ] All indexes created
- [ ] All foreign keys reference correct tables
- [ ] All custom enum types defined
- [ ] pgvector extension enabled
- [ ] `npx drizzle-kit push` applies cleanly to a fresh database
- [ ] `npx drizzle-kit generate` produces a migration file
- [ ] Schema compiles with zero TypeScript errors

### Task 0.3: Shared types and CLAUDE.md

**Creates the shared type definitions from INTERFACES.md and the project CLAUDE.md.**

Files created:
- `src/lib/types.ts` (all shared types from INTERFACES.md)
- `CLAUDE.md` (project-level agent instructions)

Acceptance criteria:
- [ ] All branded ID types defined
- [ ] All composite types (StudyBlock, AttemptOutcome, etc.) defined
- [ ] All enum types match schema enums
- [ ] CLAUDE.md points agents to docs/, sets conventions, lists file ownership rules

### Task 0.4: Shared test utilities

**Creates test infrastructure that all Phase 1 agents will use.**

Files created:
- `src/test/setup.ts` (test DB connection, migration runner, cleanup)
- `src/test/fixtures.ts` (factory functions for test data)
- `src/test/seed.ts` (loads GCSE Biology AQA seed for integration tests)
- `vitest.setup.ts` (global test setup pointing to test utilities)

Acceptance criteria:
- [ ] Test database connects via docker-compose Postgres
- [ ] Migrations run automatically before test suites
- [ ] Factory functions create valid test orgs, users, learners, qualifications
- [ ] `seedGCSEBiology()` loads a minimal but real topic tree for integration tests
- [ ] Database is cleaned between test runs (truncate, not drop)
- [ ] All Phase 1 agents can import from `@/test/` and get working fixtures

---

## Phase 1: Core Engines

**Parallel. 5 agents. Start after Phase 0 is merged to main.**

Each task owns specific files and has no file overlap with other Phase 1 tasks. All tasks import from `src/db/schema` and `src/lib/types.ts` but do not modify them.

### Task 1.1: Curriculum loader

**Agent instructions:**
Build the curriculum data loader that seeds qualification structures from JSON seed files. Start with GCSE Biology (AQA, spec 8461) as the first qualification.

Files you own:
- `src/engine/curriculum.ts`
- `src/engine/curriculum.test.ts`
- `src/data/seeds/gcse-biology-aqa.json`
- `src/data/seeds/README.md`

Interface contract: implement `loadQualification`, `getTopicTree` from INTERFACES.md.

Acceptance criteria:
- [ ] `loadQualification` inserts exam board, subject, qualification, version, components, topics, edges, command words, question types, misconception rules in a single transaction
- [ ] GCSE Biology AQA seed file has complete topic tree (all units + sub-topics from the AQA 8461 spec)
- [ ] `getTopicTree` returns the full tree with edges
- [ ] Idempotent: running loadQualification twice doesn't create duplicates
- [ ] Tests cover: happy path, duplicate detection, invalid seed data
- [ ] Topic edges correctly model prerequisites (e.g., cell structure → cell division)
- [ ] Seed data format is compatible with `src/test/seed.ts` (produces fixtures usable by all Phase 1 agents)

Do NOT touch: any files outside the ones listed above.

### Task 1.2: Ingestion pipeline

**Agent instructions:**
Build the file processing pipeline that takes uploaded files and turns them into searchable, topic-mapped chunks with embeddings.

Files you own:
- `src/engine/ingestion.ts`
- `src/engine/ingestion.test.ts`
- `src/ai/embeddings.ts` (Voyage AI client)
- `src/ai/embeddings.test.ts`
- `src/ai/analysis.ts` (Claude-based chunk classification)
- `src/ai/analysis.test.ts`
- `inngest/functions/process-file.ts`

Interface contract: implement `processFile`, `retrieveChunks`, `getCoverageReport` from INTERFACES.md.

Acceptance criteria:
- [ ] `processFile` handles PDF and DOCX inputs (use pdf-parse and mammoth)
- [ ] Text is chunked at semantic boundaries, ~500 tokens per chunk
- [ ] Embeddings generated via Voyage AI and stored in pgvector
- [ ] Claude classifies each chunk against the topic graph with confidence scores
- [ ] `retrieveChunks` performs vector similarity search scoped by learner's accessible sources
- [ ] `getCoverageReport` shows which topics have/lack source material
- [ ] File status transitions correctly: pending → processing → ready/failed
- [ ] Inngest function wraps processFile with retry logic
- [ ] Tests cover: PDF processing, chunking, scope filtering, error handling

Do NOT touch: any files outside the ones listed above. Assume the schema and Voyage/Claude API keys exist.

### Task 1.3: Scheduler and mastery engine

**Agent instructions:**
Build the spaced repetition scheduler and mastery state manager. These are tightly coupled (mastery updates feed scheduling) so they're one task.

Files you own:
- `src/engine/scheduler.ts`
- `src/engine/scheduler.test.ts`
- `src/engine/mastery.ts`
- `src/engine/mastery.test.ts`
- `inngest/functions/update-queue.ts`
- `inngest/functions/rebuild-plans.ts`
- `inngest/functions/decay-check.ts`

Interface contract: implement all functions from the Scheduler and Mastery Engine sections of INTERFACES.md.

Acceptance criteria:
- [ ] `getNextBlocks` returns prioritised study blocks considering: overdue reviews, exam proximity, mastery gaps, source availability
- [ ] `processAttemptOutcome` updates mastery_level, ease_factor, interval_days, next_review_at using modified SM-2 algorithm
- [ ] `buildWeeklyPlan` creates a plan with blocks distributed across the week
- [ ] `initTopicStates` creates learner_topic_state rows for all topics in a qualification
- [ ] Decay model: topics overdue for review increase in urgency over time
- [ ] Streak tracking: consecutive successful reviews increase the streak
- [ ] Scheduler reads `learner_qualifications` to determine which topics to schedule for a learner
- [ ] Tests cover: SM-2 calculations, priority ordering, plan generation, edge cases (no topics, all mastered, exam tomorrow)

Do NOT touch: any files outside the ones listed above.

### Task 1.4: Study session runner

**Agent instructions:**
Build the interactive study session engine that uses Claude to run study blocks with learners.

Files you own:
- `src/engine/session.ts`
- `src/engine/session.test.ts`
- `src/ai/study-modes.ts`
- `src/ai/study-modes.test.ts`
- `src/ai/prompts/retrieval-drill.md`
- `src/ai/prompts/explanation.md`
- `src/ai/prompts/worked-example.md`
- `src/ai/prompts/timed-problems.md`
- `src/ai/prompts/essay-planning.md`
- `src/ai/prompts/source-analysis.md`
- `src/ai/prompts/mistake-review.md`
- `src/ai/prompts/reentry.md`
- `src/engine/policies.ts`
- `src/engine/policies.test.ts`

Interface contract: implement `startSession`, `continueSession`, `endSession` from INTERFACES.md.

Acceptance criteria:
- [ ] Each block type has a distinct system prompt in `src/ai/prompts/`
- [ ] System prompts include: qualification context, learner context (mastery, misconceptions, memory), retrieved source chunks
- [ ] `startSession` constructs the full prompt and returns the first interaction
- [ ] `continueSession` accepts full conversation history from client (no server-side session state) and streams Claude's response
- [ ] `endSession` extracts structured outcome (score, misconceptions, confidence) from the session
- [ ] Sessions guide rather than give answers (anti-cheating)
- [ ] `startSession` returns the system prompt and initial message for client-side storage
- [ ] Policy context is resolved and included in system prompts
- [ ] Tests cover: session lifecycle, prompt construction, outcome extraction

Do NOT touch: any files outside the ones listed above. Call `ingestion.retrieveChunks` for source material (import the interface, mock in tests).

### Task 1.5: Reporting engine

**Agent instructions:**
Build the weekly reporting system, safety flag detection, and notification delivery.

Files you own:
- `src/engine/reporting.ts`
- `src/engine/reporting.test.ts`
- `src/email/templates/weekly-report.tsx` (React Email template)
- `src/email/send.ts` (Resend client)
- `inngest/functions/weekly-report-trigger.ts`
- `inngest/functions/weekly-report-generate.ts`
- `inngest/functions/detect-flags.ts`

Interface contract: implement `generateWeeklyReport`, `detectFlags`, `sendWeeklyReport`, `generateTeacherInsight` from INTERFACES.md.

Acceptance criteria:
- [ ] `generateWeeklyReport` aggregates session data and uses Claude to write a natural-language summary
- [ ] `detectFlags` identifies: chronic avoidance (subject consistently skipped), rapid decay (mastery dropping fast), repeated misconception clusters, sudden disengagement (no sessions for N days)
- [ ] `sendWeeklyReport` sends emails via Resend to all guardians with `receives_weekly_report = true`
- [ ] Email template is clean, mobile-friendly, shows key metrics + summary + flags
- [ ] Inngest cron functions trigger on schedule
- [ ] Weekly report cron triggers a fan-out: one event per active learner, each processed independently
- [ ] Individual report generation is retryable without affecting other learners
- [ ] Tests cover: report generation, flag detection logic, email template rendering

Do NOT touch: any files outside the ones listed above.

---

## Phase 2: UI

**Parallel. 4 agents. Start after Phase 1 is merged to main.**

### Task 2.1: Auth and layout shell

Files you own:
- `src/app/layout.tsx` (update with nav, sidebar)
- `src/app/(auth)/login/page.tsx`
- `src/app/(auth)/signup/page.tsx`
- `src/app/(auth)/layout.tsx`
- `src/middleware.ts` (auth middleware)
- `src/components/nav/` (sidebar, header, user menu)
- `src/lib/auth.ts` (helpers: getAuthContext, requireAuth, requireRole)

Acceptance criteria:
- [ ] Firebase login and signup flows work
- [ ] Authenticated layout with sidebar navigation
- [ ] Role-based route protection (learner vs guardian vs admin)
- [ ] User menu shows org/role context

### Task 2.2: Student dashboard and onboarding

Files you own:
- `src/app/(student)/dashboard/page.tsx`
- `src/app/(student)/onboarding/` (multi-step setup flow)
- `src/app/(student)/layout.tsx`
- `src/components/dashboard/` (stats cards, today's queue, mastery overview)
- `src/components/onboarding/` (subject picker, qualification selector, exam date entry)

Acceptance criteria:
- [ ] Onboarding flow: select subjects → pick exam board/qualification → set exam dates → done
- [ ] Dashboard shows: today's study queue, mastery overview chart, streak/stats, upcoming exams
- [ ] Dashboard calls scheduler.getNextBlocks and mastery data
- [ ] Empty states for new users

### Task 2.3: Study session UI

Files you own:
- `src/app/(student)/session/[blockId]/page.tsx`
- `src/components/session/` (chat interface, confidence slider, progress indicator, timer)

Acceptance criteria:
- [ ] Chat-style interface for the study session
- [ ] Messages stream in real-time (Claude streaming)
- [ ] Confidence self-rating before and after the session
- [ ] Timer for timed problem blocks
- [ ] Session can be ended early (abandoned)
- [ ] On completion, shows summary and next block option

### Task 2.4: Source upload and parent view

Files you own:
- `src/app/(student)/sources/page.tsx` (file list, upload)
- `src/app/(student)/sources/upload/page.tsx`
- `src/app/(parent)/dashboard/page.tsx`
- `src/app/(parent)/learners/[id]/page.tsx`
- `src/app/(parent)/layout.tsx`
- `src/components/sources/` (file list, upload dropzone, processing status)
- `src/components/parent/` (learner card, report view, flag alerts)

Acceptance criteria:
- [ ] File upload with drag-and-drop, progress indicator, processing status
- [ ] Source file list showing collections, files, processing status
- [ ] Parent dashboard showing linked learners with summary cards
- [ ] Parent learner detail view: latest report, mastery overview, active flags
- [ ] File upload triggers Inngest processing function

---

## Phase 3: Infrastructure and deployment

**Parallel. 3 agents. Can start alongside Phase 2.**

### Task 3.1: GCP deployment

Files you own:
- `terraform/` or `infra/` (IaC for Cloud Run, Cloud SQL, Cloud Storage, IAM)
- `.github/workflows/deploy.yml` (CI/CD)
- `cloudbuild.yaml` or equivalent

Acceptance criteria:
- [ ] Cloud Run service deployed in europe-west2
- [ ] Cloud SQL Postgres instance with pgvector, private IP
- [ ] Cloud Storage bucket for file uploads
- [ ] Secrets managed via Secret Manager
- [ ] CI: lint + typecheck + test on PR
- [ ] CD: deploy to Cloud Run on merge to main

### Task 3.2: Inngest wiring

Files you own:
- `src/app/api/inngest/route.ts` (Inngest serve endpoint)
- `inngest/client.ts` (Inngest client config)
- `inngest/index.ts` (register all functions)

Acceptance criteria:
- [ ] Inngest client configured with correct event schemas
- [ ] All Inngest functions from Phase 1 registered
- [ ] Cron schedules set correctly
- [ ] Event types defined and type-safe
- [ ] Dev server works locally (`npx inngest-cli dev`)

### Task 3.3: End-to-end tests

Files you own:
- `tests/e2e/` (Playwright tests)
- `playwright.config.ts`

Acceptance criteria:
- [ ] Onboarding flow: sign up → select subject → see dashboard
- [ ] Study session: start block → interact → complete → see mastery update
- [ ] Source upload: upload file → processing → chunks visible
- [ ] Parent view: sign in as parent → see learner report

---

## Dependency graph

```
Phase 0 (Foundation)
  ├── 0.1 Scaffolding
  ├── 0.2 Schema (depends on 0.1)
  ├── 0.3 Types + CLAUDE.md (depends on 0.2)
  └── 0.4 Shared test utilities (depends on 0.2)
        │
        ▼
Phase 1 (Core Engines) ─── all 5 tasks in parallel
  ├── 1.1 Curriculum loader
  ├── 1.2 Ingestion pipeline
  ├── 1.3 Scheduler + mastery
  ├── 1.4 Session runner
  └── 1.5 Reporting engine
        │
        ▼
Phase 2 (UI) ─── all 4 tasks in parallel
  ├── 2.1 Auth + layout
  ├── 2.2 Student dashboard
  ├── 2.3 Session UI
  └── 2.4 Sources + parent view

Phase 3 (Infra) ─── can start alongside Phase 2
  ├── 3.1 GCP deployment
  ├── 3.2 Inngest wiring
  └── 3.3 E2E tests (after Phase 2)
```

---

## Linear structure

Suggested Linear project structure:

**Project:** Swotta

**Epics:**
- Foundation (Phase 0)
- Core Engines (Phase 1)
- UI (Phase 2)
- Infrastructure (Phase 3)

**Issues:** One per task (0.1, 0.2, 0.3, 1.1, 1.2, etc.)

Each issue should contain the full task spec from this document, including files owned, interface contract reference, and acceptance criteria. This is what gets pasted into a Conductor workspace.

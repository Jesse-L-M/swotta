# Changelog

All notable changes to this project will be documented in this file.

## [0.1.2] - 2026-03-25

### Changed
- Reduced dependency surface by removing unused lint and test packages, moving `@types/pdf-parse` to dev-only, and switching the lint script from `next lint` to `eslint .`
- Updated `next` to `15.5.14`, upgraded `drizzle-kit` to `0.31.10`, and pinned `fast-xml-parser` to `5.5.9` via overrides
- Adjusted the ESLint config to ignore generated `next-env.d.ts` and cleaned an unused-import warning in the decay-check Inngest function

## [0.1.1] - 2026-03-18

### Added
- **Command Word Mastery Tracking** (`getTechniqueMastery` engine function) — per-command-word statistics including question attempts, average score, and trend analysis (improving/stable/declining/insufficient_data)
- **Command Word Context Retrieval** (`getCommandWordsForQualification`) — query command words for a specific qualification
- **Formatted Command Word Guidance** (`formatCommandWordSection`) — markdown output with command word definitions, mark scheme coaching patterns (1/2/4/6-mark structures), and timed practice awareness
- **Exam Technique Coaching** — integrated command word guidance into all 8 study session prompts (retrieval-drill, timed-problems, essay-planning, explanation, worked-example, source-analysis, mistake-review, reentry) with coaching on what each command word requires and how to allocate marks

### Changed
- Enhanced all study session prompts to include explicit command word and exam technique coaching sections
- Improved essay-planning session flow to emphasize mark scheme structure
- Updated timed-problems session to include mark allocation guidance and pacing awareness
- Expanded explanation and worked-example sessions with exam-style framing

## [0.1.0] - Phase 4

### Added
- Firebase Authentication (Google Sign-In) with session cookies
- Route protection middleware (learner and guardian role enforcement)
- Household organization model with automatic signup provisioning
- Guardian linking via invite codes
- Integration fixes: `endSession` wired to mastery engine, `getNextBlocks` idempotency guard, `selectBlockType` reads task_rules

## [0.0.4] - Phase 3: Infrastructure

### Added
- Cloud Run deployment configuration (europe-west2)
- Terraform modules for Cloud SQL, Cloud Storage, IAM, networking, and secrets
- GitHub Actions CI/CD: lint + typecheck + test on PR, deploy on merge to main
- Inngest client and function wiring (file processing, queue updates, decay checks, weekly reports)
- Playwright e2e tests for onboarding, parent view, source upload, and study sessions
- Multi-stage Docker build for production

## [0.0.3] - Phase 2: UI Surfaces

### Added
- Landing page with product framing sections (hero, curriculum-first, parent visibility)
- Firebase-authenticated login and signup flows
- Multi-step student onboarding (subjects, qualifications, exam dates)
- Student dashboard with queue, mastery overview, streak tracking, and exam countdown
- Conversational diagnostic flow that seeds initial mastery from AI conversation
- AI-guided study session UI with streaming responses, confidence capture, and session summaries
- Source upload with drag-and-drop, processing status, and collection views
- Guardian dashboard with linked learner cards and report views

## [0.0.2] - Phase 1: Core Engines

### Added
- Curriculum loader with idempotent qualification seeding from JSON (GCSE Biology AQA, 75 topics)
- Ingestion pipeline: text extraction (PDF, DOCX), semantic chunking, Voyage AI embeddings, Claude-based topic classification
- Scheduler and mastery engine: modified SM-2 spaced repetition, block type selection, weekly plan generation
- Study session runner: 8 distinct session modes with external Markdown prompts, streaming Claude responses, structured outcome extraction
- Reporting engine: weekly report generation, safety flag detection (avoidance, disengagement, distress), Resend email delivery
- Policy engine with five-layer resolution (global, qualification, org, class, learner)

## [0.0.1] - Phase 0: Foundation

### Added
- Project scaffolding: Next.js 15, TypeScript strict, Drizzle ORM, Tailwind CSS, shadcn/ui
- Database schema: 40+ tables across 5 layers (identity, curriculum, sources, learner state, planning)
- Shared types from interface contracts
- Test infrastructure: fixtures, seed data, global setup with real Postgres via docker-compose
- Docker Compose configuration for local Postgres + pgvector

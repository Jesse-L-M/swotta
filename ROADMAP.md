# Roadmap

## Built

Everything below exists in the codebase today with tests.

**Foundation**
- Database schema: 40+ tables across 5 layers (identity, curriculum, sources, learner state, planning)
- Drizzle ORM with strict TypeScript types derived from schema
- Docker Compose for local Postgres + pgvector
- Test infrastructure: fixtures, seed data, global setup against real Postgres

**Curriculum**
- Curriculum loader with idempotent seeding from specification JSON
- GCSE Biology AQA loaded: 75 topics, command words, misconception rules, task rules
- Topic graph with prerequisite/builds-on/related edges
- Recursive CTE for topic tree traversal

**Ingestion**
- Source upload to Cloud Storage with signed URLs
- Text extraction: PDF (pdf-parse), DOCX (mammoth), images (Claude vision)
- Semantic chunking (~500 tokens per chunk)
- Voyage AI embeddings (1024d) stored in pgvector
- Claude-based chunk-to-topic classification with confidence scores
- Five-level source scoping (private, household, class, org, system)

**Scheduling and mastery**
- Modified SM-2 spaced repetition engine
- Exam proximity weighting (block type mix shifts as exams approach)
- Behavioural signal integration (avoidance detection, gap recovery)
- 8 study block types with heuristic and rule-based selection
- Weekly plan generation

**Study sessions**
- Streaming Claude sessions via Anthropic SDK
- 15 external Markdown prompt templates (retrieval drill, explanation, worked example, timed problems, essay planning, source analysis, mistake review, reentry, and variants)
- Structured context assembly: mastery, misconceptions, confirmed memory, retrieved sources, qualification rules, command word guidance
- Outcome extraction: score, confidence, misconceptions, help patterns

**Memory**
- Candidate/confirmed memory lifecycle with evidence accumulation and promotion
- Misconception event tracking with resolution status
- Confidence calibration events (self-rated vs actual, per topic)
- Retention events (spaced repetition outcomes per review)
- Learner preferences with source tracking (stated, inferred, guardian-set)

**Behaviour and reporting**
- Behaviour analysis: avoidance patterns, disengagement detection, confidence miscalibration
- Safety flag generation (disengagement, avoidance, distress, overreliance)
- Weekly report generation with mastery deltas, misconception narratives, behavioural patterns
- Enhanced parent reports via Resend email
- Command word mastery tracking and exam technique coaching

**Identity and auth**
- Firebase Auth with Google Sign-In
- Session cookies with server-side verification
- Role-based route protection (learner, guardian)
- Household-as-organisation model
- Guardian linking via invite codes
- Five-layer policy resolution (global, qualification, org, class, learner)

**UI**
- Landing page
- Multi-step student onboarding (subjects, qualifications, exam dates)
- Student dashboard: queue, mastery overview, streak tracking, exam countdown
- AI-guided study session interface with streaming responses and confidence capture
- Source upload with drag-and-drop, processing status, collection views
- Guardian dashboard with linked learner cards and report views

**Infrastructure**
- Terraform modules for GCP (Cloud Run, Cloud SQL, Cloud Storage, IAM, networking, secrets)
- GitHub Actions CI/CD (lint, typecheck, test on PR; deploy on merge)
- Multi-stage Docker build
- Inngest for background jobs (file processing, queue updates, decay checks, weekly reports)
- Playwright e2e tests

---

## Building

Actively in progress or next up.

- **Diagnostic conversation flow** — an initial AI conversation that assesses a new student's baseline knowledge across their enrolled topics, seeding mastery state from structured diagnostic questions rather than starting everything at zero
- **Cross-topic misconception clustering** — detecting when misconceptions across different topics share a common root cause (e.g., confusing correlation with causation appearing in both biology and chemistry)
- **Past paper analysis** — extracting question types, command words, and mark allocations from uploaded past papers, mapping them to the topic graph
- **Student weekly email** — personalised study plan and progress summary delivered to the learner, not just the parent

---

## Research questions

These are hypotheses the project is designed to test. Not features on a timeline — open questions that the architecture is built to answer.

- **Does structured learner memory improve AI tutoring quality?** Specifically: does a session grounded in mastery state, misconception history, confidence calibration, and retrieved sources produce measurably better outcomes than the same AI model with only a curriculum prompt? (See [`EVALS.md`](EVALS.md) for the evaluation plan.)

- **Is confidence calibration a higher-leverage signal than mastery score?** A learner who knows they're weak on a topic will study it. A learner who thinks they're strong but isn't — that's where exam failures come from. Does prioritising miscalibrated topics over low-mastery topics produce better outcomes?

- **Does the candidate/confirmed memory pattern work in practice?** Can inferred preferences be promoted reliably? How often do auto-promoted candidates turn out to be wrong? What's the right evidence threshold?

- **Can one Postgres handle it?** Relational state, vector search, and learner memory in a single database — does this hold up operationally, or does the vector workload eventually need its own infrastructure?

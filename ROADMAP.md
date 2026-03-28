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

## Path to 100%

This section tracks what still needs to exist for Swotta to match the full product vision: a trusted, commercially usable UK revision platform with broad GCSE and A-Level coverage, strong learning quality, and production-grade operations.

### 1. Curriculum breadth and content ops

This is the largest remaining product gap.

- Support the majority of popular GCSEs and A-Levels across the major exam boards, not just a single seeded qualification.
- Define the canonical "supported qualification" package: qualification metadata, assessment components, topic tree, prerequisite/builds-on/related edges, command words, misconception rules, task rules, and source-mapping hints.
- Treat existing seeded qualifications as legacy bootstrap inputs and regression artifacts, not as the quality bar for future support.
- Build a curriculum factory that turns specifications, teacher guides, past papers, and mark schemes into validated seed data.
- Add normalization, validation, and idempotent seeding so new subjects can be added repeatably.
- Add human review and QA workflows so curriculum data is AI-assisted but not AI-trusted by default.
- Add operational tooling for spec/version updates year to year.

### 2. Past paper and mark scheme intelligence

- Finish past paper ingestion and structured analysis.
- Extract question types, command words, mark allocations, and recurring mark scheme patterns.
- Link papers and mark schemes back to the topic graph and assessment components.
- Use this data in scheduling, study sessions, technique coaching, and reporting.

### 3. Diagnostic and learner-model maturity

- Finish the diagnostic conversation flow and ensure it reliably seeds initial mastery state.
- Add cross-topic misconception clustering and root-cause detection.
- Improve learner component state and grade prediction by paper/component, not just topic.
- Improve candidate-to-confirmed memory promotion and contradiction handling.

### 4. Study quality and pedagogy

- Tune study modes subject-by-subject rather than relying on generic prompt behavior.
- Improve difficulty calibration, hint timing, and corrective explanations.
- Improve retrieval grounding so sessions reliably use the right learner materials and syllabus context.
- Add explicit tutoring-quality evals, not just code-level tests.

### 5. Student product completeness

- Finish all student flows to a production-ready standard on desktop and mobile.
- Improve session resilience, interruption handling, and low-friction reentry after gaps.
- Polish queue, upload, source review, and progress loops so the next action is always clear.
- Improve perceived speed, empty states, and "why am I doing this now?" explanations.

### 6. Parent, teacher, and school product

- Build the teacher/admin product into a real workflow, not just an architectural placeholder.
- Add class setup, roster import, assignments, intervention views, and school-level policy controls.
- Deepen parent reporting with clearer actionability and trust signals.
- Add school onboarding flows, auditability, and org-level administration.

### 7. Evaluation and evidence

- Run the evaluation plan in `EVALS.md` with real learner/session data.
- Measure whether structured context beats blank-context tutoring.
- Measure scheduler quality against simpler baselines.
- Measure confidence calibration improvement, misconception resolution, retrieval quality, and policy adherence.
- Turn results into product dashboards and decision criteria.

### 8. Reliability, security, and compliance

- Harden production operations: deploys, migrations, backups, rollback, observability, and incident handling.
- Add stronger abuse controls, failure isolation, and rate limiting around AI, uploads, and background jobs.
- Complete the data-handling and safeguarding work needed for a product serving minors.
- Make auth, secret management, and production environment setup boring and repeatable.

### 9. Commercial product layer

- Define the initial sellable wedge clearly rather than marketing the entire end-state platform too early.
- Add pricing, billing, pilot onboarding, and customer support workflows.
- Build analytics and retention instrumentation around learner outcomes and product usage.
- Collect pilot evidence, case studies, and proof points that schools and parents can trust.

### 10. Human systems around the code

- Create a curriculum/content QA process.
- Create a pedagogy review loop for study behavior and intervention quality.
- Create an operations/support loop for real users, incidents, and feedback.
- Build the internal systems needed to scale subject coverage without quality collapse.

### Practical sequence

The next highest-leverage move is to prioritize **curriculum breadth and content ops**, specifically the machine that can repeatedly turn one qualification specification into production-ready, validated seed data. The first goal is not to bless an existing seed as the standard; it is to rebuild one qualification through the new factory until it is good enough to become the first true reference package. Until that exists, broad GCSE/A-Level coverage remains a manual bottleneck.

---

## Research questions

These are hypotheses the project is designed to test. Not features on a timeline — open questions that the architecture is built to answer.

- **Does structured learner memory improve AI tutoring quality?** Specifically: does a session grounded in mastery state, misconception history, confidence calibration, and retrieved sources produce measurably better outcomes than the same AI model with only a curriculum prompt? (See [`EVALS.md`](EVALS.md) for the evaluation plan.)

- **Is confidence calibration a higher-leverage signal than mastery score?** A learner who knows they're weak on a topic will study it. A learner who thinks they're strong but isn't — that's where exam failures come from. Does prioritising miscalibrated topics over low-mastery topics produce better outcomes?

- **Does the candidate/confirmed memory pattern work in practice?** Can inferred preferences be promoted reliably? How often do auto-promoted candidates turn out to be wrong? What's the right evidence threshold?

- **Can one Postgres handle it?** Relational state, vector search, and learner memory in a single database — does this hold up operationally, or does the vector workload eventually need its own infrastructure?

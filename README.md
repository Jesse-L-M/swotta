# Swotta

A curriculum-aware academic operating system for GCSE and A-Level revision. Built as a solo full-stack project by [Jesse Merrigan](https://github.com/Jesse-L-M).

## Why I built this

Students revising for GCSEs and A-Levels cobble together flashcard apps, YouTube playlists, and generic AI chatbots. None of these know the actual exam specification, none adapt to what the student struggles with, and parents are left asking "how did revision go?" with no way to verify the answer.

I wanted to build a system where one product owns the full loop: curriculum structure, mastery tracking, adaptive AI study sessions, source ingestion, and parent reporting — all grounded on the real AQA/OCR/Edexcel specification.

## What it does

Swotta loads the full exam specification (topics, command words, mark scheme patterns), tracks per-topic mastery using spaced repetition, and uses Claude to run guided study sessions that adapt to the student's current understanding. Students upload their own notes, past papers, and class handouts — Swotta chunks, embeds, and maps them to the curriculum so sessions draw on the student's actual materials. Parents get weekly reports with mastery changes, misconception patterns, and confidence calibration — not just "studied for 3 hours."

## Screenshots

### Landing page

![Swotta landing page hero](docs/assets/swotta-hero.png)

### Curriculum-aware specification loading

![Swotta curriculum-first section](docs/assets/swotta-curriculum.png)

### Parent reporting

![Swotta parent reporting section](docs/assets/swotta-parents.png)

## Technical highlights

**Relational curriculum model, not document store.** The schema models qualification, topic tree, command words, misconception rules, and task rules as a proper relational graph with cross-cutting edges (prerequisites, builds-on, related). This lets the scheduler reason about learning dependencies — not just "what's overdue."

**Spaced repetition with exam proximity.** The mastery engine uses a modified SM-2 algorithm, but the scheduler also factors exam dates, topic weights from the specification, and behavioural signals (avoidance patterns, confidence miscalibration, study gaps). As exams approach, the block type mix shifts from exploratory sessions toward retrieval drills and timed practice.

**Source ingestion pipeline.** Students upload PDFs, DOCX, and images. The pipeline extracts text, chunks at semantic boundaries, generates Voyage AI embeddings stored in pgvector, and uses Claude to classify each chunk against the curriculum topic graph with confidence scores. Study sessions then retrieve relevant chunks via vector similarity, scoped to the student's accessible sources.

**Embeddings colocated with relational data.** pgvector stores embeddings in the same Postgres instance as the relational schema. Source retrieval, mastery lookups, and scheduling decisions all happen in one transaction — no separate vector store to sync.

**AI prompts as external Markdown.** All 15 study session prompts (retrieval drill, essay planning, worked example, mistake review, etc.) live as versioned Markdown files, not hardcoded strings. Each prompt receives structured context: qualification rules, learner mastery state, known misconceptions, confirmed memory, and retrieved source chunks.

**Multi-tenant from day one.** A household is just an organisation with type `household`. The same identity/membership/policy model supports B2C families and B2B schools. Policies resolve through five layers (global, qualification, org, class, learner) with most-specific-wins semantics.

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 15, React 19 | Full-stack TypeScript, Server Components, streaming for AI sessions |
| Database | PostgreSQL 16 + pgvector | Relational data + vector embeddings in one DB, atomic transactions |
| ORM | Drizzle | Schema-as-TypeScript, fine-grained SQL for complex graph queries |
| Auth | Firebase Auth | Google Sign-In (universal in UK schools), stays in GCP ecosystem |
| AI | Claude API (Anthropic SDK) | Study sessions, material analysis, report generation |
| Embeddings | Voyage AI (1024d) | Stored in pgvector alongside relational data |
| File storage | Google Cloud Storage | Signed URLs for secure student uploads |
| Background jobs | Inngest | Durable, retryable, typed async functions |
| Email | Resend | Parent weekly reports |
| Hosting | Cloud Run + Cloud SQL | Long request timeouts for AI sessions, auto-scaling, europe-west2 |
| Infrastructure | Terraform | Modular GCP config (networking, IAM, secrets, storage) |

## What I built

- Product concept, scope, and system design for a student-and-parent academic operating system.
- The full data model: 40+ tables across five schema layers (identity, curriculum, sources, learner state, planning).
- 16 engine modules: curriculum loading, ingestion pipeline, scheduler, mastery tracking, session runner, reporting, diagnostics, behaviour analysis, memory, notifications, exam proximity, and more.
- 15 AI prompt templates for distinct study session modes.
- Learner and guardian UI surfaces in Next.js: dashboard, onboarding, study sessions, source upload, parent reporting.
- CI/CD pipeline (GitHub Actions: lint, typecheck, test on PR; deploy on merge).
- Terraform infrastructure for GCP deployment.
- 1600+ tests across 84 files (unit + e2e).

## Repository structure

```
src/
  app/          Route surfaces: marketing, auth, learner, guardian, API handlers
  components/   UI: landing, dashboard, onboarding, sessions, sources, parent views
  engine/       Core domain: curriculum, scheduling, mastery, sessions, reporting, diagnostics
  ai/           Claude integration, Voyage embeddings, 15 prompt templates
  db/schema/    Drizzle schema (5 layers, 40+ tables)
  lib/          Auth, types, logging, database connection
  email/        Resend templates for parent reports
inngest/        Background job entry points
terraform/      GCP infrastructure modules
tests/e2e/      Playwright flows
docs/           Architecture, schema, interfaces, decisions, build plan
```

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system shape, data layers, engine flows
- [`docs/SCHEMA.md`](docs/SCHEMA.md) — full relational schema with column-level detail
- [`docs/INTERFACES.md`](docs/INTERFACES.md) — engine contracts and shared types
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — locked technical choices and rationale
- [`DESIGN.md`](DESIGN.md) — design system (typography, colour, spacing, aesthetic direction)

## Running locally

```bash
npm ci
docker compose up -d        # Postgres + pgvector
cp .env.example .env.local  # Fill in credentials
npm run db:push             # Apply schema
npm run dev                 # Start on localhost:3000
```

AI, auth, and file-ingestion features need real service credentials. The UI shell, schema, and most local development work can be exercised without them.

## Verification

```bash
npx tsc --noEmit       # TypeScript: passes
npm run test:run       # Tests: 84 files, 1605 tests
npx eslint src/        # Lint: 0 errors, 0 warnings
```

## Status

Active build, not a frozen package. The architecture, schema, core engines, and user-facing surfaces exist. The product is still growing.

## License

[Polyform Noncommercial 1.0](LICENSE) — you can read, learn from, and experiment with this code, but not use it commercially.

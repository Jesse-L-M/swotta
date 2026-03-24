# Swotta

A revision system for GCSE and A-Level students that takes spaced repetition, mastery tracking, and AI tutoring seriously. Built as a solo project by [Jesse Merrigan](https://github.com/Jesse-L-M).

## Why this project

I'm interested in how memory works — the biological kind and the computational kind. How spaced repetition exploits the forgetting curve. How retrieval practice strengthens recall more than re-reading ever does. How confidence calibration (knowing what you don't know) is arguably the skill most students lack and most revision tools ignore.

I'm also deep into agentic AI systems, specifically the memory problem: how you give an AI enough structured context about a person — what they know, what they've forgotten, where they're miscalibrated, what's worked before — that it can do something genuinely useful in the moment rather than just responding to a prompt.

Swotta is where those interests meet. The practical goal is a system that helps students revise effectively for their actual exams. The deeper goal is building a working model of how structured memory (curriculum graphs, spaced repetition state, misconception tracking, confidence signals) can make AI interactions meaningfully better than a blank-context chatbot.

## Screenshots

### Landing page

![Swotta landing page hero](docs/assets/swotta-hero.png)

### Curriculum structure

![Swotta curriculum-first section](docs/assets/swotta-curriculum.png)

### Parent reporting

![Swotta parent reporting section](docs/assets/swotta-parents.png)

## How it works

Swotta loads a full exam specification — every topic, command word, and mark scheme pattern for a given qualification — into a relational topic graph with prerequisite edges. When a student signs up and picks their subjects, the system seeds their mastery state across every topic and starts scheduling study sessions.

The **scheduling engine** uses a modified SM-2 spaced repetition algorithm, but it doesn't just track what's overdue. It factors exam proximity (shifting from exploratory sessions to retrieval drills as exams approach), topic weights from the actual specification, and behavioural signals like avoidance patterns and confidence miscalibration. The scheduler picks both *what* to study and *how* — retrieval drill, worked example, essay planning, mistake review, and five other session types, each with a distinct AI prompt.

**Study sessions** are conversational, powered by Claude. The interesting part isn't the chat interface — it's the context assembly. Each session receives the student's mastery level for that topic, their known misconceptions, confirmed learning preferences, relevant chunks from their own uploaded materials (retrieved via pgvector similarity search), and the qualification's command word definitions and mark scheme structure. The AI guides rather than gives answers.

**Source ingestion** handles the student's own materials. Upload a PDF of class notes or a past paper, and the pipeline extracts text, chunks it at semantic boundaries, generates embeddings, and uses Claude to classify each chunk against the curriculum topic graph. Sessions then pull from the student's actual materials, not generic content.

**Parent reporting** closes the loop. Weekly reports include mastery changes, misconception narratives ("recurring confusion between osmosis and diffusion — targeted across 3 sessions, now resolved"), confidence calibration ("he consistently underestimates himself on genetics"), and behavioural patterns. The goal is reports that tell parents something useful, not just "studied for 3 hours."

All of this sits on a **multi-tenant identity model** where a household is just an organisation. The same schema supports B2C families and B2B schools, with policies resolving through five layers (global, qualification, org, class, learner).

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 15, React 19 | Full-stack TypeScript, streaming for AI sessions |
| Database | PostgreSQL 16 + pgvector | Relational data + vector embeddings in one DB, one transaction |
| ORM | Drizzle | Schema-as-TypeScript, fine-grained SQL for graph queries |
| Auth | Firebase Auth | Google Sign-In (universal in UK schools), GCP ecosystem |
| AI | Claude API (Anthropic SDK) | Study sessions, material analysis, report generation |
| Embeddings | Voyage AI (1024d) | Colocated with relational data in pgvector |
| File storage | Google Cloud Storage | Signed URLs for student uploads |
| Background jobs | Inngest | Durable, retryable, typed async functions |
| Email | Resend | Parent weekly reports |
| Hosting | Cloud Run + Cloud SQL | Long timeouts for AI sessions, europe-west2 |
| Infrastructure | Terraform | Modular GCP config (networking, IAM, secrets, storage) |

## Repository structure

```
src/
  engine/       Core domain: scheduling, mastery, sessions, reporting, diagnostics, memory
  ai/           Claude integration, Voyage embeddings, 15 prompt templates (Markdown)
  db/schema/    Drizzle schema — 40+ tables across 5 layers
  app/          Next.js routes: marketing, auth, learner, guardian, API
  components/   UI: dashboard, onboarding, sessions, sources, parent views
  lib/          Auth, types, logging, database
  email/        Resend templates
inngest/        Background jobs
terraform/      GCP infrastructure modules
tests/e2e/      Playwright flows
```

Detailed docs: [Architecture](docs/ARCHITECTURE.md) | [Schema](docs/SCHEMA.md) | [Interfaces](docs/INTERFACES.md) | [Decisions](docs/DECISIONS.md) | [Design system](DESIGN.md)

## Running locally

```bash
npm ci
docker compose up -d        # Postgres + pgvector
cp .env.example .env.local  # Fill in credentials
npm run db:push             # Apply schema
npm run dev
```

AI, auth, and ingestion features need real service credentials. The UI shell, schema, and local development work without them.

## Verification

```bash
npx tsc --noEmit       # Passes
npm run test:run       # 84 files, 1605 tests
npx eslint src/        # 0 errors, 0 warnings
```

## License

[Polyform Noncommercial 1.0](LICENSE) — you can read, learn from, and experiment with this code, but not use it commercially.

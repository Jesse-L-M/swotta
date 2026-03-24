# Swotta

Swotta is an academic operating system for GCSE and A-Level revision. It combines curriculum-aware planning, topic-level mastery tracking, AI-guided study sessions, source ingestion, and guardian reporting in one product.

This repository is the ongoing product build. It is being prepared as a public-facing showcase of the product thinking, architecture, and implementation work together, not as a finished library or template.

## What This Repo Demonstrates

- Product design anchored in a real user problem: fragmented revision workflows for students and parents.
- A full-stack TypeScript application with learner, guardian, and operational surfaces.
- A relational academic data model spanning curriculum, source ingestion, learner state, planning, and reporting.
- AI-native workflows for diagnostics, study sessions, content analysis, and weekly summaries.
- Delivery discipline through colocated tests, documented architecture, CI/CD, and infrastructure definitions.

## What I Built Personally

- Product concept, scope, and system design for a student-and-parent academic operating system.
- The application architecture, schema design, engine boundaries, and interface contracts.
- Learner, guardian, and marketing surfaces in Next.js.
- AI-native workflows for diagnostics, study sessions, source analysis, and reporting.
- The deployment shape across Cloud Run, Cloud SQL, Cloud Storage, Firebase Auth, and Inngest.
- The project documentation, planning artifacts, and verification scaffolding that keep the build legible as it grows.

## What Exists Today

- A designed landing page and product mockups in Next.js.
- Firebase-authenticated learner and guardian flows.
- Multi-step onboarding for subjects, qualifications, and exam dates.
- A student dashboard with queue, mastery, streak, and exam countdown surfaces.
- A conversational diagnostic flow that seeds initial mastery.
- AI-guided study session UI with confidence capture and session summaries.
- Source upload, file processing, chunking, embeddings, and topic mapping.
- Guardian dashboards and weekly report views.
- Background jobs, deployment config, and infrastructure definitions for Cloud Run, Cloud SQL, and Google Cloud Storage.

## Screenshots

### Landing page

![Swotta landing page hero](docs/assets/swotta-hero.png)

### Curriculum-first product framing

![Swotta curriculum-first section](docs/assets/swotta-curriculum.png)

### Parent visibility and reporting

![Swotta parent reporting section](docs/assets/swotta-parents.png)

## Stack

- Next.js 15, React 19, TypeScript
- Drizzle ORM + PostgreSQL 16 + pgvector
- Firebase Auth
- Anthropic Claude for analysis, sessions, and reporting
- Voyage AI for embeddings
- Google Cloud Storage for uploaded sources
- Inngest for async workflows
- Resend for guardian emails
- Cloud Run, Cloud SQL, Cloud Build, and Terraform for deployment

## Repository Guide

- `src/app/` contains the route surfaces for marketing, auth, learner flows, guardian flows, and API handlers.
- `src/components/` contains the UI systems for landing, dashboard, onboarding, sessions, diagnostics, sources, and parent reporting.
- `src/engine/` contains the core domain logic: curriculum loading, ingestion, scheduling, mastery, reporting, diagnostics, memory, and behaviour analysis.
- `src/db/schema/` defines the data model across identity, curriculum, sources, learner state, and planning.
- `inngest/` contains background job entry points.
- `tests/e2e/` contains Playwright flows for onboarding, parent view, source upload, and study sessions.
- `terraform/` contains the infrastructure configuration for GCP deployment.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): system shape, durable state layers, and core engine flows.
- [`docs/DECISIONS.md`](docs/DECISIONS.md): locked technical choices and conventions.
- [`docs/INTERFACES.md`](docs/INTERFACES.md): engine contracts and shared types.
- [`docs/SCHEMA.md`](docs/SCHEMA.md): relational schema details.
- [`docs/PLAN.md`](docs/PLAN.md): the original phased build plan.
- [`docs/PLAN-PHASE4.md`](docs/PLAN-PHASE4.md): later-phase expansion around auth, integration, and intelligence features.

## Running Locally

1. Install dependencies:
   ```bash
   npm ci
   ```
2. Start local Postgres services:
   ```bash
   docker compose up -d
   ```
3. Copy the environment template:
   ```bash
   cp .env.example .env.local
   ```
4. Fill in the required credentials for Firebase, Anthropic, Voyage, Google Cloud Storage, and Resend.
5. Apply the schema:
   ```bash
   npm run db:push
   ```
6. Start the app:
   ```bash
   npm run dev
   ```

Some flows are intentionally credential-backed. The UI shell, schema, and most local development work can be exercised without production infrastructure, but AI, auth, and file-ingestion features need real service configuration.

## Verification

Useful commands:

```bash
npx tsc --noEmit
npm run test:run
npx eslint src/
```

Current status on this branch:

- `npx tsc --noEmit` passes.
- `npm run test:run` passes: 84 test files, 1605 tests.
- `npx eslint src/` runs with warnings only. The remaining issues are mostly unused imports/variables and a couple of framework-specific template warnings.

## Status

Swotta is an active build rather than a frozen OSS package. The architecture, schema, core engines, and several user-facing surfaces already exist, but the product is still moving quickly. Treat this repo as a substantial in-progress product build.

## Current Focus

- Trim the remaining ESLint warnings and polish the public-facing repo surface.
- Close the loop from completed study sessions into mastery-state updates and scheduling.
- Replace the temporary guardian-linking fallback with real invite tokens.

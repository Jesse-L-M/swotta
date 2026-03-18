# Technical Decisions

This document records locked technical decisions. Agents should not revisit or second-guess these choices.

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Framework** | Next.js 15 (App Router) | Full-stack TypeScript, Server Components, Server Actions, streaming responses for AI sessions |
| **Language** | TypeScript (strict mode) | Single language across frontend + backend + schema. Every agent reasons about one codebase. |
| **ORM** | Drizzle ORM | Schema-as-TypeScript, fine-grained SQL control for complex relational queries, lighter than Prisma |
| **Database** | PostgreSQL 16 + pgvector | Relational data + vector embeddings in one DB. No separate vector store. Atomic transactions across all five data layers. |
| **Auth** | Firebase Auth | Authentication only (who are you?). Authorization handled by application layer via Drizzle schema (organizations, memberships, roles). Students sign in with Google accounts (universal in UK schools). Uses GCP credits. Schema column: `firebase_uid` on users table. |
| **Background Jobs** | Inngest | Durable, retryable, typed functions. Calls the Next.js app via HTTP. No Redis/Celery infrastructure. |
| **AI** | Claude API (Anthropic TypeScript SDK) | Study sessions, material analysis, misconception detection, report generation. |
| **Embeddings** | Voyage AI (voyage-3, 1024 dimensions) | Anthropic-recommended embedding model. Stored in pgvector. Model is configurable — the schema stores the model name with each embedding. |
| **File Storage** | Google Cloud Storage | Student uploads (notes, slides, past papers). Signed URLs for secure access. |
| **Hosting** | Google Cloud Run | Zero-ops container hosting, auto-scaling, long request timeouts for AI sessions. |
| **Database Hosting** | Google Cloud SQL (Postgres) | Managed Postgres with pgvector, automatic backups, London region (europe-west2). |
| **UI** | Tailwind CSS + shadcn/ui | Fast to build, good defaults, customisable. |
| **Email** | Resend | Parent summaries, weekly reports. Clean API, good deliverability. |
| **Monorepo** | No | Single Next.js app. Extract services only if/when needed. |

## Conventions

| Convention | Rule |
|------------|------|
| **Naming** | snake_case for DB columns, camelCase for TypeScript, kebab-case for file/folder names |
| **Schema files** | One file per data layer in `src/db/schema/` |
| **Tests** | Colocated with source: `foo.ts` → `foo.test.ts`. Vitest as test runner. |
| **API routes** | Next.js Route Handlers in `src/app/api/`. RESTful. |
| **Server Actions** | For form submissions and mutations from Server Components |
| **Env vars** | Validated at startup with zod. `.env.local` for development, never committed. |
| **Migrations** | Drizzle Kit. One migration per schema change. Never edit existing migrations. |
| **Error handling** | Typed errors with error codes. No bare `catch {}`. Log with structured JSON. |
| **IDs** | UUIDs (crypto.randomUUID()) for all primary keys. No auto-increment. |
| **Timestamps** | All tables have `created_at`. Mutable tables also have `updated_at`. UTC always. |
| **Soft deletes** | No. Hard delete with audit log entries. Simpler queries, no ghost data. |

## Decisions NOT to revisit

- **Not Prisma.** Drizzle gives better SQL control for the complex joins and graph queries in the curriculum/mastery layers.
- **Not a separate vector DB (Pinecone/Weaviate/etc).** pgvector keeps embeddings colocated with the relational data they're scoped to. One transaction, one database.
- **Not MongoDB/DynamoDB.** The data model is deeply relational (topic graphs, scoped permissions, learner state across subjects). Document stores would fight this.
- **Not Python.** The AI calls are API calls — Python's ML library advantage doesn't apply. TypeScript everywhere reduces agent context-switching.
- **Not microservices.** One Next.js app to start. The engine modules are well-separated in code — extract to services later only if scale demands it.
- **Not Supabase.** The multi-tenant RLS model for this schema would be overly complex. Firebase Auth + application-level scoping is cleaner.
- **Not Clerk.** Clerk's org/membership features would duplicate the authorization model already built in the Drizzle schema (organizations, memberships, guardian_links). Firebase Auth is simpler: it handles authentication, the schema handles authorization. Also stays within GCP ecosystem.
- **Not Vercel.** Serverless function timeouts (60s Pro / 300s Enterprise) are too short for AI study sessions with multi-turn Claude conversations. Cloud Run gives persistent connections and configurable timeouts.

# Swotta - Agent Instructions

## What this project is

Swotta is a student-centric academic operating system. One student, one academic state, one queue, one mastery engine, one parent/teacher reporting layer. See `docs/ARCHITECTURE.md` for the full system design.

## Before you start

1. Read `docs/DECISIONS.md` — tech stack is locked, do not suggest alternatives
2. Read `docs/SCHEMA.md` — the database schema is the source of truth
3. Read `docs/INTERFACES.md` — function signatures and contracts between components
4. Read `docs/PLAN.md` — find your task, note which files you own
5. Read `DESIGN.md` — the design system is the source of truth for all visual decisions

## File ownership

Each task owns specific files. **Do not modify files outside your task's ownership list.** If you need something from another module, import its interface — do not reach into its internals.

## Conventions

- **TypeScript strict mode.** No `any` types. No `@ts-ignore`.
- **snake_case** for database columns, **camelCase** for TypeScript, **kebab-case** for files/folders.
- **UUIDs** for all primary keys (`crypto.randomUUID()`).
- **Colocated tests:** `foo.ts` → `foo.test.ts` in the same directory. Use Vitest.
- **Zod** for all external input validation (API routes, env vars, webhook payloads).
- **No bare catch blocks.** All errors must be typed and logged.
- **No `console.log` in production code.** Use structured logging.
- **Imports:** use `@/` path alias for `src/`.

## Schema

The Drizzle schema in `src/db/schema/` is the canonical definition of all database tables. It must match `docs/SCHEMA.md` exactly. Do not add, remove, or rename columns without updating SCHEMA.md first.

## API patterns

- API routes in `src/app/api/` use Next.js Route Handlers.
- Always validate request bodies with zod.
- Always scope queries by org/user. No unscoped data access.
- Return consistent JSON: `{ data: ... }` on success, `{ error: { code, message } }` on failure.

## AI integration

- Use the Anthropic TypeScript SDK (`@anthropic-ai/sdk`).
- Prompts live in `src/ai/prompts/` as Markdown files.
- Never hardcode prompts in TypeScript — load from files.
- Study sessions must guide, not give answers directly.

## Design system

Always read `DESIGN.md` before making any visual or UI decisions. All font choices, colours, spacing, border radius, and aesthetic direction are defined there. Do not deviate without explicit user approval. Key rules:
- **Fonts:** Instrument Serif (headlines), Instrument Sans (body), JetBrains Mono (data/code)
- **Colours:** Warm cream base (#FAF6F0), teal primary (#2D7A6E), coral secondary (#D4654A)
- **Three-state semantics:** positive (teal), attention (coral), neutral (stone). Not four colours.
- **No AI slop:** No purple gradients, no icon-in-circle grids, no bubbly uniform border-radius, no generic hero sections.

## Testing

- Unit tests for all engine functions.
- Mock external services (Claude API, Voyage AI, Cloud Storage) in tests.
- Test database operations against the real Postgres (via docker-compose).

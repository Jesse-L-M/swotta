# Architecture

Swotta is a student-centric academic operating system. One student, one academic state, one queue, one mastery engine, one parent/teacher reporting layer.

This document describes the system design. For schema details see `SCHEMA.md`. For interface contracts see `INTERFACES.md`. For tech stack rationale see `DECISIONS.md`.

## System overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js App (Cloud Run)                  │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │ Student  │  │ Parent   │  │ Admin    │  │ API Routes    │   │
│  │ App      │  │ View     │  │ View     │  │ (webhooks,    │   │
│  │ (study,  │  │ (reports,│  │ (school  │  │  Clerk,       │   │
│  │  upload, │  │  flags,  │  │  mgmt)   │  │  Inngest)     │   │
│  │  plan)   │  │  progress│  │          │  │               │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┬───────┘   │
│       │              │             │                │           │
│  ┌────▼──────────────▼─────────────▼────────────────▼───────┐   │
│  │                      Engine Layer                        │   │
│  │  ┌────────────┐ ┌──────────┐ ┌─────────┐ ┌───────────┐  │   │
│  │  │ Ingestion  │ │Scheduler │ │ Session │ │ Reporting │  │   │
│  │  │ Pipeline   │ │+ Mastery │ │ Runner  │ │ Engine    │  │   │
│  │  └─────┬──────┘ └────┬─────┘ └────┬────┘ └─────┬─────┘  │   │
│  └────────┼──────────────┼────────────┼────────────┼────────┘   │
│           │              │            │            │             │
│  ┌────────▼──────────────▼────────────▼────────────▼────────┐   │
│  │                   Data Access Layer                       │   │
│  │              Drizzle ORM + scoped queries                 │   │
│  └──────────────────────┬───────────────────────────────────┘   │
└─────────────────────────┼───────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
  ┌───────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
  │  Cloud SQL   │ │   Claude    │ │   Cloud     │
  │  (Postgres   │ │   API       │ │   Storage   │
  │  + pgvector) │ │   + Voyage  │ │   (files)   │
  └──────────────┘ └─────────────┘ └─────────────┘
```

## The five data layers

The system is built on five durable state layers. Each layer has its own schema file and owns specific tables. Layers communicate through well-defined interfaces, not by reaching into each other's tables directly.

### Layer 1: Identity & Tenancy

Handles users, organisations, roles, and relationships. The key abstraction: a **household is just an organisation** with type `household`. This makes B2C and B2B use the same data model.

```
┌──────────────┐
│ organization │──┐
│ (household   │  │    ┌────────────┐
│  or school)  │  ├───▶│ membership │──▶ user
└──────────────┘  │    └────────────┘
                  │    ┌────────────┐
                  ├───▶│   class    │──▶ enrollments ──▶ learner
                  │    └────────────┘
                  │    ┌────────────┐
                  └───▶│   cohort   │
                       └────────────┘

user ──▶ learner (1:1 for students)
user ──▶ guardian_link ──▶ learner (many guardians per learner)
user ──▶ staff_profile (for teachers/admins)

learner ──▶ learner_qualifications ──▶ qualification_version
               (what this student is studying, with exam dates + target grades)

policies (scoped key-value store)
  └──▶ resolution order: learner → class → org → qualification → global
```

**Scoping rule:** every query that touches user data must be scoped to an organisation. No global queries outside of system admin.

### Layer 2: Qualification & Curriculum

The canonical academic structure. This is reference data — mostly read-only after seeding.

```
exam_board ──▶ qualification_version ──▶ subject
                       │
                       ├──▶ assessment_component (Paper 1, Paper 2, Coursework)
                       │
                       ├──▶ topic (hierarchical tree)
                       │       │
                       │       └──▶ topic_edge (prerequisite / builds_on / related)
                       │
                       ├──▶ question_type (multiple choice, extended response, etc.)
                       │
                       ├──▶ command_word (analyse, evaluate, compare, etc.)
                       │
                       └──▶ misconception_rule (common mistakes per topic)
                            task_rule (what exercises suit this topic)
```

**Topic graph:** topics form a tree (parent_topic_id) with cross-cutting edges (topic_edges). The tree gives hierarchy (Unit → Chapter → Section). The edges give learning dependencies ("you need to understand cell structure before cell division").

### Layer 3: Source & Retrieval

All uploaded or connected evidence — student notes, slides, past papers, teacher handouts.

```
source_collection (scoped with FK per scope type: learner_id, org_id, or class_id)
    │
    └──▶ source_file
            │
            ├──▶ source_chunk (text segments)
            │       │
            │       └──▶ chunk_embedding (pgvector, 1024d)
            │
            └──▶ source_mapping (chunk → topic / component, with confidence)
```

**Ingestion flow:**

```
File Upload ──▶ Store in Cloud Storage
            ──▶ Extract text (PDF/DOCX/images via OCR)
            ──▶ Chunk text (semantic boundaries, ~500 tokens)
            ──▶ Generate embeddings (Voyage AI)
            ──▶ Store chunks + embeddings in Postgres
            ──▶ Map chunks to qualification topics (Claude)
            ──▶ Score mapping confidence
            ──▶ Update coverage model
```

**Scoping namespaces:**

| Scope | Visible to | Example |
|-------|-----------|---------|
| `private` | Learner only | Personal revision notes |
| `household` | Learner + guardians | Shared family materials |
| `class` | Class members | Teacher handouts for 10B Biology |
| `org` | Whole school | School-wide past paper bank |
| `system` | Everyone | Official specification materials |

Retrieval queries always filter by scope. A learner sees: their private sources + household sources + class sources + org sources + system sources. Never another learner's private sources.

### Layer 4: Learner State

The heart of the product. This is what makes Swotta more than RAG.

```
learner
  │
  ├──▶ learner_topic_state (mastery per topic, spaced repetition state)
  │
  ├──▶ learner_component_state (predicted grade per assessment component)
  │
  ├──▶ learner_preferences (study time, difficulty, format preferences)
  │
  ├──▶ memory_candidates (inferred but unconfirmed patterns)
  │       │
  │       └──▶ memory_confirmed (promoted when evidence is strong)
  │
  ├──▶ misconception_events (specific mistakes, linked to topics + rules)
  │
  ├──▶ confidence_events (self-rated vs actual performance over time)
  │
  ├──▶ retention_events (spaced repetition outcomes per review)
  │
  └──▶ study_sessions (session metadata + summary, conversation state is client-side)
```

**Memory model:**

The distinction between candidate and confirmed memory is critical:

- **Candidate memory:** "This student seems to prefer visual explanations" (inferred from 3 sessions). Stored with evidence_count. Used to personalise but held loosely.
- **Confirmed memory:** "This student has dyslexia and needs larger text" (stated by student or guardian). Promoted from candidate or entered directly. Used with high confidence.

Candidates are promoted to confirmed when evidence_count crosses a threshold OR when explicitly confirmed by the learner/guardian.

**Spaced repetition model:**

Each `learner_topic_state` row tracks:
- `mastery_level` (0.0 to 1.0) — current knowledge estimate
- `ease_factor` (default 2.5) — SM-2 ease factor, adjusted per review
- `interval_days` — current review interval
- `next_review_at` — when this topic should next appear in the queue
- `streak` — consecutive successful reviews

After each review, the scheduler updates these values using a modified SM-2 algorithm. Decay is modelled passively: topics whose `next_review_at` has passed are surfaced with increasing urgency.

### Layer 5: Planning, Execution & Reporting

Turns state into behaviour.

```
study_plan (weekly / exam_prep / recovery)
    │
    └──▶ study_block
            │
            └──▶ block_attempt (outcomes, confidence, misconceptions)

review_queue (topics due for review, prioritised)

weekly_report ──▶ sent to guardians / teachers
safety_flag ──▶ alerts for disengagement, avoidance, distress
notification_event ──▶ email / push / in-app
audit_log ──▶ compliance trail
```

**Study block types:**

| Type | Purpose |
|------|---------|
| `retrieval_drill` | Quick-fire recall questions, no hints |
| `explanation` | Teach/re-teach a concept, check understanding |
| `worked_example` | Walk through a solved problem, then attempt similar |
| `timed_problems` | Exam-condition practice |
| `essay_planning` | Structure an extended response |
| `source_analysis` | Work with provided materials/data |
| `mistake_review` | Revisit specific misconceptions |
| `reentry` | Gentle warm-up after a study gap |

## Core engine flows

### A. Ingestion

```
File arrives (upload or class share)
        │
        ▼
┌─────────────────┐
│ Store raw file   │──▶ Cloud Storage
│ Create source_   │
│ file record      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Extract text     │──▶ PDF: pdf-parse
│                  │──▶ DOCX: mammoth
│                  │──▶ Images: Claude vision
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Chunk text       │──▶ Semantic boundaries, ~500 tokens
│ Generate embeds  │──▶ Voyage AI → pgvector
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Map to topics    │──▶ Claude classifies each chunk
│ Score confidence │    against qualification graph
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Update coverage  │──▶ Which topics now have source material?
│ Create study     │──▶ New material → candidate study blocks
│ opportunities    │
└─────────────────┘
```

Runs as an Inngest function. Retryable at each step. File status transitions: `pending` → `processing` → `ready` (or `failed`).

### B. Session planning (what should the student study next?)

```
Inputs:
  ├── qualification rules (what topics exist, weights)
  ├── learner_topic_state (mastery + retention per topic)
  ├── review_queue (overdue reviews)
  ├── upcoming exams (deadline pressure)
  ├── class context (current homework/assignments)
  ├── source availability (do we have material for this topic?)
  ├── session length preference
  └── behavioural signals (avoidance, fatigue, streak)

        │
        ▼
┌─────────────────────┐
│     Scheduler        │
│                      │
│  1. Pull overdue     │
│     reviews          │
│  2. Weight by exam   │
│     proximity        │
│  3. Factor mastery   │
│     gaps             │
│  4. Check source     │
│     coverage         │
│  5. Apply recovery   │
│     rules if gap     │
│  6. Select block     │
│     type             │
│  7. Estimate         │
│     duration         │
└──────────┬──────────┘
           │
           ▼
    ┌──────────────┐
    │  StudyBlock   │ (topic, type, duration, priority)
    └──────────────┘
```

### C. Session execution

```
StudyBlock presented to learner
        │
        ▼
┌─────────────────────┐
│  Claude generates    │──▶ Questions / explanations / exercises
│  session content     │    grounded in learner's source materials
│  (scoped retrieval)  │    and qualification requirements
└────────┬────────────┘
         │
Note: Conversation history is managed client-side.
The client sends the full message array with each
request. Cloud Run remains stateless. Only the final
outcome and summary are persisted to study_sessions.
         │
    Learner works through session
         │
         ▼
┌─────────────────────┐
│  Capture outcomes    │
│  ├── score           │
│  ├── confidence      │
│  │   (before/after)  │
│  ├── misconceptions  │
│  ├── time spent      │
│  ├── help requested? │
│  ├── help timing     │
│  │   (before/after   │
│  │    attempt)       │
│  └── re-queue?       │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Update state        │
│  ├── mastery_level   │
│  ├── ease_factor     │
│  ├── next_review_at  │
│  ├── misconception   │
│  │   events          │
│  ├── confidence      │
│  │   events          │
│  ├── retention       │
│  │   events          │
│  └── memory          │
│      candidates      │
└─────────────────────┘
```

### D. Weekly review (background, Inngest cron)

```
Every Sunday evening:
        │
        ▼
┌─────────────────────┐
│  For each learner:   │
│  ├── Aggregate week's│
│  │   session data    │
│  ├── Compute mastery │
│  │   changes         │
│  ├── Detect flags:   │
│  │   ├── chronic     │
│  │   │   avoidance   │
│  │   ├── rapid decay │
│  │   ├── repeated    │
│  │   │   misconception│
│  │   │   clusters    │
│  │   └── sudden      │
│  │       disengage   │
│  ├── Generate summary│
│  │   (Claude)        │
│  ├── Update plan for │
│  │   next week       │
│  └── Send reports    │
│      ├── parent email│
│      └── teacher view│
│         (if B2B)     │
└─────────────────────┘
```

## Multi-tenancy model

### Organisation types

| Type | Use case | Created by |
|------|----------|------------|
| `household` | B2C family | Parent signs up |
| `school` | B2B school | School admin or Swotta onboarding |
| `tutor_org` | B2B tutor group | Tutor signs up |

### Role hierarchy

```
org_owner ──▶ full org control
school_admin ──▶ manage classes, teachers, students
teacher ──▶ manage own classes, view own students
tutor ──▶ view/guide assigned learners
guardian ──▶ view linked learners' progress
learner ──▶ own study experience
```

### Policy layers (applied in order, most specific wins)

```
1. Global Swotta policy (safety, content boundaries)
2. Qualification policy (subject-specific rules, mark scheme conventions)
3. Organisation policy (school rules, e.g. "no AI-generated essays")
4. Class policy (teacher preferences, e.g. "focus on Paper 2 topics this term")
5. Learner policy (individual accommodations, preferences)
```

## AI integration patterns

### Study sessions

Claude powers interactive study sessions. Each session call includes:

1. **System prompt:** session mode instructions (retrieval drill vs explanation vs essay planning, etc.)
2. **Policy context:** resolved policies for this learner (walked up from learner → class → org → qualification → global, most specific wins)
3. **Qualification context:** relevant topic definition, command words, mark scheme patterns
4. **Learner context:** mastery level, known misconceptions, confirmed memory, preferences
5. **Source context:** relevant chunks retrieved via pgvector similarity search, scoped to the learner's accessible sources
6. **Session history:** prior turns in the current session

Responses are streamed to the frontend. The session runner parses structured output to extract scores, misconceptions, and confidence signals.

### Material analysis

Claude analyses uploaded materials to:
- Extract structure (headings, sections, question boundaries)
- Classify content against the qualification topic graph
- Identify question types and command words
- Score difficulty
- Flag potential exam questions vs teaching material

### Report generation

Claude generates natural-language weekly summaries from structured data (mastery changes, session counts, flags). The prompt includes the parent/teacher context and communication preferences.

## Security model

- **Auth:** Clerk handles authentication. JWTs verified server-side on every request.
- **Authorisation:** Application-level. Every data query is scoped by org + role. No cross-tenant data access.
- **Policy enforcement:** Five-layer policy hierarchy (global → qualification → org → class → learner). Policies are resolved at query time with most-specific-wins semantics. Used for content boundaries, session constraints, and org-specific rules.
- **Source scoping:** Enforced at the query layer. Retrieval queries always include scope filters.
- **AI safety:** Global policy layer prevents harmful content generation. Study sessions operate in guided modes — Claude explains and quizzes, it does not write essays for the student.
- **Data residency:** All data stored in GCP europe-west2 (London). Postgres, Cloud Storage, and Cloud Run all in the same region.
- **Audit:** All write operations logged to audit_log with user, org, action, and resource context.
- **File uploads:** Validated by type and size. Stored in Cloud Storage with signed URLs (time-limited access). Never served directly.

## Deployment

```
┌─────────────────────┐
│   Cloud Run          │──▶ Next.js app (containerised)
│   (europe-west2)     │    Auto-scales 0 → N instances
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│   Cloud SQL          │──▶ Postgres 16 + pgvector
│   (europe-west2)     │    Private IP, no public access
└─────────────────────┘

┌─────────────────────┐
│   Cloud Storage      │──▶ Student uploads
│   (europe-west2)     │    Lifecycle rules for cleanup
└─────────────────────┘

┌─────────────────────┐
│   Inngest (hosted)   │──▶ Background jobs
│                      │    Calls Cloud Run via HTTPS
└─────────────────────┘

┌─────────────────────┐
│   Clerk (hosted)     │──▶ Auth + org management
└─────────────────────┘

┌─────────────────────┐
│   Resend (hosted)    │──▶ Transactional email
└─────────────────────┘
```

Local development uses Docker Compose for Postgres + pgvector. Everything else connects to hosted services (Clerk dev instance, Inngest dev server).

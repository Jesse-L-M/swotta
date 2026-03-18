# Schema

This document defines every table, column, type, and relationship in the Swotta database. The Drizzle schema files in `src/db/schema/` must implement this specification exactly.

All tables use UUID primary keys, UTC timestamps, and follow the conventions in `DECISIONS.md`.

## Custom types

```
org_type        = 'household' | 'school' | 'tutor_org'
role_type       = 'learner' | 'guardian' | 'tutor' | 'teacher' | 'school_admin' | 'org_owner'
scope_type      = 'private' | 'household' | 'class' | 'org' | 'system'
block_type      = 'retrieval_drill' | 'explanation' | 'worked_example' | 'timed_problems'
                  | 'essay_planning' | 'source_analysis' | 'mistake_review' | 'reentry'
block_status    = 'pending' | 'active' | 'completed' | 'skipped'
file_status     = 'pending' | 'processing' | 'ready' | 'failed'
plan_type       = 'weekly' | 'exam_prep' | 'recovery'
plan_status     = 'draft' | 'active' | 'completed' | 'abandoned'
edge_type       = 'prerequisite' | 'builds_on' | 'related'
review_reason   = 'scheduled' | 'decay' | 'misconception' | 'exam_approaching'
help_timing     = 'before_attempt' | 'after_attempt'
retention_outcome = 'remembered' | 'partial' | 'forgotten'
flag_type       = 'disengagement' | 'avoidance' | 'distress' | 'overreliance'
flag_severity   = 'low' | 'medium' | 'high'
notification_channel = 'email' | 'push' | 'in_app'
mapping_method  = 'auto' | 'manual'
qual_level      = 'GCSE' | 'AS' | 'A-Level' | 'IB' | 'BTEC' | 'Scottish_National' | 'Scottish_Higher'
session_status  = 'active' | 'completed' | 'abandoned' | 'timeout'
learner_qual_status = 'active' | 'completed' | 'dropped'
policy_scope    = 'global' | 'qualification' | 'org' | 'class' | 'learner'
```

---

## Layer 1: Identity & Tenancy (`src/db/schema/identity.ts`)

### organizations

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| name | varchar(255) | NOT NULL | "The Smith Family" or "Oakwood Academy" |
| type | org_type | NOT NULL | |
| slug | varchar(100) | UNIQUE, NOT NULL | URL-safe identifier |
| settings | jsonb | DEFAULT '{}' | Org-level preferences and policy overrides |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

### users

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| clerk_id | varchar(255) | UNIQUE, NOT NULL | Clerk external ID |
| email | varchar(255) | NOT NULL | |
| name | varchar(255) | NOT NULL | |
| avatar_url | text | nullable | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

Index: `users_clerk_id_idx` on clerk_id.

### memberships

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| user_id | uuid | FK → users.id, NOT NULL | |
| org_id | uuid | FK → organizations.id, NOT NULL | |
| role | role_type | NOT NULL | |
| created_at | timestamptz | NOT NULL, default now() | |

Unique constraint: `(user_id, org_id, role)`. A user can have multiple roles in the same org (e.g., a teacher who is also a guardian).

### learners

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| user_id | uuid | FK → users.id, UNIQUE, NOT NULL | 1:1 with user |
| org_id | uuid | FK → organizations.id, NOT NULL | Primary org (household or school) |
| display_name | varchar(255) | NOT NULL | Name shown in the app |
| year_group | integer | nullable | UK year group (7-13) or equivalent |
| date_of_birth | date | nullable | For age-appropriate content |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

### guardian_links

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| guardian_user_id | uuid | FK → users.id, NOT NULL | The parent/guardian |
| learner_id | uuid | FK → learners.id, NOT NULL | |
| relationship | varchar(50) | NOT NULL | 'parent', 'guardian', 'carer', etc. |
| receives_weekly_report | boolean | NOT NULL, default true | |
| receives_flags | boolean | NOT NULL, default true | |
| created_at | timestamptz | NOT NULL, default now() | |

Unique constraint: `(guardian_user_id, learner_id)`.

### staff_profiles

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| user_id | uuid | FK → users.id, NOT NULL | |
| org_id | uuid | FK → organizations.id, NOT NULL | |
| title | varchar(255) | nullable | "Head of Science" |
| department | varchar(255) | nullable | |
| created_at | timestamptz | NOT NULL, default now() | |

Unique constraint: `(user_id, org_id)`.

### classes

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| org_id | uuid | FK → organizations.id, NOT NULL | |
| name | varchar(255) | NOT NULL | "10B Biology" |
| subject_id | uuid | FK → subjects.id, nullable | |
| qualification_version_id | uuid | FK → qualification_versions.id, nullable | |
| year_group | integer | nullable | |
| academic_year | varchar(9) | NOT NULL | "2025-2026" |
| teacher_user_id | uuid | FK → users.id, nullable | Primary teacher |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

### cohorts

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| class_id | uuid | FK → classes.id, NOT NULL | |
| name | varchar(255) | NOT NULL | "Set 1", "Group A" |
| created_at | timestamptz | NOT NULL, default now() | |

### enrollments

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| learner_id | uuid | FK → learners.id, NOT NULL | |
| class_id | uuid | FK → classes.id, NOT NULL | |
| cohort_id | uuid | FK → cohorts.id, nullable | |
| enrolled_at | timestamptz | NOT NULL, default now() | |
| unenrolled_at | timestamptz | nullable | |

Unique constraint: `(learner_id, class_id)`.

### learner_qualifications

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| learner_id | uuid | FK → learners.id, NOT NULL | |
| qualification_version_id | uuid | FK → qualification_versions.id, NOT NULL | |
| target_grade | varchar(10) | nullable | "7", "A*", "Distinction" |
| exam_date | date | nullable | When their exam is scheduled |
| status | varchar(20) | NOT NULL, default 'active' | 'active', 'completed', 'dropped' |
| enrolled_at | timestamptz | NOT NULL, default now() | |
| created_at | timestamptz | NOT NULL, default now() | |

Unique constraint: `(learner_id, qualification_version_id)`.

This is the critical join between "who is this student" and "what are they studying." Required by the scheduler, mastery engine, session runner, and reporting engine.

### policies

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| scope_type | varchar(20) | NOT NULL | 'global', 'qualification', 'org', 'class', 'learner' |
| scope_id | uuid | nullable | null for global scope |
| key | varchar(100) | NOT NULL | "essay_generation_allowed", "focus_components", "session_time_limit" |
| value | jsonb | NOT NULL | |
| created_by_user_id | uuid | FK → users.id, nullable | null for system-set policies |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

Unique constraint: `(scope_type, scope_id, key)`.

Policy resolution order: learner → class → org → qualification → global. Most specific wins.

---

## Layer 2: Qualification & Curriculum (`src/db/schema/curriculum.ts`)

### exam_boards

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| name | varchar(255) | NOT NULL | "AQA", "OCR", "Edexcel" |
| code | varchar(20) | UNIQUE, NOT NULL | "AQA", "OCR", "EDEXCEL", "WJEC", "SQA" |
| country | varchar(2) | NOT NULL, default 'GB' | ISO 3166-1 alpha-2 |
| created_at | timestamptz | NOT NULL, default now() | |

### subjects

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| name | varchar(255) | NOT NULL | "Biology", "English Literature" |
| slug | varchar(100) | UNIQUE, NOT NULL | "biology", "english-literature" |
| created_at | timestamptz | NOT NULL, default now() | |

### qualifications

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| subject_id | uuid | FK → subjects.id, NOT NULL | |
| level | qual_level | NOT NULL | |
| name | varchar(255) | NOT NULL | "GCSE Biology" |
| created_at | timestamptz | NOT NULL, default now() | |

Unique constraint: `(subject_id, level)`.

### qualification_versions

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| qualification_id | uuid | FK → qualifications.id, NOT NULL | |
| exam_board_id | uuid | FK → exam_boards.id, NOT NULL | |
| version_code | varchar(50) | NOT NULL | Spec reference, e.g. "8461" for AQA GCSE Biology |
| first_exam_year | integer | NOT NULL | 2018 |
| last_exam_year | integer | nullable | null = still current |
| spec_url | text | nullable | Link to official specification |
| total_marks | integer | nullable | |
| created_at | timestamptz | NOT NULL, default now() | |

Unique constraint: `(qualification_id, exam_board_id, version_code)`.

### assessment_components

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| qualification_version_id | uuid | FK → qualification_versions.id, NOT NULL | |
| name | varchar(255) | NOT NULL | "Paper 1: Cell Biology; Organisation; Infection and Response; Bioenergetics" |
| code | varchar(50) | NOT NULL | "8461/1H" |
| weight_percent | integer | NOT NULL | 50 (meaning 50%) |
| duration_minutes | integer | nullable | 105 |
| total_marks | integer | nullable | |
| is_exam | boolean | NOT NULL, default true | false for coursework/NEA |
| created_at | timestamptz | NOT NULL, default now() | |

### topics

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| qualification_version_id | uuid | FK → qualification_versions.id, NOT NULL | |
| parent_topic_id | uuid | FK → topics.id, nullable | null = top-level unit |
| name | varchar(255) | NOT NULL | "4.1 Cell Biology" or "4.1.1 Cell Structure" |
| code | varchar(50) | nullable | Spec reference number |
| depth | integer | NOT NULL, default 0 | 0 = unit, 1 = chapter, 2 = section, etc. |
| sort_order | integer | NOT NULL | Order within parent |
| description | text | nullable | Brief description of topic content |
| estimated_hours | decimal(4,1) | nullable | Rough teaching time |
| created_at | timestamptz | NOT NULL, default now() | |

Index: `topics_qualification_version_id_idx`.
Index: `topics_parent_topic_id_idx`.

### topic_edges

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| from_topic_id | uuid | FK → topics.id, NOT NULL | |
| to_topic_id | uuid | FK → topics.id, NOT NULL | |
| edge_type | edge_type | NOT NULL | |
| weight | decimal(3,2) | NOT NULL, default 1.0 | Strength of relationship |
| created_at | timestamptz | NOT NULL, default now() | |

Unique constraint: `(from_topic_id, to_topic_id, edge_type)`.
Check constraint: `from_topic_id != to_topic_id`.

### question_types

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| qualification_version_id | uuid | FK → qualification_versions.id, NOT NULL | |
| name | varchar(255) | NOT NULL | "Multiple choice", "6-mark extended response" |
| description | text | nullable | |
| typical_marks | integer | nullable | |
| mark_scheme_pattern | text | nullable | Guidance on how this type is typically marked |
| created_at | timestamptz | NOT NULL, default now() | |

### command_words

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| qualification_version_id | uuid | FK → qualification_versions.id, NOT NULL | |
| word | varchar(100) | NOT NULL | "Evaluate", "Compare", "Suggest" |
| definition | text | NOT NULL | Official definition from the spec |
| expected_depth | integer | NOT NULL | 1=recall, 2=application, 3=analysis, 4=evaluation |
| created_at | timestamptz | NOT NULL, default now() | |

Unique constraint: `(qualification_version_id, word)`.

### misconception_rules

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| topic_id | uuid | FK → topics.id, NOT NULL | |
| description | text | NOT NULL | "Confuses mitosis with meiosis" |
| trigger_patterns | text[] | NOT NULL | Keywords/phrases that suggest this misconception |
| correction_guidance | text | NOT NULL | How to address it |
| severity | integer | NOT NULL, default 2 | 1=minor, 2=moderate, 3=critical |
| created_at | timestamptz | NOT NULL, default now() | |

### task_rules

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| topic_id | uuid | FK → topics.id, NOT NULL | |
| question_type_id | uuid | FK → question_types.id, nullable | |
| block_type | block_type | NOT NULL | Which study block type suits this |
| difficulty_min | integer | NOT NULL, default 1 | 1-5 scale |
| difficulty_max | integer | NOT NULL, default 5 | |
| time_estimate_minutes | integer | NOT NULL | |
| instructions | text | nullable | Additional generation instructions |
| created_at | timestamptz | NOT NULL, default now() | |

---

## Layer 3: Source & Retrieval (`src/db/schema/sources.ts`)

### source_collections

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| scope | scope_type | NOT NULL | Which visibility scope this collection belongs to |
| learner_id | uuid | FK → learners.id, nullable | Set when scope = 'private' |
| org_id | uuid | FK → organizations.id, nullable | Set when scope = 'household' or 'org' |
| class_id | uuid | FK → classes.id, nullable | Set when scope = 'class' |
| name | varchar(255) | NOT NULL | "My Biology Notes", "10B Class Resources" |
| description | text | nullable | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

CHECK constraint: `(scope = 'system' AND learner_id IS NULL AND org_id IS NULL AND class_id IS NULL) OR (scope = 'private' AND learner_id IS NOT NULL) OR (scope IN ('household', 'org') AND org_id IS NOT NULL) OR (scope = 'class' AND class_id IS NOT NULL)`.

Index: `source_collections_learner_id_idx` on learner_id WHERE learner_id IS NOT NULL.
Index: `source_collections_org_id_idx` on org_id WHERE org_id IS NOT NULL.
Index: `source_collections_class_id_idx` on class_id WHERE class_id IS NOT NULL.

### source_files

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| collection_id | uuid | FK → source_collections.id, NOT NULL | |
| uploaded_by_user_id | uuid | FK → users.id, NOT NULL | |
| filename | varchar(255) | NOT NULL | Original filename |
| mime_type | varchar(100) | NOT NULL | |
| storage_path | text | NOT NULL | Cloud Storage path |
| size_bytes | bigint | NOT NULL | |
| status | file_status | NOT NULL, default 'pending' | |
| page_count | integer | nullable | For PDFs |
| error_message | text | nullable | If status = 'failed' |
| processed_at | timestamptz | nullable | When processing completed |
| created_at | timestamptz | NOT NULL, default now() | |

Index: `source_files_collection_id_idx`.
Index: `source_files_status_idx`.

### source_chunks

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| file_id | uuid | FK → source_files.id, NOT NULL | |
| content | text | NOT NULL | The chunk text |
| chunk_index | integer | NOT NULL | Order within file |
| token_count | integer | NOT NULL | |
| start_page | integer | nullable | For PDFs |
| end_page | integer | nullable | |
| created_at | timestamptz | NOT NULL, default now() | |

Index: `source_chunks_file_id_idx`.

### chunk_embeddings

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| chunk_id | uuid | FK → source_chunks.id, UNIQUE, NOT NULL | 1:1 with chunk |
| embedding | vector(1024) | NOT NULL | pgvector, Voyage AI voyage-3 |
| model | varchar(50) | NOT NULL | "voyage-3" — stored for future model upgrades |
| created_at | timestamptz | NOT NULL, default now() | |

Index: `chunk_embeddings_embedding_idx` using HNSW (ivfflat for >100k rows).

### source_mappings

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| chunk_id | uuid | FK → source_chunks.id, NOT NULL | |
| topic_id | uuid | FK → topics.id, nullable | |
| component_id | uuid | FK → assessment_components.id, nullable | |
| confidence | decimal(3,2) | NOT NULL | 0.00 to 1.00 |
| mapping_method | mapping_method | NOT NULL | |
| created_at | timestamptz | NOT NULL, default now() | |

At least one of topic_id or component_id must be non-null.
CHECK constraint: `(topic_id IS NOT NULL OR component_id IS NOT NULL)`.
Index: `source_mappings_chunk_id_idx`.
Index: `source_mappings_topic_id_idx`.

---

## Layer 4: Learner State (`src/db/schema/learner-state.ts`)

### learner_topic_state

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| learner_id | uuid | FK → learners.id, NOT NULL | |
| topic_id | uuid | FK → topics.id, NOT NULL | |
| mastery_level | decimal(4,3) | NOT NULL, default 0.000 | 0.000 to 1.000 |
| confidence | decimal(4,3) | NOT NULL, default 0.000 | Self-rated, 0.000 to 1.000 |
| ease_factor | decimal(4,2) | NOT NULL, default 2.50 | SM-2, minimum 1.30 |
| interval_days | integer | NOT NULL, default 0 | Current review interval |
| next_review_at | timestamptz | nullable | null = never reviewed |
| last_reviewed_at | timestamptz | nullable | |
| review_count | integer | NOT NULL, default 0 | |
| streak | integer | NOT NULL, default 0 | Consecutive successful reviews |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

Unique constraint: `(learner_id, topic_id)`.
Index: `learner_topic_state_next_review_idx` on (learner_id, next_review_at).

### learner_component_state

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| learner_id | uuid | FK → learners.id, NOT NULL | |
| component_id | uuid | FK → assessment_components.id, NOT NULL | |
| predicted_grade | varchar(10) | nullable | "7", "A*", "Distinction" |
| predicted_percent | decimal(5,2) | nullable | |
| confidence | decimal(4,3) | NOT NULL, default 0.000 | |
| last_assessed_at | timestamptz | nullable | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

Unique constraint: `(learner_id, component_id)`.

### learner_preferences

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| learner_id | uuid | FK → learners.id, NOT NULL | |
| key | varchar(100) | NOT NULL | "preferred_session_minutes", "preferred_difficulty", "visual_learner" |
| value | jsonb | NOT NULL | Flexible value storage |
| source | varchar(50) | NOT NULL, default 'inferred' | 'stated', 'inferred', 'guardian_set' |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

Unique constraint: `(learner_id, key)`.

### memory_candidates

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| learner_id | uuid | FK → learners.id, NOT NULL | |
| category | varchar(100) | NOT NULL | "learning_style", "misconception_pattern", "time_preference" |
| content | text | NOT NULL | Human-readable description |
| evidence_count | integer | NOT NULL, default 1 | Incremented each time pattern is observed |
| first_seen_at | timestamptz | NOT NULL, default now() | |
| last_seen_at | timestamptz | NOT NULL, default now() | |
| promoted_at | timestamptz | nullable | When promoted to confirmed |
| created_at | timestamptz | NOT NULL, default now() | |

Index: `memory_candidates_learner_id_idx`.

### memory_confirmed

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| learner_id | uuid | FK → learners.id, NOT NULL | |
| category | varchar(100) | NOT NULL | |
| content | text | NOT NULL | |
| source_candidate_id | uuid | FK → memory_candidates.id, nullable | null if entered directly |
| confirmed_by | varchar(50) | NOT NULL | 'auto_promotion', 'learner', 'guardian', 'teacher' |
| confirmed_at | timestamptz | NOT NULL, default now() | |
| created_at | timestamptz | NOT NULL, default now() | |

Index: `memory_confirmed_learner_id_idx`.

### misconception_events

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| learner_id | uuid | FK → learners.id, NOT NULL | |
| topic_id | uuid | FK → topics.id, NOT NULL | |
| misconception_rule_id | uuid | FK → misconception_rules.id, nullable | null if novel misconception |
| block_attempt_id | uuid | FK → block_attempts.id, nullable | |
| description | text | NOT NULL | What the misconception was |
| severity | integer | NOT NULL | 1-3 |
| resolved | boolean | NOT NULL, default false | |
| resolved_at | timestamptz | nullable | |
| created_at | timestamptz | NOT NULL, default now() | |

Index: `misconception_events_learner_topic_idx` on (learner_id, topic_id).

### confidence_events

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| learner_id | uuid | FK → learners.id, NOT NULL | |
| topic_id | uuid | FK → topics.id, NOT NULL | |
| block_attempt_id | uuid | FK → block_attempts.id, nullable | |
| self_rated | decimal(4,3) | NOT NULL | What the learner thought (0-1) |
| actual | decimal(4,3) | NOT NULL | How they actually performed (0-1) |
| delta | decimal(4,3) | NOT NULL | self_rated - actual (positive = overconfident) |
| created_at | timestamptz | NOT NULL, default now() | |

### retention_events

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| learner_id | uuid | FK → learners.id, NOT NULL | |
| topic_id | uuid | FK → topics.id, NOT NULL | |
| block_attempt_id | uuid | FK → block_attempts.id, nullable | |
| interval_days | integer | NOT NULL | How many days since last review |
| outcome | retention_outcome | NOT NULL | |
| ease_factor_before | decimal(4,2) | NOT NULL | |
| ease_factor_after | decimal(4,2) | NOT NULL | |
| created_at | timestamptz | NOT NULL, default now() | |

### study_sessions

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| learner_id | uuid | FK → learners.id, NOT NULL | |
| block_id | uuid | FK → study_blocks.id, nullable | null for ad-hoc sessions |
| status | varchar(20) | NOT NULL, default 'active' | 'active', 'completed', 'abandoned', 'timeout' |
| started_at | timestamptz | NOT NULL, default now() | |
| ended_at | timestamptz | nullable | |
| summary | text | nullable | AI-generated session summary, populated on end |
| topics_covered | uuid[] | NOT NULL, default '{}' | Array of topic IDs |
| blocks_completed | integer | NOT NULL, default 0 | |
| total_duration_minutes | integer | nullable | |
| mood_start | integer | nullable | 1-5, self-reported |
| mood_end | integer | nullable | 1-5, self-reported |
| created_at | timestamptz | NOT NULL, default now() | |

Index: `study_sessions_learner_id_idx`.
Index: `study_sessions_status_idx` on (learner_id, status).

Note: Conversation history is NOT stored server-side. The client sends the full message array with each request (matching the Claude API's expected format). This keeps Cloud Run stateless. Only the session metadata and final summary are persisted.

---

## Layer 5: Planning, Execution & Reporting (`src/db/schema/planning.ts`)

### study_plans

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| learner_id | uuid | FK → learners.id, NOT NULL | |
| plan_type | plan_type | NOT NULL | |
| title | varchar(255) | nullable | "Week of 24 March" or "Biology Exam Prep" |
| start_date | date | NOT NULL | |
| end_date | date | NOT NULL | |
| status | plan_status | NOT NULL, default 'draft' | |
| config | jsonb | DEFAULT '{}' | Plan-specific settings (daily minutes, focus areas) |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

Index: `study_plans_learner_status_idx` on (learner_id, status).

### study_blocks

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| plan_id | uuid | FK → study_plans.id, nullable | null = ad-hoc block |
| learner_id | uuid | FK → learners.id, NOT NULL | |
| topic_id | uuid | FK → topics.id, NOT NULL | |
| block_type | block_type | NOT NULL | |
| scheduled_date | date | nullable | Which day this block is planned for |
| scheduled_order | integer | nullable | Order within the day |
| duration_minutes | integer | NOT NULL | Estimated duration |
| priority | integer | NOT NULL, default 5 | 1=highest, 10=lowest |
| status | block_status | NOT NULL, default 'pending' | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

Index: `study_blocks_learner_status_idx` on (learner_id, status).
Index: `study_blocks_scheduled_idx` on (learner_id, scheduled_date).

### block_attempts

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| block_id | uuid | FK → study_blocks.id, NOT NULL | |
| started_at | timestamptz | NOT NULL, default now() | |
| completed_at | timestamptz | nullable | |
| score | decimal(5,2) | nullable | Percentage, 0-100 |
| confidence_before | decimal(4,3) | nullable | Self-rated before attempt |
| confidence_after | decimal(4,3) | nullable | Self-rated after attempt |
| help_requested | boolean | NOT NULL, default false | |
| help_timing | help_timing | nullable | |
| misconceptions_detected | integer | NOT NULL, default 0 | Count |
| notes | text | nullable | AI-generated attempt notes |
| raw_interaction | jsonb | nullable | Full session transcript (for debugging/analysis) |
| created_at | timestamptz | NOT NULL, default now() | |

Cardinality: typically 1:1 with study_blocks. A new block_attempt is created if the learner retries after abandoning. Multiple attempts on the same block represent retries, not concurrent sessions.

### review_queue

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| learner_id | uuid | FK → learners.id, NOT NULL | |
| topic_id | uuid | FK → topics.id, NOT NULL | |
| reason | review_reason | NOT NULL | |
| priority | integer | NOT NULL | 1=highest, 10=lowest |
| due_at | timestamptz | NOT NULL | |
| fulfilled_at | timestamptz | nullable | When the review was completed |
| created_at | timestamptz | NOT NULL, default now() | |

Index: `review_queue_learner_due_idx` on (learner_id, due_at) WHERE fulfilled_at IS NULL.

### assignments

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| class_id | uuid | FK → classes.id, nullable | null = household-assigned |
| learner_id | uuid | FK → learners.id, NOT NULL | |
| set_by_user_id | uuid | FK → users.id, nullable | Teacher/guardian who set it |
| title | varchar(255) | NOT NULL | |
| description | text | nullable | |
| due_at | timestamptz | nullable | |
| source_file_id | uuid | FK → source_files.id, nullable | Attached material |
| topic_id | uuid | FK → topics.id, nullable | |
| status | varchar(20) | NOT NULL, default 'pending' | 'pending', 'in_progress', 'completed', 'overdue' |
| completed_at | timestamptz | nullable | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

### teacher_notes

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| staff_user_id | uuid | FK → users.id, NOT NULL | |
| learner_id | uuid | FK → learners.id, NOT NULL | |
| topic_id | uuid | FK → topics.id, nullable | |
| content | text | NOT NULL | |
| created_at | timestamptz | NOT NULL, default now() | |

### weekly_reports

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| learner_id | uuid | FK → learners.id, NOT NULL | |
| plan_id | uuid | FK → study_plans.id, nullable | |
| period_start | date | NOT NULL | |
| period_end | date | NOT NULL | |
| summary | text | NOT NULL | AI-generated natural language summary |
| mastery_changes | jsonb | NOT NULL | { topic_id: { before, after, delta } } |
| sessions_completed | integer | NOT NULL | |
| total_study_minutes | integer | NOT NULL | |
| topics_reviewed | integer | NOT NULL | |
| flags | jsonb | NOT NULL, default '[]' | Array of { type, description, severity } |
| sent_to | jsonb | NOT NULL, default '[]' | Array of { user_id, channel, sent_at } |
| created_at | timestamptz | NOT NULL, default now() | |

### notification_events

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| user_id | uuid | FK → users.id, NOT NULL | Recipient |
| org_id | uuid | FK → organizations.id, nullable | |
| type | varchar(100) | NOT NULL | "weekly_report", "safety_flag", "assignment_due", etc. |
| channel | notification_channel | NOT NULL | |
| subject | varchar(255) | nullable | Email subject |
| payload | jsonb | NOT NULL | Channel-specific content |
| sent_at | timestamptz | nullable | |
| read_at | timestamptz | nullable | |
| created_at | timestamptz | NOT NULL, default now() | |

Index: `notification_events_user_idx` on (user_id, created_at).

### safety_flags

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| learner_id | uuid | FK → learners.id, NOT NULL | |
| block_attempt_id | uuid | FK → block_attempts.id, nullable | |
| flag_type | flag_type | NOT NULL | |
| severity | flag_severity | NOT NULL | |
| description | text | NOT NULL | |
| evidence | jsonb | NOT NULL, default '{}' | Supporting data |
| resolved | boolean | NOT NULL, default false | |
| resolved_by_user_id | uuid | FK → users.id, nullable | |
| resolved_at | timestamptz | nullable | |
| resolution_notes | text | nullable | |
| created_at | timestamptz | NOT NULL, default now() | |

Index: `safety_flags_learner_idx` on (learner_id) WHERE resolved = false.

### audit_log

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default random | |
| org_id | uuid | FK → organizations.id, nullable | null for system actions |
| user_id | uuid | FK → users.id, nullable | null for system actions |
| action | varchar(100) | NOT NULL | "learner.created", "source.uploaded", "report.sent", etc. |
| resource_type | varchar(100) | NOT NULL | "learner", "source_file", "weekly_report", etc. |
| resource_id | uuid | NOT NULL | |
| metadata | jsonb | NOT NULL, default '{}' | Action-specific details |
| ip_address | inet | nullable | |
| created_at | timestamptz | NOT NULL, default now() | |

Index: `audit_log_org_idx` on (org_id, created_at).
Index: `audit_log_resource_idx` on (resource_type, resource_id).

**Note:** audit_log is append-only. No updates, no deletes.

---

## Table count summary

| Layer | Tables | Purpose |
|-------|--------|---------|
| Identity & Tenancy | 10 | Users, orgs, roles, relationships, policies |
| Qualification & Curriculum | 9 | Academic structure, reference data |
| Source & Retrieval | 5 | Uploaded materials, chunks, embeddings |
| Learner State | 8 | Mastery, memory, misconceptions, retention |
| Planning & Reporting | 8 | Plans, blocks, reports, safety, audit |
| **Total** | **40** | |

---

## Key relationships across layers

```
learner (L1) ──▶ learner_qualifications (L1) ──▶ qualification_version (L2)
learner (L1) ──▶ learner_topic_state (L4) ──▶ topic (L2)
learner (L1) ──▶ study_block (L5) ──▶ topic (L2)
source_collection (L3) ──▶ learner/org/class (L1) via scoped FKs
source_chunk (L3) ──▶ source_mapping (L3) ──▶ topic (L2)
block_attempt (L5) ──▶ misconception_event (L4) ──▶ misconception_rule (L2)
study_session (L4) ──▶ study_block (L5) ──▶ learner (L1)
weekly_report (L5) ──▶ learner (L1), study_plan (L5)
guardian_link (L1) ──▶ notification_event (L5)
policies (L1) ──▶ resolved per scope: learner → class → org → qualification → global
```

The curriculum layer (L2) is the shared backbone — it's referenced by sources (L3), learner state (L4), and planning (L5) but never modified by them.

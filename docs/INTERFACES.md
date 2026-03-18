# Interfaces

This document defines the contracts between components. When multiple agents build in parallel, these interfaces are the boundaries. Each agent owns the implementation behind their interface but must match the signatures exactly.

All types reference the Drizzle schema. `InferSelectModel<typeof tableName>` gives the row type. These interfaces use simplified type aliases for clarity.

---

## Shared types (`src/lib/types.ts`)

These types are shared across all engine modules. They are derived from but not identical to the database row types.

```typescript
// Core IDs (branded types for safety)
type LearnerId = string & { readonly __brand: 'LearnerId' }
type TopicId = string & { readonly __brand: 'TopicId' }
type QualificationVersionId = string & { readonly __brand: 'QualificationVersionId' }
type SessionId = string & { readonly __brand: 'SessionId' }
type OrgId = string & { readonly __brand: 'OrgId' }
type UserId = string & { readonly __brand: 'UserId' }
type ChunkId = string & { readonly __brand: 'ChunkId' }
type BlockId = string & { readonly __brand: 'BlockId' }
type AttemptId = string & { readonly __brand: 'AttemptId' }

// Enums (match DB custom types)
type BlockType = 'retrieval_drill' | 'explanation' | 'worked_example' | 'timed_problems'
  | 'essay_planning' | 'source_analysis' | 'mistake_review' | 'reentry'
type RetentionOutcome = 'remembered' | 'partial' | 'forgotten'
type ReviewReason = 'scheduled' | 'decay' | 'misconception' | 'exam_approaching'
type ScopeType = 'private' | 'household' | 'class' | 'org' | 'system'

// Composite types used across interfaces
interface TopicMastery {
  topicId: TopicId
  topicName: string
  masteryLevel: number       // 0-1
  confidence: number         // 0-1
  nextReviewAt: Date | null
  streak: number
  isOverdue: boolean
}

interface StudyBlock {
  id: BlockId
  learnerId: LearnerId
  topicId: TopicId
  topicName: string
  blockType: BlockType
  durationMinutes: number
  priority: number
  reason: string             // Human-readable: "Overdue review", "Low mastery", etc.
}

interface AttemptOutcome {
  blockId: BlockId
  score: number | null             // 0-100
  confidenceBefore: number | null  // 0-1
  confidenceAfter: number | null   // 0-1
  helpRequested: boolean
  helpTiming: 'before_attempt' | 'after_attempt' | null
  misconceptions: DetectedMisconception[]
  retentionOutcome: RetentionOutcome | null
  durationMinutes: number
  rawInteraction: Record<string, unknown> | null
}

interface DetectedMisconception {
  topicId: TopicId
  ruleId: string | null      // null if novel
  description: string
  severity: 1 | 2 | 3
}

interface RetrievalResult {
  chunkId: ChunkId
  content: string
  score: number              // Similarity score
  topicId: TopicId | null
  sourceFileName: string
  sourceFileId: string
}

interface LearnerQualification {
  learnerId: LearnerId
  qualificationVersionId: QualificationVersionId
  qualificationName: string
  examBoardCode: string
  targetGrade: string | null
  examDate: Date | null
  status: 'active' | 'completed' | 'dropped'
}

interface PolicyValue {
  scopeType: 'global' | 'qualification' | 'org' | 'class' | 'learner'
  scopeId: string | null
  key: string
  value: unknown
}

interface WeeklyReportData {
  learnerId: LearnerId
  periodStart: Date
  periodEnd: Date
  sessionsCompleted: number
  totalStudyMinutes: number
  topicsReviewed: number
  masteryChanges: Array<{
    topicId: TopicId
    topicName: string
    before: number
    after: number
    delta: number
  }>
  flags: Array<{
    type: string
    description: string
    severity: 'low' | 'medium' | 'high'
  }>
  summary: string            // AI-generated
}
```

---

## Engine interfaces

### Scheduler (`src/engine/scheduler.ts`)

Decides what the learner should study next.

```typescript
interface SchedulerConfig {
  maxBlocksPerSession: number       // default 5
  defaultSessionMinutes: number     // default 30
  examPressureWeightMultiplier: number  // default 2.0
  decayUrgencyDays: number          // days overdue before max urgency, default 14
}

// Get the next study blocks for a learner
function getNextBlocks(
  learnerId: LearnerId,
  options?: {
    qualificationVersionIds?: QualificationVersionId[] // filter to specific qualifications
    maxBlocks?: number              // default from config
    sessionMinutes?: number         // target session length
    focusTopicIds?: TopicId[]       // optional: restrict to these topics
    excludeBlockTypes?: BlockType[] // optional: skip these types
  }
): Promise<StudyBlock[]>

// Get the full review queue for a learner (all pending reviews)
function getReviewQueue(
  learnerId: LearnerId
): Promise<Array<{
  topicId: TopicId
  topicName: string
  reason: ReviewReason
  priority: number
  dueAt: Date
}>>

// Rebuild the weekly plan for a learner
function buildWeeklyPlan(
  learnerId: LearnerId,
  weekStart: Date,
  options?: {
    dailyMinutes?: number           // override preference
    examDates?: Array<{ qualificationVersionId: string; date: Date }>
  }
): Promise<{ planId: string; blocks: StudyBlock[] }>
```

**Dependencies:** reads from `learner_qualifications`, `learner_topic_state`, `review_queue`, `topics`, `task_rules`, `learner_preferences`, `study_plans`, `assignments`.

**Owns:** writes to `study_plans`, `study_blocks`, `review_queue`.

---

### Mastery engine (`src/engine/mastery.ts`)

Updates learner state after a study block attempt.

```typescript
// Process the outcome of a completed block attempt
function processAttemptOutcome(
  attempt: AttemptOutcome
): Promise<{
  masteryUpdate: { topicId: TopicId; before: number; after: number }
  nextReviewAt: Date
  newEaseFactor: number
  misconceptionEvents: Array<{ id: string }>
  confidenceEvent: { id: string } | null
  retentionEvent: { id: string } | null
  memoryCandidatesUpdated: number
}>

// Initialise topic state for a learner starting a new qualification
function initTopicStates(
  learnerId: LearnerId,
  qualificationVersionId: QualificationVersionId
): Promise<{ topicsCreated: number }>

// Run a diagnostic assessment result through the mastery model
function processDiagnosticResult(
  learnerId: LearnerId,
  results: Array<{
    topicId: TopicId
    score: number          // 0-1
    confidence: number     // 0-1
  }>
): Promise<{ topicsUpdated: number }>
```

**Dependencies:** reads from `learner_topic_state`, `misconception_rules`, `memory_candidates`.

**Owns:** writes to `learner_topic_state`, `learner_component_state`, `misconception_events`, `confidence_events`, `retention_events`, `memory_candidates`, `memory_confirmed`.

---

### Ingestion pipeline (`src/engine/ingestion.ts`)

Processes uploaded files into searchable, topic-mapped chunks.

```typescript
// Process a single uploaded file (called by Inngest)
function processFile(
  fileId: string
): Promise<{
  chunksCreated: number
  embeddingsCreated: number
  mappingsCreated: number
  topicsCovered: TopicId[]
}>

// Retrieve relevant chunks for a learner + topic combination
function retrieveChunks(
  learnerId: LearnerId,
  query: string,
  options?: {
    topicIds?: TopicId[]        // filter to specific topics
    limit?: number              // default 5
    minConfidence?: number      // minimum mapping confidence, default 0.5
    scopes?: ScopeType[]        // override default scope resolution
  }
): Promise<RetrievalResult[]>

// Check source coverage for a qualification version
function getCoverageReport(
  learnerId: LearnerId,
  qualificationVersionId: QualificationVersionId
): Promise<Array<{
  topicId: TopicId
  topicName: string
  chunkCount: number
  avgConfidence: number
  hasSources: boolean
}>>
```

**Dependencies:** reads from `source_files`, `source_collections`, `source_permissions`, `topics`, `chunk_embeddings`. Uses Claude API for classification, Voyage AI for embeddings, Cloud Storage for file access.

**Owns:** writes to `source_chunks`, `chunk_embeddings`, `source_mappings`. Updates `source_files.status`.

---

### Session runner (`src/engine/session.ts`)

Executes a study block as an interactive AI session. Conversation state is managed client-side — the client sends the full message history with each request. This keeps Cloud Run stateless.

```typescript
// Start a new study session for a block
function startSession(
  block: StudyBlock,
  learnerContext: {
    masteryLevel: number
    knownMisconceptions: string[]
    confirmedMemory: Array<{ category: string; content: string }>
    preferences: Record<string, unknown>
    policies: PolicyValue[]
  }
): Promise<{
  sessionId: SessionId
  systemPrompt: string          // Full system prompt (stored client-side for subsequent calls)
  initialMessage: string        // First message to show the learner
  sourceChunks: RetrievalResult[]  // Source material used (for citation display)
}>

// Process a learner's response and get the next interaction
// Client sends full conversation history — no server-side session state
function continueSession(
  sessionId: SessionId,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  systemPrompt: string
): Promise<{
  reply: string                  // Claude's response (streamed in practice)
  isComplete: boolean            // Is the block finished?
  partialOutcome?: Partial<AttemptOutcome>  // Updated as session progresses
}>

// End a session and produce the final outcome
function endSession(
  sessionId: SessionId,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  systemPrompt: string,
  reason: 'completed' | 'abandoned' | 'timeout'
): Promise<{
  outcome: AttemptOutcome
  summary: string               // AI-generated session summary
}>
```

**Dependencies:** reads from `topics`, `qualification_versions`, `command_words`, `question_types`, `misconception_rules`, `policies`. Uses Claude API for generation. Calls `ingestion.retrieveChunks` for source material.

**Owns:** writes to `block_attempts`, `study_sessions`. After session ends, calls `mastery.processAttemptOutcome`.

---

### Policy resolver (`src/engine/policies.ts`)

Resolves the effective policy for a given context by walking up the scope hierarchy.

```typescript
// Resolve a single policy key for a learner
function resolvePolicy(
  learnerId: LearnerId,
  key: string
): Promise<PolicyValue | null>

// Resolve all policies that apply to a learner (merged, most specific wins)
function resolveAllPolicies(
  learnerId: LearnerId
): Promise<PolicyValue[]>

// Resolution order: learner → class → org → qualification → global
// Most specific scope wins. Returns null if no policy is set at any level.
```

**Dependencies:** reads from `policies`, `learner_qualifications`, `enrollments`, `memberships`.

**Owns:** reads only, no writes.

---

### Reporting engine (`src/engine/reporting.ts`)

Generates reports and detects flags. `generateWeeklyReport` and `sendWeeklyReport` are called per-learner by the fan-out pattern (`reporting/weekly-report-trigger` emits one event per learner, `reporting/weekly-report-generate` handles each), not in bulk.

```typescript
// Generate a weekly report for a single learner (called per-learner by fan-out)
function generateWeeklyReport(
  learnerId: LearnerId,
  periodStart: Date,
  periodEnd: Date
): Promise<WeeklyReportData>

// Detect safety/engagement flags for a learner
function detectFlags(
  learnerId: LearnerId,
  lookbackDays?: number         // default 7
): Promise<Array<{
  type: string
  description: string
  severity: 'low' | 'medium' | 'high'
  evidence: Record<string, unknown>
}>>

// Send a weekly report to relevant recipients for a single learner (called per-learner by fan-out)
function sendWeeklyReport(
  reportId: string
): Promise<{
  sentTo: Array<{ userId: string; channel: string }>
}>

// Generate a teacher/tutor insight view for a learner
function generateTeacherInsight(
  learnerId: LearnerId,
  requestedByUserId: UserId
): Promise<{
  summary: string
  strengths: string[]
  concerns: string[]
  recommendations: string[]
  topicBreakdown: TopicMastery[]
}>
```

**Dependencies:** reads from `study_sessions`, `learner_topic_state`, `block_attempts`, `misconception_events`, `confidence_events`, `guardian_links`, `weekly_reports`. Uses Claude API for summary generation. Uses Resend for email.

**Owns:** writes to `weekly_reports`, `safety_flags`, `notification_events`.

---

### Curriculum loader (`src/engine/curriculum.ts`)

Manages qualification reference data.

```typescript
// Load a full qualification structure from a seed file
function loadQualification(
  seedData: QualificationSeed
): Promise<{
  qualificationVersionId: string
  topicsCreated: number
  componentsCreated: number
  edgesCreated: number
}>

// Get the topic tree for a qualification version
function getTopicTree(
  qualificationVersionId: QualificationVersionId
): Promise<TopicTreeNode[]>
```

**Implementation note:** `getTopicTree` must use a recursive CTE (Common Table Expression) to load the full topic tree in a single query. Do NOT use iterative parent→children fetching, which causes N+1 queries. Example pattern:

```sql
WITH RECURSIVE topic_tree AS (
  SELECT *, 0 as tree_depth FROM topics WHERE qualification_version_id = $1 AND parent_topic_id IS NULL
  UNION ALL
  SELECT t.*, tt.tree_depth + 1 FROM topics t JOIN topic_tree tt ON t.parent_topic_id = tt.id
)
SELECT * FROM topic_tree ORDER BY tree_depth, sort_order
```

Then assemble the tree in application code from the flat result.

```typescript
interface TopicTreeNode {
  id: TopicId
  name: string
  code: string | null
  depth: number
  children: TopicTreeNode[]
  edges: Array<{
    toTopicId: TopicId
    edgeType: 'prerequisite' | 'builds_on' | 'related'
  }>
}

// Seed file format
interface QualificationSeed {
  subject: { name: string; slug: string }
  examBoard: { name: string; code: string }
  level: string
  versionCode: string
  firstExamYear: number
  specUrl?: string
  components: Array<{
    name: string
    code: string
    weightPercent: number
    durationMinutes?: number
    totalMarks?: number
    isExam: boolean
  }>
  topics: Array<{
    name: string
    code?: string
    estimatedHours?: number
    description?: string
    children?: Array</* recursive */>
    edges?: Array<{ toCode: string; type: 'prerequisite' | 'builds_on' | 'related' }>
  }>
  commandWords: Array<{
    word: string
    definition: string
    expectedDepth: number
  }>
  questionTypes: Array<{
    name: string
    description?: string
    typicalMarks?: number
    markSchemePattern?: string
  }>
  misconceptionRules?: Array<{
    topicCode: string
    description: string
    triggerPatterns: string[]
    correctionGuidance: string
    severity?: number
  }>
}
```

**Dependencies:** reads from `exam_boards`, `subjects`, `qualifications`.

**Owns:** writes to `exam_boards`, `subjects`, `qualifications`, `qualification_versions`, `assessment_components`, `topics`, `topic_edges`, `question_types`, `command_words`, `misconception_rules`, `task_rules`.

---

## Data access patterns

### Scoped queries

Every query that touches user-owned data must be scoped. The pattern:

```typescript
// Helper: resolve which source scopes a learner can access
function resolveScopes(
  learnerId: LearnerId
): Promise<Array<{ scope: ScopeType; ownerId: string }>>

// Example: get all source chunks visible to a learner for a topic
// This filters by: learner's private + household + class + org + system sources
// AND source_mapping.topic_id matches
// AND source_mapping.confidence >= threshold
```

### Transaction boundaries

| Operation | Transaction scope |
|-----------|------------------|
| Process attempt outcome | Single tx: update mastery + create events + update review queue |
| Ingest file | Per-step: chunks in one tx, embeddings in one tx, mappings in one tx (retryable) |
| Generate weekly report | Single tx: create report + create notifications + create safety flags |
| Load qualification | Single tx: all reference data for one qualification version |

### Shared test utilities (`src/test/`)

All engine modules test against a real Postgres database (via docker-compose). To prevent 5 parallel agents from inventing incompatible test setups, shared test utilities are provided:

```typescript
// src/test/setup.ts
// Connects to test database, runs migrations, provides cleanup

// src/test/fixtures.ts
// Factory functions for creating test data
function createTestOrg(overrides?: Partial<Organization>): Promise<Organization>
function createTestUser(overrides?: Partial<User>): Promise<User>
function createTestLearner(orgId: OrgId, overrides?: Partial<Learner>): Promise<Learner>
function createTestQualification(): Promise<{ qualificationVersionId: QualificationVersionId; topics: Topic[] }>
function seedGCSEBiology(): Promise<{ qualificationVersionId: QualificationVersionId; topics: Topic[] }>

// src/test/seed.ts
// Loads the GCSE Biology AQA seed for integration tests
```

All Phase 1 agents must use these shared fixtures. Do not create per-module test setup.

---

## API routes

### Student-facing

| Method | Path | Handler | Notes |
|--------|------|---------|-------|
| GET | `/api/dashboard` | Get today's queue, stats, active plan | |
| GET | `/api/topics` | Get topic tree for enrolled qualifications | |
| GET | `/api/blocks/next` | Get next study blocks | Calls scheduler |
| POST | `/api/sessions/start` | Start a study session | Calls session runner |
| POST | `/api/sessions/:id/message` | Send message in session | Streaming response |
| POST | `/api/sessions/:id/end` | End a session | |
| POST | `/api/sources/upload` | Upload a file | Returns file ID, triggers Inngest |
| GET | `/api/sources` | List source collections + files | |
| GET | `/api/mastery` | Get mastery overview | |
| GET | `/api/reports` | Get past weekly reports | |

### Parent-facing

| Method | Path | Handler | Notes |
|--------|------|---------|-------|
| GET | `/api/parent/learners` | List linked learners | |
| GET | `/api/parent/learners/:id/report` | Latest report for a learner | |
| GET | `/api/parent/learners/:id/mastery` | Mastery overview | |
| GET | `/api/parent/learners/:id/flags` | Active safety flags | |

### Admin (future, B2B)

| Method | Path | Handler | Notes |
|--------|------|---------|-------|
| GET | `/api/admin/classes` | List classes | |
| GET | `/api/admin/classes/:id/learners` | Learners in a class | |
| POST | `/api/admin/classes` | Create a class | |
| GET | `/api/admin/reports` | Org-wide reporting | |

### Webhooks

| Path | Source | Purpose |
|------|--------|---------|
| `/api/auth/session` | Firebase Auth | Session cookie management |
| `/api/inngest` | Inngest | Background job dispatch |

---

## Inngest functions

| Function | Trigger | What it does |
|----------|---------|--------------|
| `ingestion/process-file` | Event: `source.file.uploaded` | Full ingestion pipeline for one file |
| `reporting/weekly-report-trigger` | Cron: Sunday 18:00 UTC | Query all active learners, emit one `report.generate` event per learner |
| `reporting/weekly-report-generate` | Event: `report.generate` | Generate + send report for a single learner (fan-out from trigger) |
| `reporting/detect-flags` | Cron: daily 06:00 UTC | Scan for safety/engagement flags |
| `scheduling/rebuild-plans` | Cron: Monday 00:00 UTC | Rebuild weekly plans for all active learners |
| `scheduling/update-queue` | Event: `attempt.completed` | Update review queue after an attempt |
| `mastery/decay-check` | Cron: daily 00:00 UTC | Flag topics with overdue reviews |

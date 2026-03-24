# Phase 4+ Plan: Claude Code for Students

This plan extends the original `PLAN.md` (Phases 0-3) with Phases 4-7.

See the design doc for the full product vision: the goal is a system where the AI has a complete mental model of the student's understanding, not just a quiz engine.

## Design Principles

1. **The system and the AI are equal partners.** The system assembles rich context (mastery, history, spec, what's worked, what hasn't) and serves it on a platter to the AI. The AI uses that context to be brilliant in the moment.
2. **Proactive, not reactive.** Swotta doesn't wait for the student to open the app. It reaches out when they're slipping, plans their week, and shifts tone as exams approach.
3. **The parent sees what no school report shows.** Behavioural patterns, confidence calibration, misconception narratives, technique mastery — not just "your child studied 3 hours."
4. **Grounded on the qualification spec.** Every session, every question, every piece of feedback is anchored to the actual AQA/OCR/Edexcel specification, command words, and mark scheme structure.

---

## Phase 4: Integration + Auth (sequential)

Must happen first. Everything else depends on auth and the integration fixes.

### Task 4.1: Firebase Auth + Route Protection

Files you own:
- `src/lib/auth.ts` (Firebase Admin SDK integration)
- `src/lib/auth-client.ts` (Firebase client SDK)
- `src/app/(auth)/login/page.tsx`
- `src/app/(auth)/signup/page.tsx`
- `src/middleware.ts` (route protection)
- `src/app/api/auth/` (session management routes)

Acceptance criteria:
- [ ] Firebase Auth configured with Google Sign-In provider
- [ ] Sign-up flow creates user record in DB with `firebase_uid`
- [ ] Sign-up creates a household organization and membership automatically
- [ ] Login flow validates Firebase token and establishes session
- [ ] All `(student)` routes require authenticated learner role
- [ ] All `(parent)` routes require authenticated guardian role
- [ ] Guardian linking flow: parent signs up, links to learner via invite code
- [ ] Middleware redirects unauthenticated users to login
- [ ] All API routes validate Firebase token and scope queries by user/org
- [ ] 100% test coverage, mock Firebase Admin SDK in tests

### Task 4.2: Close Integration TODOs

Files you own:
- `src/engine/session.ts` (wire mastery.processAttemptOutcome)
- `src/engine/scheduler.ts` (idempotency guard, task_rules integration)
- `src/test/seed.ts` (reconcile with curriculum loader)
- `inngest/functions/` (wire Inngest function wrappers to engine functions)

Acceptance criteria:
- [ ] `endSession` calls `mastery.processAttemptOutcome` after DB transaction
- [ ] `getNextBlocks` checks for existing pending blocks before creating new ones
- [ ] `selectBlockType` reads from `task_rules` table, falls back to heuristic
- [ ] Test seed uses `loadQualification` from curriculum engine
- [ ] Inngest functions (`update-queue`, `rebuild-plans`, `decay-check`) wired to engine functions
- [ ] All 6 TODOS.md items resolved
- [ ] 100% test coverage

### Task 4.3: GCP Deployment (Real Credentials)

Files you own:
- `terraform/` (update with real project ID, service account)
- `.github/workflows/deploy.yml` (add secrets)
- Firebase project configuration

Acceptance criteria:
- [ ] Cloud Run service deployed to europe-west2 with real credentials
- [ ] Cloud SQL instance provisioned with pgvector
- [ ] Cloud Storage bucket created for file uploads
- [ ] Firebase Auth project configured with Google Sign-In
- [ ] Secrets in Google Secret Manager
- [ ] CI/CD pipeline green: lint + typecheck + test on PR, deploy on merge to main
- [ ] App accessible at a real URL
- [ ] Health check endpoint returns 200

---

## Phase 5: Intelligence Layer (parallel)

Each task owns its own files. All tasks import from the shared schema and types. No cross-task file dependencies.

### Task 5.1: Memory System

Files you own:
- `src/engine/memory.ts`
- `src/engine/memory.test.ts`

Interface contract:
```typescript
// Promote candidates with enough evidence to confirmed memory
promoteCandidates(db: Database, learnerId: LearnerId): Promise<number>

// Infer preferences from behavioural patterns
inferPreferences(db: Database, learnerId: LearnerId): Promise<LearnerPreference[]>

// Assemble the full LearnerContext for a study session
assembleLearnerContext(db: Database, learnerId: LearnerId, topicId: TopicId): Promise<LearnerContext>
```

Acceptance criteria:
- [ ] `promoteCandidates` moves memory_candidates to memory_confirmed when evidence_count >= threshold
- [ ] `inferPreferences` detects: preferred session length, preferred time of day, preferred block types, learning pace
- [ ] `assembleLearnerContext` populates ALL fields: masteryLevel, knownMisconceptions, confirmedMemory, preferences, policies
- [ ] LearnerContext returned by assembleLearnerContext is used by session runner (integration point)
- [ ] 100% test coverage

### Task 5.2: Diagnostic Conversation

Files you own:
- `src/engine/diagnostic.ts`
- `src/engine/diagnostic.test.ts`
- `src/ai/prompts/diagnostic.md`
- `src/app/(student)/diagnostic/page.tsx`
- `src/app/api/diagnostic/route.ts`

Acceptance criteria:
- [ ] 10-15 minute conversational diagnostic on first subject setup
- [ ] AI asks about each major topic area in the qualification
- [ ] Student responses analysed to seed initial mastery levels (not binary — graded 0-1)
- [ ] Topics the student explains well start at higher mastery
- [ ] Topics they struggle to articulate start low
- [ ] Topics not mentioned start at zero
- [ ] Results written to `learner_topic_state`
- [ ] UI: chat-style interface with progress indicator ("4 of 8 topics explored")
- [ ] Can be skipped (all topics start at zero) but prompted strongly
- [ ] 100% test coverage, mock Claude API

### Task 5.3: Confidence Calibration

Files you own:
- `src/engine/calibration.ts`
- `src/engine/calibration.test.ts`

Interface contract:
```typescript
// Calculate calibration score: how accurate is the student's self-assessment?
calculateCalibration(db: Database, learnerId: LearnerId, topicId?: TopicId): Promise<CalibrationResult>

// Returns: { overconfident: boolean, underconfident: boolean, calibrationScore: number, message: string }
```

Acceptance criteria:
- [ ] Compares confidence_before/confidence_after against actual performance scores
- [ ] Per-topic calibration: "underconfident on genetics, overconfident on ecology"
- [ ] Overall calibration trend: improving, stable, or declining
- [ ] Generates human-readable feedback: "You rated yourself 2/5 but scored 80%+ three sessions in a row"
- [ ] Feeds into parent report enrichment (structured data, not just text)
- [ ] 100% test coverage

### Task 5.4: Behavioural Pattern Detection

Files you own:
- `src/engine/behaviour.ts`
- `src/engine/behaviour.test.ts`

Interface contract:
```typescript
// Detect behavioural patterns from session history
detectPatterns(db: Database, learnerId: LearnerId): Promise<BehaviourReport>

// Returns: { avoidedTopics, engagementTrend, peakHours, overRelianceSignals, safetyFlags }
```

Acceptance criteria:
- [ ] **Topic avoidance:** detects topics scheduled 3+ times but skipped/abandoned
- [ ] **Engagement decline:** sessions getting shorter, gaps getting longer, confidence dropping
- [ ] **Time-of-day patterns:** identifies peak performance hours from historical data
- [ ] **Over-reliance signals:** requesting hints before attempting, never attempting without help
- [ ] **Safety flag triggers:** writes to `safety_flags` table when patterns indicate distress/disengagement
- [ ] Avoidance detection produces gentle re-introduction strategy (not just "do the thing you're avoiding")
- [ ] 100% test coverage

### Task 5.5: Exam Proximity Engine

Files you own:
- `src/engine/proximity.ts`
- `src/engine/proximity.test.ts`

Interface contract:
```typescript
// Determine current exam phase and scheduling adjustments
getExamPhase(db: Database, learnerId: LearnerId, qualVersionId: QualificationVersionId): Promise<ExamPhase>

// Returns: { phase: 'exploration'|'consolidation'|'revision'|'confidence', weeksToExam, schedulerWeights, toneModifiers }
```

Acceptance criteria:
- [ ] **Exploration (8+ weeks):** new topics, understanding depth, longer sessions, essay practice
- [ ] **Consolidation (4-8 weeks):** no new topics unless critical, strengthen weak areas, increase retrieval drills, start timed practice
- [ ] **Revision (1-4 weeks):** pure retrieval + confidence calibration, shorter more frequent sessions, prioritise by exam weight x weakness
- [ ] **Confidence (final week):** only strong topics, short sessions, positive reinforcement, anxiety detection
- [ ] Scheduler reads exam phase and adjusts block type selection + topic priority
- [ ] Prompt tone modifiers per phase (encouraging → focused → reassuring)
- [ ] Post-exam summary generation: sessions completed, misconceptions conquered, spec coverage %
- [ ] 100% test coverage

### Task 5.6: Command Word & Exam Technique Coaching

Files you own:
- `src/engine/technique.ts`
- `src/engine/technique.test.ts`
- Updates to `src/ai/prompts/*.md` (add command word sections)

Interface contract:
```typescript
// Get technique mastery for a learner
getTechniqueMastery(db: Database, learnerId: LearnerId): Promise<TechniqueMastery[]>

// Returns per command word: { commandWord, questionsAttempted, avgScore, trend }
```

Acceptance criteria:
- [ ] Prompts include command word definitions and mark scheme structure when generating questions
- [ ] "This says 'evaluate' — that means weigh up both sides and reach a judgement"
- [ ] Track technique mastery per command word (separate from topic mastery)
- [ ] Mark scheme coaching: "A 4-mark 'explain' question wants 2 points, each with a reason"
- [ ] Timed practice awareness: "You have 5 minutes for this 6-mark question"
- [ ] Technique mastery feeds into parent reports and student dashboard
- [ ] 100% test coverage

---

## Phase 6: Communication Layer (parallel)

Depends on Phase 5 for data (memory, calibration, behaviour, proximity).

### Task 6.1: Proactive Notification Engine

Files you own:
- `src/engine/notifications.ts`
- `src/engine/notifications.test.ts`
- `inngest/functions/send-notifications.ts`
- `src/app/api/notifications/route.ts`

Acceptance criteria:
- [ ] **Student nudges:** "You haven't studied Biology since Thursday. 20 minutes tonight stops genetics from slipping."
- [ ] **Decay alerts:** triggered when learner_topic_state mastery drops below threshold
- [ ] **Exam proximity escalation:** notification frequency increases as exam approaches
- [ ] **Parent alerts:** "Michael hasn't studied since Thursday. Genetics is slipping."
- [ ] Channels: email (Resend) + in-app notification (notification_events table)
- [ ] Push notifications deferred (requires mobile app — add to TODOS.md)
- [ ] Notification preferences respected (learner_preferences)
- [ ] Rate limiting: max 1 student nudge per day, max 1 parent alert per day
- [ ] Inngest cron: daily check for nudge/alert triggers
- [ ] 100% test coverage

### Task 6.2: Student Weekly Email

Files you own:
- `src/email/templates/student-weekly.tsx`
- `src/email/templates/student-weekly.test.ts`
- `inngest/functions/student-weekly-trigger.ts`

Acceptance criteria:
- [ ] Monday morning email to the student
- [ ] Contents: this week's plan (sessions, topics, block types), time estimate, streak, exam countdown
- [ ] Personalised tone adjusted by exam phase (encouraging early, focused later, reassuring final week)
- [ ] "You've got this, Michael" — uses first name
- [ ] Follows DESIGN.md email aesthetics
- [ ] Inngest cron: Monday 07:00 UK time
- [ ] 100% test coverage

### Task 6.3: Session Replay Summaries

Files you own:
- `src/engine/replay.ts`
- `src/engine/replay.test.ts`
- `src/components/session/replay-card.tsx`
- `src/app/api/session/[id]/share/route.ts`

Acceptance criteria:
- [ ] Post-session summary: what you covered, what you nailed, what tripped you up, what's next
- [ ] Includes confidence calibration feedback if applicable ("you know more than you think")
- [ ] Shareable: generates a link parent/tutor can view without authentication
- [ ] Share link expires after 30 days
- [ ] Summary card component for dashboard (recent sessions list)
- [ ] 100% test coverage

### Task 6.4: Enhanced Parent Reports

Files you own:
- `src/engine/reporting.ts` (extend existing — coordinate with current module)
- `src/email/templates/weekly-report.tsx` (extend existing)

Acceptance criteria:
- [ ] Includes behavioural patterns: topic avoidance, engagement trends
- [ ] Includes confidence calibration: "Michael consistently underestimates himself on genetics"
- [ ] Includes misconception narrative: "Recurring confusion between osmosis and diffusion — targeted in 3 sessions, now resolved"
- [ ] Includes technique mastery: "Strong on 'describe' and 'explain' questions, needs practice on 'evaluate'"
- [ ] Includes exam phase context: "We're in consolidation mode — focusing on strengthening weak areas"
- [ ] Actionable: "He's been avoiding ecology. A conversation about what's difficult could help."
- [ ] 100% test coverage

---

## Phase 7: Student Experience (parallel)

Depends on Phases 5+6 for data and components.

### Task 7.1: Diagnostic Conversation UI

Files you own:
- `src/app/(student)/diagnostic/page.tsx` (if not fully built in 5.2)
- `src/components/diagnostic/` (chat interface, topic progress, mastery reveal)

Acceptance criteria:
- [ ] Chat-style interface for the diagnostic conversation
- [ ] Progress indicator: "Exploring topic 4 of 8"
- [ ] Mastery map reveal at the end: visual showing strong/weak/unknown topics
- [ ] "Here's your personalised plan" transition to dashboard
- [ ] Skip option with clear explanation of what they miss
- [ ] Follows DESIGN.md: warm cream, teal primary, Instrument Serif headlines
- [ ] 100% test coverage

### Task 7.2: Misconception Timeline & Learning Journey

Files you own:
- `src/app/(student)/journey/page.tsx`
- `src/components/journey/` (timeline, misconception card, milestone)

Acceptance criteria:
- [ ] Visual timeline showing learning events: misconceptions identified, corrected, conquered
- [ ] "Conquered" vs "Active" misconception grouping
- [ ] Per-misconception detail: when first seen, how many correction sessions, when resolved
- [ ] Milestone celebrations: "You conquered osmosis vs diffusion confusion!"
- [ ] Overall journey stats: sessions completed, misconceptions conquered, spec coverage
- [ ] Post-exam summary view (triggered by exam proximity engine phase = post-exam)
- [ ] Follows DESIGN.md
- [ ] 100% test coverage

### Task 7.3: Confidence + Technique Dashboard

Files you own:
- `src/components/dashboard/calibration-card.tsx`
- `src/components/dashboard/technique-card.tsx`
- `src/components/dashboard/phase-indicator.tsx`

Acceptance criteria:
- [ ] Calibration feedback card: "You know more about genetics than you think — your scores are consistently higher than your self-rating"
- [ ] Technique mastery view: per command word, score trend, weakest technique highlighted
- [ ] Exam phase indicator: visual showing current phase + weeks to exam
- [ ] "What should I study?" zero-tap card: big button with next recommended session
- [ ] Streak + exam countdown: "12 days in a row. 34 days to exam."
- [ ] Follows DESIGN.md
- [ ] 100% test coverage

---

## Dependency Graph

```
Phase 4 (Integration + Auth) ─── sequential
  ├── 4.1 Firebase Auth
  ├── 4.2 Close TODOs (depends on 4.1 for auth context)
  └── 4.3 GCP Deploy (depends on 4.1 for Firebase config)
        │
        ▼
Phase 5 (Intelligence) ─── all 6 tasks in parallel
  ├── 5.1 Memory system
  ├── 5.2 Diagnostic conversation
  ├── 5.3 Confidence calibration
  ├── 5.4 Behavioural detection
  ├── 5.5 Exam proximity engine
  └── 5.6 Command word coaching
        │
        ▼
Phase 6 (Communication) ─── all 4 tasks in parallel
  ├── 6.1 Proactive notifications
  ├── 6.2 Student weekly email
  ├── 6.3 Session replay summaries
  └── 6.4 Enhanced parent reports
        │
        ▼
Phase 7 (Student Experience) ─── all 3 tasks in parallel
  ├── 7.1 Diagnostic conversation UI
  ├── 7.2 Misconception timeline + journey
  └── 7.3 Confidence + technique dashboard
```


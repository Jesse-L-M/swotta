# Learner Memory Model

This document specifies the seven types of memory Swotta maintains per learner, how each is captured, stored, and used.

The core claim: an AI tutor given rich, structured context about a learner's knowledge state produces fundamentally different interactions than one given a curriculum prompt and a chat history. This memory model is what makes that possible.

---

## 1. Semantic memory: what the learner knows

The curriculum graph (topics, prerequisite edges, command words, mark scheme patterns) combined with per-topic mastery state.

**Schema:** `learner_topic_state` (one row per learner per topic)

| Signal | Column | Range |
|--------|--------|-------|
| Mastery level | `mastery_level` | 0.000 - 1.000 |
| Self-rated confidence | `confidence` | 0.000 - 1.000 |
| SM-2 ease factor | `ease_factor` | 1.30+ (default 2.50) |
| Review interval | `interval_days` | Days until next review |
| Next review date | `next_review_at` | Timestamp |
| Consecutive successes | `streak` | Integer |

Also: `learner_component_state` tracks predicted grades per assessment component (Paper 1, Paper 2, coursework).

**Used by:** scheduler (what to study next), session runner (difficulty calibration), reporting engine (mastery deltas), parent reports.

---

## 2. Episodic memory: what happened in each session

Every study session produces structured outcomes — not just "the student studied biology for 20 minutes."

**Schema:** `study_sessions`, `block_attempts`

Each block attempt captures:
- Score (percentage)
- Confidence before and after the attempt
- Whether help was requested, and whether before or after attempting
- Count of misconceptions detected
- AI-generated notes on the attempt
- Duration

Conversation history is **not** stored server-side. The client sends the full message array with each request; Cloud Run stays stateless. Only the structured outcomes and session summary are persisted.

**Used by:** mastery engine (state updates), behaviour analysis (patterns across sessions), reporting engine (weekly aggregation), memory candidate generation.

---

## 3. Metacognitive memory: confidence calibration

Tracks the gap between what a learner thinks they know and what they actually know, per topic, over time.

**Schema:** `confidence_events`

| Signal | Column | Notes |
|--------|--------|-------|
| Self-rated | `self_rated` | 0-1, what the learner predicted |
| Actual | `actual` | 0-1, how they performed |
| Delta | `delta` | self_rated - actual (positive = overconfident) |

Persistent overconfidence on a topic is a stronger signal than a low mastery score. A student who knows they don't understand cell division will study it. A student who thinks they understand it but doesn't — that's who fails exams.

**Used by:** scheduler (prioritise miscalibrated topics), session runner (challenge overconfident learners more), parent reports ("consistently underestimates himself on genetics"), behaviour analysis.

---

## 4. Misconception memory: recurring error patterns

Specific mistakes, linked to topics and optionally to predefined misconception rules from the qualification specification.

**Schema:** `misconception_events`, `misconception_rules`

Each event records:
- The misconception description ("confuses osmosis with active transport")
- Severity (1-3)
- Whether it's resolved
- Link to the topic and optionally to a known misconception rule (with trigger patterns and correction guidance)

Misconception rules are seeded from the qualification specification. Novel misconceptions (not matching a known rule) are also captured.

**Used by:** session runner (targeted correction), scheduler (schedule mistake-review blocks), parent reports ("recurring confusion between mitosis and meiosis — targeted across 3 sessions, now resolved"), weekly review (cluster detection).

---

## 5. Behavioural memory: patterns of engagement

Inferred from session data. Not self-reported.

**Tracked patterns:**

| Pattern | How detected |
|---------|-------------|
| Topic avoidance | Topics consistently skipped or abandoned mid-session |
| Disengagement | Declining session frequency, shorter sessions, lower mood ratings |
| Study gaps | Periods with no activity |
| Help-seeking patterns | Help requested before attempting vs after attempting |
| Time-of-day preferences | When sessions tend to happen and succeed |
| Overreliance on hints | Help requested on the majority of questions |

**Schema:** Derived from `study_sessions`, `block_attempts`, `safety_flags`

Safety flags (`disengagement`, `avoidance`, `distress`, `overreliance`) are generated during weekly review and can trigger guardian/teacher notifications.

**Used by:** scheduler (avoidance detection overrides normal priority), reporting engine (behavioural narratives), notification system (safety alerts), session type selection (reentry blocks after study gaps).

---

## 6. Source memory: the learner's own materials

Students upload their own revision notes, class handouts, and past papers. These are chunked, embedded, mapped to the curriculum graph, and scoped by access level.

**Schema:** `source_collections`, `source_files`, `source_chunks`, `chunk_embeddings`, `source_mappings`

The pipeline:
1. Upload to Cloud Storage
2. Text extraction (PDF, DOCX, images via Claude vision)
3. Semantic chunking (~500 tokens)
4. Voyage AI embeddings (1024d) stored in pgvector
5. Claude classifies each chunk against the topic graph with confidence scores
6. Source mappings link chunks to topics and assessment components

**Scoping:** Five visibility levels (private, household, class, org, system). Retrieval queries always filter by scope. A learner sees their own sources, their household's, their class's, their school's, and system materials. Never another learner's private sources.

**Used by:** session runner (retrieves relevant chunks via vector similarity, scoped to accessible sources), reporting engine (source coverage analysis).

---

## 7. Policy memory: constraints and accommodations

Not "memory" in the cognitive science sense, but functionally equivalent: persistent context that shapes every interaction.

**Schema:** `policies`, `learner_preferences`

Policies resolve through five layers:
1. **Global** — safety rules, content boundaries (applied to all learners)
2. **Qualification** — subject-specific rules, mark scheme conventions
3. **Organisation** — school rules ("no AI-generated essays")
4. **Class** — teacher preferences ("focus on Paper 2 topics this term")
5. **Learner** — individual accommodations, preferences

Most-specific-wins semantics. A learner-level policy overrides a class-level policy on the same key.

Learner preferences are stored separately with a `source` field: `stated` (explicitly set), `inferred` (observed), or `guardian_set`. Inferred preferences follow the candidate/confirmed lifecycle.

**Used by:** session runner (respect constraints), scheduler (honour focus areas), all AI calls (policy context included in system prompt).

---

## The candidate/confirmed lifecycle

Patterns inferred from session data are not treated as ground truth. They enter as **candidates** with an evidence count.

**Schema:** `memory_candidates`, `memory_confirmed`

```
Observation in session
        |
        v
memory_candidate created (or evidence_count incremented)
        |
        |-- evidence_count crosses threshold --> auto-promoted
        |-- learner explicitly confirms       --> promoted
        |-- guardian/teacher confirms          --> promoted
        |
        v
memory_confirmed (used with high confidence in context assembly)
```

Categories include: `learning_style`, `misconception_pattern`, `time_preference`, `difficulty_preference`, `topic_affinity`, and others.

This matters because flat user profiles are either wrong (inferred too aggressively) or stale (never updated). The candidate/confirmed pattern makes the system's uncertainty about the learner explicit and actionable.

---

## How memory is assembled for a session

When a study session starts, the engine assembles context from all seven memory types:

1. **Semantic:** mastery level, ease factor, and review state for the session topic and its prerequisites
2. **Episodic:** recent session outcomes on this topic and related topics
3. **Metacognitive:** confidence calibration history (is this learner overconfident or underconfident here?)
4. **Misconception:** known misconceptions for this topic, both resolved and unresolved
5. **Behavioural:** any active flags, avoidance patterns, study gap context
6. **Source:** relevant chunks retrieved via pgvector similarity search, scoped to accessible sources
7. **Policy:** resolved constraints from all five policy layers

This assembled context is passed to Claude alongside the session mode prompt (retrieval drill, explanation, worked example, etc.). The AI doesn't need to infer the learner's state from conversation history — it receives it as structured data.

# Evaluation Plan

This document describes how Swotta's core claims can be measured. These are evaluations I intend to run, not results. The architecture is designed to make each of these testable.

---

## 1. Structured context vs blank context

**Hypothesis:** A study session with full learner memory (mastery state, misconception history, confidence calibration, retrieved sources, policy constraints) produces better interactions than the same Claude model with only a curriculum prompt.

**Method:** Run the same set of study scenarios through two paths:
- **Structured:** full context assembly (all 7 memory types)
- **Baseline:** curriculum topic description + session mode prompt only

**Metrics:**
- Relevance of questions to the learner's actual knowledge gaps
- Whether the AI references known misconceptions without being told about them in-session
- Whether difficulty calibration matches the learner's mastery level
- Whether source retrieval surfaces genuinely relevant material

**Status:** Architecture supports this (the session runner can be called with or without context). Need to define a fixed set of learner profiles and scenarios for reproducible comparison.

---

## 2. Next-study-block selection quality

**Hypothesis:** The scheduler's topic and block-type selection (factoring mastery, retention, exam proximity, behaviour, and source coverage) produces better study sequences than naive approaches.

**Method:** Compare against baselines:
- **Random:** random topic from enrolled qualification
- **Overdue-only:** purely spaced repetition (next-review-at ordering)
- **Swotta scheduler:** full signal integration

**Metrics:**
- Topic coverage over a simulated study period
- Whether high-priority gaps (low mastery + upcoming exam + high specification weight) are addressed earlier
- Whether the block type mix adapts appropriately as exam dates approach
- Whether avoidance-detected topics are surfaced despite the student not choosing them

**Status:** The scheduler is built and tested. Need to build a simulation harness that runs N weeks of scheduling decisions against synthetic learner profiles and measures the above.

---

## 3. Confidence calibration error

**Hypothesis:** Tracking and acting on confidence calibration (the gap between self-rated and actual performance) is higher-leverage than acting on mastery scores alone.

**Method:** Analyse `confidence_events` over time per learner:
- Compute mean calibration error per topic (|self_rated - actual|)
- Track whether calibration error decreases after targeted sessions
- Compare outcomes for learners whose study plans prioritise miscalibrated topics vs those prioritised by mastery score alone

**Metrics:**
- Calibration error trend (should decrease over time)
- Whether topic mastery improves faster when miscalibration is explicitly addressed
- Correlation between calibration accuracy and exam performance (if/when real exam data is available)

**Status:** Confidence events are captured in every block attempt. Analysis queries are straightforward. Need real usage data to run this.

---

## 4. Misconception retrieval accuracy

**Hypothesis:** The misconception memory (events + predefined rules) allows the system to surface relevant prior misconceptions during study sessions.

**Method:** For sessions where a learner has prior misconception events on the topic:
- Does the context assembly include the relevant misconceptions?
- Does the AI reference or address them during the session?
- Does the misconception get marked as resolved after targeted sessions?

**Metrics:**
- Misconception recall rate (% of relevant prior misconceptions included in session context)
- Resolution rate after targeted sessions
- Re-emergence rate (misconceptions marked resolved that reappear)

**Status:** Misconception events are tracked with resolution status. The session runner includes unresolved misconceptions in context. Need usage data to measure resolution and re-emergence.

---

## 5. Source grounding quality

**Hypothesis:** Retrieving chunks from the student's own materials (scoped by access level) produces more relevant and personalised session content than generic curriculum descriptions.

**Method:** For sessions where source material exists for the topic:
- Compare session quality with and without source retrieval
- Assess whether retrieved chunks are genuinely relevant to the session topic

**Metrics:**
- Retrieval precision: what fraction of retrieved chunks are relevant to the topic
- Whether sessions that use student sources produce higher engagement (session completion rate, mood ratings)
- Whether source-grounded sessions score higher on relevance in human evaluation

**Status:** Source retrieval is built. Relevance scoring would require human annotation of a sample set.

---

## 6. Candidate memory promotion accuracy

**Hypothesis:** The candidate/confirmed memory lifecycle produces accurate learner profiles — inferred patterns that are promoted based on evidence are generally correct.

**Method:** Track the lifecycle:
- How many candidates are generated per learner
- What fraction are eventually promoted (auto or explicit)
- Of promoted candidates, how many are later contradicted by new evidence
- What evidence threshold produces the best balance of accuracy and coverage

**Metrics:**
- Promotion rate (candidates promoted / candidates generated)
- Contradiction rate (promoted memories later invalidated)
- Time-to-promotion (how many sessions before a pattern is promotable)

**Status:** The candidate/confirmed schema exists. Need usage data to analyse the lifecycle.

---

## 7. Policy adherence

**Hypothesis:** The five-layer policy system correctly constrains AI behaviour without requiring per-session manual checks.

**Method:** Define a set of policy scenarios:
- Global: safety boundaries are respected
- Org: "no AI-generated essays" is enforced
- Class: "focus on Paper 2" adjusts scheduling
- Learner: individual accommodations are reflected in session content

**Metrics:**
- Policy violation rate (sessions that breach a resolved policy)
- Whether policy context in the prompt produces correct AI behaviour

**Status:** Policy resolution is built and tested. Compliance testing requires defining specific violation scenarios and checking AI output against them.

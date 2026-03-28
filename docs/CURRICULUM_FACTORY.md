# Curriculum Factory

This document defines how Swotta should move from one legacy seeded qualification to broad, repeatable GCSE and A-Level support.

The goal is not to hand-author every subject forever. The goal is to build a curriculum factory: a pipeline, review process, and toolchain that can repeatedly turn specification inputs into production-ready curriculum packages.

## Core principle

The existing curriculum seed data is useful, but it is not the quality bar.

- A legacy seed package is an input and a regression artifact.
- A reference package is a qualification rebuilt through the factory and signed off against the full quality bar.

Swotta should not call a qualification "supported" just because it has a JSON file and can be seeded.

## Package lifecycle

Every qualification package should be in one of four states:

1. `legacy`
   Existing package created before the factory existed. Useful for understanding current shape, testing compatibility, and bootstrapping extraction prompts.

2. `candidate`
   Machine-generated or machine-assisted package that has not yet passed review.

3. `approved`
   Reviewed package that passes validation and is acceptable for production seeding.

4. `reference`
   Gold-standard approved package used as the exemplar for future curriculum work. There should be very few of these.

The current GCSE Biology AQA package should be treated as `legacy` until rebuilt through this process.

## What "supported qualification" means

A qualification is only supported when all of the following are true:

- Qualification metadata is complete and correct.
- Assessment components are modeled accurately enough to drive scheduling and reporting.
- The topic hierarchy is complete and internally coherent.
- Prerequisite/builds-on/related edges are useful rather than decorative.
- Command words are captured and linked where relevant.
- Misconception rules exist at a useful level of specificity.
- Task rules and study-mode guidance exist at a useful level of specificity.
- Source mapping hints are strong enough for ingestion and retrieval to work well.
- Validation passes.
- Human review passes.
- Seeding is idempotent.
- Core curriculum queries and downstream product flows work against it.

If any of those are missing, the package may still be valuable, but it is not yet fully supported.

## Canonical package contents

Each qualification package should be able to produce or contain:

- Exam board metadata
- Subject metadata
- Qualification metadata
- Qualification version metadata
- Assessment components
- Topic tree
- Topic edges
- Command words
- Question types
- Misconception rules
- Task rules
- Source mapping hints
- Optional annotations for mark scheme patterns and exam technique

In practical terms, this should serialize to a stable package format that can be:

- validated locally
- diffed in code review
- seeded idempotently
- re-generated when specs change

## Input sources

The factory should be able to consume:

- official specification PDFs
- exam board summary docs
- teacher guidance docs
- past papers
- mark schemes
- examiner reports
- legacy Swotta seed packages

Not every source is equally authoritative.

Suggested precedence:

1. official specification
2. official mark scheme / examiner material
3. official support materials
4. legacy seed package
5. machine inference

## Factory pipeline

The intended pipeline is:

1. Ingest source documents
   Parse PDFs and other files into machine-usable text with document provenance preserved.

2. Extract structured draft
   Use deterministic parsers where possible and AI-assisted extraction where necessary.

3. Normalize
   Convert extracted output into the canonical Swotta package shape.

4. Validate
   Enforce structural, semantic, and completeness rules.

5. Review
   Human reviewer inspects the package diff, validation output, and rendered preview.

6. Approve
   Package is marked approved and eligible for production seeding.

7. Seed
   Idempotent import into the relational schema.

8. Regression check
   Verify that downstream queries, scheduler assumptions, and ingestion mappings still behave as expected.

## Validation layers

Validation should happen at multiple levels.

### 1. Structural validation

- required fields present
- IDs stable and unique
- enums valid
- dates/version metadata valid
- no duplicate codes/slugs/names where uniqueness is expected

### 2. Graph validation

- topic tree has exactly one valid parent chain per non-root node
- no cycles
- edge endpoints exist
- edge types are valid
- depth and code structure are coherent

### 3. Pedagogical validation

- misconception rules are not empty placeholders
- task rules are specific enough to influence scheduling
- command words are captured with usable guidance
- topic decomposition is fine-grained enough for tutoring, but not absurdly fragmented

### 4. Product validation

- scheduler can operate on the package
- ingestion can map chunks into the topic graph
- study sessions can assemble meaningful context
- reports can reference qualification structure coherently

## Review workflow

The review model should be:

- AI extracts first pass
- validation identifies structural/semantic gaps
- human reviewer makes corrections
- reviewer signs off package status

Purely AI-generated curriculum packages should not go straight to production.

Recommended reviewer checklist:

- Is the topic tree complete relative to the specification?
- Are component boundaries accurate?
- Are topic names and codes usable in product UI?
- Are edges meaningful or just guessed?
- Are misconception rules genuinely helpful?
- Are task rules actionable?
- Are command words modeled at the right level?

## Rendered review artifacts

Review should not happen against raw JSON alone.

The factory should generate:

- a tree view of the topic hierarchy
- a component summary
- an edge summary
- a misconception-rule summary
- validation warnings/errors
- a diff against previous package version

This makes human review faster and less error-prone.

## Tooling to build

The factory should eventually include:

- `curriculum extract`
  Reads source docs and produces a draft package.

- `curriculum normalize`
  Converts extraction output into canonical package shape.

- `curriculum validate`
  Runs structural, graph, and completeness checks.

- `curriculum review-report`
  Renders human-readable summaries and diffs.

- `curriculum seed`
  Imports approved packages idempotently.

- `curriculum verify`
  Runs downstream checks against scheduler/ingestion/session assumptions.

These can start as scripts and become a proper internal CLI over time.

## Repository model

Suggested long-term layout:

```text
curriculum/
  sources/
    aqa-gcse-biology/
      specification.pdf
      mark-schemes/
      examiner-reports/
  packages/
    aqa-gcse-biology/
      package.json
      qualification.json
      topics.json
      edges.json
      misconceptions.json
      task-rules.json
      metadata.json
  review/
    aqa-gcse-biology/
      report.md
      tree.txt
      diff.md
```

This does not need to be implemented all at once, but the design should assume source artifacts, package artifacts, and review artifacts are distinct.

## Quality bar for the first reference package

The first reference package should be selected for leverage, not convenience.

Good candidates:

- a popular GCSE subject with rich official materials
- enough complexity to exercise the system properly
- enough commercial value to justify the review time

The first reference package must:

- be rebuilt through the factory from source documents
- pass all validation layers
- be human-reviewed
- seed cleanly
- support downstream product flows

Only after that should it be treated as the template for future packages.

## Immediate implementation tasks

### Phase 1: define the contract

- define canonical package schemas
- define package status metadata (`legacy`, `candidate`, `approved`, `reference`)
- define completeness and validation rules

### Phase 2: build local tooling

- add schema validation and package validation
- add idempotent seed support for canonical packages
- add review-report generation

### Phase 3: rebuild one qualification

- choose one qualification to rebuild through the new process
- treat current seed data as reference input only, not the target output
- iterate until the package is reference quality

### Phase 4: expand breadth

- add several more high-value qualifications using the same pipeline
- measure where factory work is still too manual
- improve prompts, parsers, and validation before scaling wider

## Non-goals

These are not the immediate goal of the curriculum factory:

- covering every subject immediately
- automating away human review entirely
- perfectly modeling every nuance of every specification before shipping the pipeline

The immediate goal is narrower:

Build a system that can repeatedly produce high-quality curriculum packages, with human review, fast enough that broad subject coverage becomes an execution problem rather than a bespoke modeling problem.

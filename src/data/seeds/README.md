# Seed Data

This directory contains JSON seed files for qualification structures. Each file defines the complete structure for one exam board's version of a qualification.

## File format

Seed files follow the `QualificationSeed` interface defined in `src/lib/types.ts`. Each file contains:

- **subject** and **examBoard**: top-level identifiers
- **components**: assessment papers/coursework with weightings
- **topics**: hierarchical topic tree (nested children, with cross-cutting edges referencing topic codes)
- **commandWords**: exam board command word definitions with expected depth
- **questionTypes**: question formats used in the qualification
- **misconceptionRules** (optional): common student misconceptions per topic with correction guidance

## Conventions

- Topic codes follow the specification numbering (e.g., `4.1.1` for AQA Biology)
- Edges use `toCode` to reference other topics by their code within the same seed file
- `estimatedHours` is rough teaching time, used for scheduling weights
- `severity` for misconceptions: 1 = minor, 2 = moderate, 3 = critical

## Available seeds

| File | Qualification | Exam Board | Spec Code |
|------|--------------|------------|-----------|
| `gcse-biology-aqa.json` | GCSE Biology | AQA | 8461 |

## Loading seeds

Use `loadQualification` from `src/engine/curriculum.ts`:

```typescript
import { loadQualification } from '@/engine/curriculum';
import seedData from '@/data/seeds/gcse-biology-aqa.json';

const result = await loadQualification(seedData);
```

The loader is idempotent: running it twice with the same data will not create duplicates.

# Legacy Seed Data

This directory contains legacy JSON seed files for qualification structures. These files are kept for legacy-adapter coverage, regression checks, and migration bridges.

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

## Available legacy seeds

| File | Qualification | Exam Board | Spec Code |
|------|--------------|------------|-----------|
| `gcse-biology-aqa.json` | GCSE Biology legacy regression seed | AQA | 8461 |

`gcse-biology-aqa.json` is not the canonical Biology package path anymore. The rebuilt Biology package fixture lives at `src/curriculum/__fixtures__/aqa-gcse-biology-8461/candidate-package.json` and shared test helpers seed that rebuilt package through `seedCurriculumInput` with a test-only approval wrapper.

## Loading legacy seeds

Use `loadQualification` from `src/engine/curriculum.ts`:

```typescript
import { loadQualification } from '@/engine/curriculum';
import seedData from '@/data/seeds/gcse-biology-aqa.json';
import { db } from '@/lib/db';

const result = await loadQualification(db, seedData);
```

The loader is idempotent: running it twice with the same data will not create duplicates.

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/lib/db";
import type { QualificationVersionId, TopicId } from "@/lib/types";
import {
  assessmentComponents,
  commandWords,
  pastPapers,
  pastPaperQuestions,
  pastPaperQuestionSignals,
  pastPaperQuestionTopics,
  questionTypes,
  topics,
} from "@/db/schema";

const nonEmptyStringSchema = z.string().trim().min(1);
const slugSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const pastPaperQuestionDraftSchema = z
  .object({
    questionNumber: nonEmptyStringSchema,
    locator: nonEmptyStringSchema.optional(),
    prompt: nonEmptyStringSchema,
    marks: z.number().int().positive(),
    options: z.array(nonEmptyStringSchema).min(2).optional(),
    commandWordHint: nonEmptyStringSchema.optional(),
    questionTypeHint: nonEmptyStringSchema.optional(),
    topicCodeHints: z.array(nonEmptyStringSchema).default([]),
    topicHint: nonEmptyStringSchema.optional(),
    markSchemeBullets: z.array(nonEmptyStringSchema).min(1),
  })
  .strict();

export const pastPaperDraftSchema = z
  .object({
    slug: slugSchema,
    title: nonEmptyStringSchema,
    componentCode: nonEmptyStringSchema,
    series: nonEmptyStringSchema,
    examYear: z.number().int().positive(),
    paperCode: nonEmptyStringSchema.optional(),
    questions: z.array(pastPaperQuestionDraftSchema).min(1),
  })
  .strict();

export const pastPaperFixtureSchema = z
  .object({
    qualification: z
      .object({
        examBoardCode: nonEmptyStringSchema,
        subjectSlug: slugSchema,
        versionCode: nonEmptyStringSchema,
      })
      .strict(),
    papers: z.array(pastPaperDraftSchema).min(1),
  })
  .strict();

export type PastPaperQuestionDraft = z.infer<typeof pastPaperQuestionDraftSchema>;
export type PastPaperDraft = z.infer<typeof pastPaperDraftSchema>;
export type PastPaperFixture = z.infer<typeof pastPaperFixtureSchema>;
export type PastPaperSignalType = "mark_scheme_pattern" | "exam_technique";

interface QualificationReferenceComponent {
  id: string;
  code: string;
  name: string;
}

interface QualificationReferenceTopic {
  id: string;
  code: string | null;
  name: string;
}

interface QualificationReferenceCommandWord {
  id: string;
  word: string;
  definition: string;
  expectedDepth: number;
}

interface QualificationReferenceQuestionType {
  id: string;
  name: string;
  description: string | null;
  typicalMarks: number | null;
  markSchemePattern: string | null;
}

interface QualificationPastPaperCatalog {
  qualificationVersionId: string;
  componentsByCode: Map<string, QualificationReferenceComponent>;
  topicsByCode: Map<string, QualificationReferenceTopic>;
  commandWords: QualificationReferenceCommandWord[];
  commandWordsByWord: Map<string, QualificationReferenceCommandWord>;
  questionTypesByName: Map<string, QualificationReferenceQuestionType>;
}

export interface AnalyzedPastPaperQuestionTopicLink {
  topicId: string | null;
  topicCode: string | null;
  topicName: string | null;
  topicHint: string | null;
  isPrimary: boolean;
  confidence: number;
}

export interface AnalyzedPastPaperSignal {
  signalType: PastPaperSignalType;
  code: string;
  label: string;
  note: string;
}

export interface AnalyzedPastPaperQuestion {
  questionNumber: string;
  questionOrder: number;
  locator: string;
  promptExcerpt: string;
  marksAvailable: number;
  questionType: QualificationReferenceQuestionType;
  commandWord: QualificationReferenceCommandWord;
  topicLinks: AnalyzedPastPaperQuestionTopicLink[];
  signals: AnalyzedPastPaperSignal[];
}

export interface AnalyzedPastPaper {
  qualificationVersionId: string;
  slug: string;
  title: string;
  component: QualificationReferenceComponent;
  series: string;
  examYear: number;
  paperCode: string | null;
  questions: AnalyzedPastPaperQuestion[];
}

export interface SeedPastPaperAnalysisResult {
  papersUpserted: number;
  questionsUpserted: number;
  topicLinksInserted: number;
  signalsInserted: number;
}

export interface PastPaperQuestionSignal {
  signalType: PastPaperSignalType;
  code: string;
  label: string;
  note: string;
}

export interface PastPaperQuestionIntelligence {
  paperId: string;
  paperSlug: string;
  paperTitle: string;
  series: string;
  examYear: number;
  paperCode: string | null;
  componentId: string;
  componentCode: string;
  componentName: string;
  questionId: string;
  questionNumber: string;
  questionOrder: number;
  locator: string;
  promptExcerpt: string;
  marksAvailable: number;
  questionType: QualificationReferenceQuestionType;
  commandWord: QualificationReferenceCommandWord | null;
  topicLinks: AnalyzedPastPaperQuestionTopicLink[];
  signals: PastPaperQuestionSignal[];
}

export interface ListPastPaperQuestionIntelligenceOptions {
  qualificationVersionId: QualificationVersionId | string;
  topicId?: TopicId | string;
  componentId?: string;
  commandWord?: string;
  questionType?: string;
  limit?: number;
}

interface PastPaperAggregateRow {
  label: string;
  count: number;
  totalMarks: number;
}

export interface PastPaperQualificationOverview {
  qualificationVersionId: string;
  paperCount: number;
  questionCount: number;
  totalMarks: number;
  components: PastPaperAggregateRow[];
  commandWords: PastPaperAggregateRow[];
  questionTypes: PastPaperAggregateRow[];
}

export interface PastPaperTopicIntelligence {
  qualificationVersionId: string;
  topicId: string;
  topicName: string | null;
  questionCount: number;
  totalMarks: number;
  commandWords: PastPaperAggregateRow[];
  questionTypes: PastPaperAggregateRow[];
  signals: Array<{
    signalType: PastPaperSignalType;
    code: string;
    label: string;
    count: number;
  }>;
  questions: PastPaperQuestionIntelligence[];
}

const SIGNAL_DEFINITIONS: Record<
  PastPaperSignalType,
  Record<
    string,
    {
      label: string;
      note: (question: PastPaperQuestionDraft) => string;
    }
  >
> = {
  mark_scheme_pattern: {
    single_point: {
      label: "Single-point credit",
      note: () =>
        "The mark scheme is looking for one precise credited selection or fact.",
    },
    keyword_precision: {
      label: "Precise keyword credit",
      note: () =>
        "Credit depends on the exact scientific term or tightly bounded wording, not a loose paraphrase.",
    },
    quantitative_answer: {
      label: "Quantitative method marks",
      note: () =>
        "Credit depends on the numerical method as well as the final answer, so working matters.",
    },
    point_plus_reason: {
      label: "Point-plus-reason explanation",
      note: (question) =>
        `${question.marks} marks reward linked scientific reasoning, not disconnected facts.`,
    },
    comparison_pairs: {
      label: "Paired comparison credit",
      note: () =>
        "Marks are earned by pairing similarities or differences across both sides of the comparison.",
    },
    sequenced_method: {
      label: "Ordered method steps",
      note: () =>
        "The mark scheme rewards the practical method in the correct sequence of steps.",
    },
    balanced_judgement: {
      label: "Balanced judgement",
      note: () =>
        "Credit requires strengths and weaknesses plus a justified overall judgement.",
    },
  },
  exam_technique: {
    one_point_per_mark: {
      label: "One point per mark",
      note: (question) =>
        `${question.marks} marks means the answer should land ${question.marks === 1 ? "one precise point" : `${question.marks} distinct credited points`} cleanly.`,
    },
    use_precise_vocabulary: {
      label: "Use precise vocabulary",
      note: () =>
        "Use the specification term directly and avoid broader or nearly-right wording.",
    },
    show_working: {
      label: "Show the working",
      note: () =>
        "Write the substitution and calculation steps so method marks stay available if the final value slips.",
    },
    link_cause_and_effect: {
      label: "Link cause and effect",
      note: () =>
        "Build each mark as cause -> process -> outcome rather than as isolated statements.",
    },
    compare_both_sides: {
      label: "Write both sides explicitly",
      note: () =>
        "State both sides of the comparison explicitly; do not describe only one side and imply the other.",
    },
    follow_method_order: {
      label: "Keep the method in order",
      note: () =>
        "State the practical steps in order and name what is removed, kept, or measured at each stage.",
    },
    justify_overall_judgement: {
      label: "Justify the overall judgement",
      note: () =>
        "End with a clear overall decision tied back to the environmental or economic trade-off in the question.",
    },
  },
};

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function resolveSignal(
  signalType: PastPaperSignalType,
  code: string,
  question: PastPaperQuestionDraft
): AnalyzedPastPaperSignal {
  const definition = SIGNAL_DEFINITIONS[signalType][code];
  if (!definition) {
    throw new Error(`Unknown ${signalType} signal code: ${code}`);
  }

  return {
    signalType,
    code,
    label: definition.label,
    note: definition.note(question),
  };
}

function buildTextFingerprint(question: PastPaperQuestionDraft): string {
  return [question.prompt, ...question.markSchemeBullets].join(" ").toLowerCase();
}

function detectCommandWord(
  question: PastPaperQuestionDraft,
  catalog: QualificationPastPaperCatalog
): QualificationReferenceCommandWord {
  if (question.commandWordHint) {
    const hinted = catalog.commandWordsByWord.get(
      question.commandWordHint.toLowerCase()
    );
    if (!hinted) {
      throw new Error(
        `Unknown command word hint "${question.commandWordHint}" for question ${question.questionNumber}`
      );
    }

    return hinted;
  }

  const prompt = question.prompt.toLowerCase();
  let bestMatch:
    | {
        index: number;
        wordLength: number;
        commandWord: QualificationReferenceCommandWord;
      }
    | undefined;

  for (const commandWord of catalog.commandWords) {
    const matcher = new RegExp(`\\b${commandWord.word.toLowerCase()}\\b`, "i");
    const index = prompt.search(matcher);
    if (index < 0) {
      continue;
    }

    if (
      !bestMatch ||
      index < bestMatch.index ||
      (index === bestMatch.index &&
        commandWord.word.length > bestMatch.wordLength)
    ) {
      bestMatch = {
        index,
        wordLength: commandWord.word.length,
        commandWord,
      };
    }
  }

  if (!bestMatch) {
    throw new Error(
      `Could not infer a command word for question ${question.questionNumber}; provide commandWordHint for this narrower input format.`
    );
  }

  return bestMatch.commandWord;
}

function inferQuestionTypeName(
  question: PastPaperQuestionDraft,
  commandWord: QualificationReferenceCommandWord
): string {
  if (question.questionTypeHint) {
    return question.questionTypeHint.trim();
  }

  if ((question.options?.length ?? 0) > 0) {
    return "Multiple choice";
  }

  if (
    commandWord.word.toLowerCase() === "evaluate" ||
    question.marks >= 6
  ) {
    return "Open response";
  }

  if (question.marks <= 2) {
    return "Closed short answer";
  }

  return "Structured";
}

function resolveQuestionType(
  questionTypeName: string,
  catalog: QualificationPastPaperCatalog,
  questionNumber: string
): QualificationReferenceQuestionType {
  const resolved = catalog.questionTypesByName.get(
    questionTypeName.toLowerCase()
  );
  if (!resolved) {
    throw new Error(
      `Unknown question type "${questionTypeName}" for question ${questionNumber}`
    );
  }

  return resolved;
}

function inferSignals(
  question: PastPaperQuestionDraft,
  commandWord: QualificationReferenceCommandWord
): AnalyzedPastPaperSignal[] {
  const prompt = question.prompt.toLowerCase();
  const fingerprint = buildTextFingerprint(question);
  const signalCodes: Array<{ signalType: PastPaperSignalType; code: string }> = [];
  const command = commandWord.word.toLowerCase();

  const isMethodQuestion =
    /(method|practical|filter|filtrate|evaporat|cooling|crystal|burette|flask|add excess)/.test(
      fingerprint
    );

  if ((question.options?.length ?? 0) > 0) {
    signalCodes.push(
      { signalType: "mark_scheme_pattern", code: "single_point" },
      { signalType: "exam_technique", code: "one_point_per_mark" }
    );
  } else if (command === "calculate") {
    signalCodes.push(
      { signalType: "mark_scheme_pattern", code: "quantitative_answer" },
      { signalType: "exam_technique", code: "show_working" }
    );
  } else if (command === "evaluate") {
    signalCodes.push(
      { signalType: "mark_scheme_pattern", code: "balanced_judgement" },
      { signalType: "exam_technique", code: "justify_overall_judgement" }
    );
  } else if (command === "compare") {
    signalCodes.push(
      { signalType: "mark_scheme_pattern", code: "comparison_pairs" },
      { signalType: "exam_technique", code: "compare_both_sides" }
    );
  } else if (isMethodQuestion) {
    signalCodes.push(
      { signalType: "mark_scheme_pattern", code: "sequenced_method" },
      { signalType: "exam_technique", code: "follow_method_order" }
    );
  } else if (command === "explain" || /why\b|how\b/.test(prompt)) {
    signalCodes.push(
      { signalType: "mark_scheme_pattern", code: "point_plus_reason" },
      { signalType: "exam_technique", code: "link_cause_and_effect" }
    );
  } else {
    signalCodes.push(
      { signalType: "mark_scheme_pattern", code: "keyword_precision" },
      { signalType: "exam_technique", code: "use_precise_vocabulary" }
    );
  }

  return uniqueStrings(
    signalCodes.map((signal) => `${signal.signalType}:${signal.code}`)
  ).map((key) => {
    const [signalType, code] = key.split(":") as [
      PastPaperSignalType,
      string,
    ];
    return resolveSignal(signalType, code, question);
  });
}

function buildTopicLinks(
  question: PastPaperQuestionDraft,
  catalog: QualificationPastPaperCatalog
): AnalyzedPastPaperQuestionTopicLink[] {
  const links: AnalyzedPastPaperQuestionTopicLink[] = [];
  const topicCodes = uniqueStrings(question.topicCodeHints);

  for (const [index, topicCode] of topicCodes.entries()) {
    const topic = catalog.topicsByCode.get(topicCode);
    if (!topic) {
      throw new Error(
        `Unknown topic code hint "${topicCode}" for question ${question.questionNumber}`
      );
    }

    links.push({
      topicId: topic.id,
      topicCode: topic.code,
      topicName: topic.name,
      topicHint: index === 0 ? question.topicHint ?? null : null,
      isPrimary: index === 0,
      confidence: 0.95,
    });
  }

  if (links.length === 0 && question.topicHint) {
    links.push({
      topicId: null,
      topicCode: null,
      topicName: null,
      topicHint: question.topicHint,
      isPrimary: true,
      confidence: 0.65,
    });
  }

  return links;
}

function buildCatalogMaps(
  qualificationVersionId: string,
  components: QualificationReferenceComponent[],
  referenceTopics: QualificationReferenceTopic[],
  referenceCommandWords: QualificationReferenceCommandWord[],
  referenceQuestionTypes: QualificationReferenceQuestionType[]
): QualificationPastPaperCatalog {
  return {
    qualificationVersionId,
    componentsByCode: new Map(
      components.map((component) => [component.code.toLowerCase(), component])
    ),
    topicsByCode: new Map(
      referenceTopics.flatMap((topic) =>
        topic.code ? [[topic.code, topic] as const] : []
      )
    ),
    commandWords: referenceCommandWords,
    commandWordsByWord: new Map(
      referenceCommandWords.map((commandWord) => [
        commandWord.word.toLowerCase(),
        commandWord,
      ])
    ),
    questionTypesByName: new Map(
      referenceQuestionTypes.map((questionType) => [
        questionType.name.toLowerCase(),
        questionType,
      ])
    ),
  };
}

export async function loadQualificationPastPaperCatalog(
  db: Database,
  qualificationVersionId: QualificationVersionId | string
): Promise<QualificationPastPaperCatalog> {
  const [components, referenceTopics, referenceCommandWords, referenceQuestionTypes] =
    await Promise.all([
      db
        .select({
          id: assessmentComponents.id,
          code: assessmentComponents.code,
          name: assessmentComponents.name,
        })
        .from(assessmentComponents)
        .where(eq(assessmentComponents.qualificationVersionId, qualificationVersionId)),
      db
        .select({
          id: topics.id,
          code: topics.code,
          name: topics.name,
        })
        .from(topics)
        .where(eq(topics.qualificationVersionId, qualificationVersionId)),
      db
        .select({
          id: commandWords.id,
          word: commandWords.word,
          definition: commandWords.definition,
          expectedDepth: commandWords.expectedDepth,
        })
        .from(commandWords)
        .where(eq(commandWords.qualificationVersionId, qualificationVersionId)),
      db
        .select({
          id: questionTypes.id,
          name: questionTypes.name,
          description: questionTypes.description,
          typicalMarks: questionTypes.typicalMarks,
          markSchemePattern: questionTypes.markSchemePattern,
        })
        .from(questionTypes)
        .where(eq(questionTypes.qualificationVersionId, qualificationVersionId)),
    ]);

  if (components.length === 0) {
    throw new Error(
      `No assessment components found for qualification version ${qualificationVersionId}`
    );
  }
  if (referenceCommandWords.length === 0) {
    throw new Error(
      `No command words found for qualification version ${qualificationVersionId}`
    );
  }
  if (referenceQuestionTypes.length === 0) {
    throw new Error(
      `No question types found for qualification version ${qualificationVersionId}`
    );
  }

  return buildCatalogMaps(
    String(qualificationVersionId),
    components,
    referenceTopics,
    referenceCommandWords,
    referenceQuestionTypes
  );
}

export function analyzePastPaperDraft(
  catalog: QualificationPastPaperCatalog,
  input: PastPaperDraft
): AnalyzedPastPaper {
  const draft = pastPaperDraftSchema.parse(input);
  const component = catalog.componentsByCode.get(draft.componentCode.toLowerCase());

  if (!component) {
    throw new Error(
      `Unknown component code "${draft.componentCode}" for paper ${draft.slug}`
    );
  }

  const questions = draft.questions.map((question, index) => {
    const commandWord = detectCommandWord(question, catalog);
    const questionType = resolveQuestionType(
      inferQuestionTypeName(question, commandWord),
      catalog,
      question.questionNumber
    );

    return {
      questionNumber: question.questionNumber,
      questionOrder: index + 1,
      locator: question.locator ?? question.questionNumber,
      promptExcerpt: question.prompt,
      marksAvailable: question.marks,
      questionType,
      commandWord,
      topicLinks: buildTopicLinks(question, catalog),
      signals: inferSignals(question, commandWord),
    } satisfies AnalyzedPastPaperQuestion;
  });

  return {
    qualificationVersionId: catalog.qualificationVersionId,
    slug: draft.slug,
    title: draft.title,
    component,
    series: draft.series,
    examYear: draft.examYear,
    paperCode: draft.paperCode ?? null,
    questions,
  };
}

export function analyzePastPaperFixture(
  catalog: QualificationPastPaperCatalog,
  input: PastPaperFixture
): AnalyzedPastPaper[] {
  const fixture = pastPaperFixtureSchema.parse(input);
  return fixture.papers.map((paper) => analyzePastPaperDraft(catalog, paper));
}

export async function seedPastPaperAnalyses(
  db: Database,
  analyses: AnalyzedPastPaper[]
): Promise<SeedPastPaperAnalysisResult> {
  if (analyses.length === 0) {
    return {
      papersUpserted: 0,
      questionsUpserted: 0,
      topicLinksInserted: 0,
      signalsInserted: 0,
    };
  }

  return db.transaction(async (tx) => {
    let papersUpserted = 0;
    let questionsUpserted = 0;
    let topicLinksInserted = 0;
    let signalsInserted = 0;

    for (const analysis of analyses) {
      const [paperRow] = await tx
        .insert(pastPapers)
        .values({
          qualificationVersionId: analysis.qualificationVersionId,
          componentId: analysis.component.id,
          slug: analysis.slug,
          title: analysis.title,
          series: analysis.series,
          examYear: analysis.examYear,
          paperCode: analysis.paperCode,
        })
        .onConflictDoUpdate({
          target: [pastPapers.qualificationVersionId, pastPapers.slug],
          set: {
            componentId: analysis.component.id,
            title: analysis.title,
            series: analysis.series,
            examYear: analysis.examYear,
            paperCode: analysis.paperCode,
          },
        })
        .returning({ id: pastPapers.id });

      papersUpserted += 1;

      const existingQuestions = await tx
        .select({
          id: pastPaperQuestions.id,
          questionNumber: pastPaperQuestions.questionNumber,
        })
        .from(pastPaperQuestions)
        .where(eq(pastPaperQuestions.paperId, paperRow.id));

      const retainedQuestionIds: string[] = [];

      for (const question of analysis.questions) {
        const [questionRow] = await tx
          .insert(pastPaperQuestions)
          .values({
            paperId: paperRow.id,
            questionNumber: question.questionNumber,
            questionOrder: question.questionOrder,
            locator: question.locator,
            promptExcerpt: question.promptExcerpt,
            marksAvailable: question.marksAvailable,
            questionTypeId: question.questionType.id,
            commandWordId: question.commandWord.id,
          })
          .onConflictDoUpdate({
            target: [pastPaperQuestions.paperId, pastPaperQuestions.questionNumber],
            set: {
              questionOrder: question.questionOrder,
              locator: question.locator,
              promptExcerpt: question.promptExcerpt,
              marksAvailable: question.marksAvailable,
              questionTypeId: question.questionType.id,
              commandWordId: question.commandWord.id,
            },
          })
          .returning({ id: pastPaperQuestions.id });

        retainedQuestionIds.push(questionRow.id);
        questionsUpserted += 1;

        await tx
          .delete(pastPaperQuestionTopics)
          .where(eq(pastPaperQuestionTopics.pastPaperQuestionId, questionRow.id));
        await tx
          .delete(pastPaperQuestionSignals)
          .where(eq(pastPaperQuestionSignals.pastPaperQuestionId, questionRow.id));

        if (question.topicLinks.length > 0) {
          await tx.insert(pastPaperQuestionTopics).values(
            question.topicLinks.map((topicLink) => ({
              pastPaperQuestionId: questionRow.id,
              topicId: topicLink.topicId,
              topicHint: topicLink.topicHint,
              isPrimary: topicLink.isPrimary,
              confidence: topicLink.confidence.toFixed(2),
            }))
          );
          topicLinksInserted += question.topicLinks.length;
        }

        if (question.signals.length > 0) {
          await tx.insert(pastPaperQuestionSignals).values(
            question.signals.map((signal) => ({
              pastPaperQuestionId: questionRow.id,
              signalType: signal.signalType,
              code: signal.code,
              label: signal.label,
              note: signal.note,
            }))
          );
          signalsInserted += question.signals.length;
        }
      }

      const staleQuestionIds = existingQuestions
        .filter((row) => !retainedQuestionIds.includes(row.id))
        .map((row) => row.id);

      if (staleQuestionIds.length > 0) {
        await tx
          .delete(pastPaperQuestions)
          .where(inArray(pastPaperQuestions.id, staleQuestionIds));
      }
    }

    return {
      papersUpserted,
      questionsUpserted,
      topicLinksInserted,
      signalsInserted,
    };
  });
}

function aggregateByLabel(
  rows: Array<{ label: string; marks: number }>
): PastPaperAggregateRow[] {
  const aggregates = new Map<string, PastPaperAggregateRow>();

  for (const row of rows) {
    const existing = aggregates.get(row.label) ?? {
      label: row.label,
      count: 0,
      totalMarks: 0,
    };
    existing.count += 1;
    existing.totalMarks += row.marks;
    aggregates.set(row.label, existing);
  }

  return [...aggregates.values()].sort(
    (left, right) =>
      right.count - left.count ||
      right.totalMarks - left.totalMarks ||
      left.label.localeCompare(right.label)
  );
}

export async function listPastPaperQuestionIntelligence(
  db: Database,
  options: ListPastPaperQuestionIntelligenceOptions
): Promise<PastPaperQuestionIntelligence[]> {
  const conditions = [
    eq(pastPapers.qualificationVersionId, options.qualificationVersionId),
  ];

  if (options.componentId) {
    conditions.push(eq(pastPapers.componentId, options.componentId));
  }

  const baseRows = await db
    .select({
      paperId: pastPapers.id,
      paperSlug: pastPapers.slug,
      paperTitle: pastPapers.title,
      series: pastPapers.series,
      examYear: pastPapers.examYear,
      paperCode: pastPapers.paperCode,
      componentId: assessmentComponents.id,
      componentCode: assessmentComponents.code,
      componentName: assessmentComponents.name,
      questionId: pastPaperQuestions.id,
      questionNumber: pastPaperQuestions.questionNumber,
      questionOrder: pastPaperQuestions.questionOrder,
      locator: pastPaperQuestions.locator,
      promptExcerpt: pastPaperQuestions.promptExcerpt,
      marksAvailable: pastPaperQuestions.marksAvailable,
      questionTypeId: questionTypes.id,
      questionTypeName: questionTypes.name,
      questionTypeDescription: questionTypes.description,
      questionTypeTypicalMarks: questionTypes.typicalMarks,
      questionTypeMarkSchemePattern: questionTypes.markSchemePattern,
      commandWordId: commandWords.id,
      commandWordWord: commandWords.word,
      commandWordDefinition: commandWords.definition,
      commandWordExpectedDepth: commandWords.expectedDepth,
    })
    .from(pastPaperQuestions)
    .innerJoin(pastPapers, eq(pastPaperQuestions.paperId, pastPapers.id))
    .innerJoin(
      assessmentComponents,
      eq(pastPapers.componentId, assessmentComponents.id)
    )
    .innerJoin(
      questionTypes,
      eq(pastPaperQuestions.questionTypeId, questionTypes.id)
    )
    .leftJoin(
      commandWords,
      eq(pastPaperQuestions.commandWordId, commandWords.id)
    )
    .where(and(...conditions))
    .orderBy(
      desc(pastPapers.examYear),
      asc(pastPapers.series),
      asc(pastPaperQuestions.questionOrder)
    );

  if (baseRows.length === 0) {
    return [];
  }

  const questionIds = baseRows.map((row) => row.questionId);

  const [topicRows, signalRows] = await Promise.all([
    db
      .select({
        questionId: pastPaperQuestionTopics.pastPaperQuestionId,
        topicId: pastPaperQuestionTopics.topicId,
        topicHint: pastPaperQuestionTopics.topicHint,
        isPrimary: pastPaperQuestionTopics.isPrimary,
        confidence: pastPaperQuestionTopics.confidence,
        topicCode: topics.code,
        topicName: topics.name,
      })
      .from(pastPaperQuestionTopics)
      .leftJoin(topics, eq(pastPaperQuestionTopics.topicId, topics.id))
      .where(inArray(pastPaperQuestionTopics.pastPaperQuestionId, questionIds))
      .orderBy(
        asc(pastPaperQuestionTopics.pastPaperQuestionId),
        desc(pastPaperQuestionTopics.isPrimary)
      ),
    db
      .select({
        questionId: pastPaperQuestionSignals.pastPaperQuestionId,
        signalType: pastPaperQuestionSignals.signalType,
        code: pastPaperQuestionSignals.code,
        label: pastPaperQuestionSignals.label,
        note: pastPaperQuestionSignals.note,
      })
      .from(pastPaperQuestionSignals)
      .where(inArray(pastPaperQuestionSignals.pastPaperQuestionId, questionIds))
      .orderBy(
        asc(pastPaperQuestionSignals.pastPaperQuestionId),
        asc(pastPaperQuestionSignals.signalType),
        asc(pastPaperQuestionSignals.code)
      ),
  ]);

  const topicLinksByQuestionId = new Map<string, AnalyzedPastPaperQuestionTopicLink[]>();
  for (const row of topicRows) {
    const existing = topicLinksByQuestionId.get(row.questionId) ?? [];
    existing.push({
      topicId: row.topicId,
      topicCode: row.topicCode,
      topicName: row.topicName,
      topicHint: row.topicHint,
      isPrimary: row.isPrimary,
      confidence: Number(row.confidence),
    });
    topicLinksByQuestionId.set(row.questionId, existing);
  }

  const signalsByQuestionId = new Map<string, PastPaperQuestionSignal[]>();
  for (const row of signalRows) {
    const existing = signalsByQuestionId.get(row.questionId) ?? [];
    existing.push({
      signalType: row.signalType,
      code: row.code,
      label: row.label,
      note: row.note,
    });
    signalsByQuestionId.set(row.questionId, existing);
  }

  let results = baseRows.map((row) => ({
    paperId: row.paperId,
    paperSlug: row.paperSlug,
    paperTitle: row.paperTitle,
    series: row.series,
    examYear: row.examYear,
    paperCode: row.paperCode,
    componentId: row.componentId,
    componentCode: row.componentCode,
    componentName: row.componentName,
    questionId: row.questionId,
    questionNumber: row.questionNumber,
    questionOrder: row.questionOrder,
    locator: row.locator,
    promptExcerpt: row.promptExcerpt,
    marksAvailable: row.marksAvailable,
    questionType: {
      id: row.questionTypeId,
      name: row.questionTypeName,
      description: row.questionTypeDescription,
      typicalMarks: row.questionTypeTypicalMarks,
      markSchemePattern: row.questionTypeMarkSchemePattern,
    },
    commandWord: row.commandWordId
      ? {
          id: row.commandWordId,
          word: row.commandWordWord!,
          definition: row.commandWordDefinition!,
          expectedDepth: row.commandWordExpectedDepth!,
        }
      : null,
    topicLinks: topicLinksByQuestionId.get(row.questionId) ?? [],
    signals: signalsByQuestionId.get(row.questionId) ?? [],
  }));

  if (options.topicId) {
    results = results.filter((row) =>
      row.topicLinks.some((topicLink) => topicLink.topicId === options.topicId)
    );
  }

  if (options.commandWord) {
    const expected = options.commandWord.toLowerCase();
    results = results.filter(
      (row) => row.commandWord?.word.toLowerCase() === expected
    );
  }

  if (options.questionType) {
    const expected = options.questionType.toLowerCase();
    results = results.filter(
      (row) => row.questionType.name.toLowerCase() === expected
    );
  }

  if (options.limit && options.limit > 0) {
    results = results.slice(0, options.limit);
  }

  return results;
}

export async function getPastPaperQualificationOverview(
  db: Database,
  qualificationVersionId: QualificationVersionId | string
): Promise<PastPaperQualificationOverview> {
  const questions = await listPastPaperQuestionIntelligence(db, {
    qualificationVersionId,
  });

  return {
    qualificationVersionId: String(qualificationVersionId),
    paperCount: new Set(questions.map((question) => question.paperId)).size,
    questionCount: questions.length,
    totalMarks: questions.reduce(
      (sum, question) => sum + question.marksAvailable,
      0
    ),
    components: aggregateByLabel(
      questions.map((question) => ({
        label: `${question.componentCode} ${question.componentName}`,
        marks: question.marksAvailable,
      }))
    ),
    commandWords: aggregateByLabel(
      questions
        .filter((question) => question.commandWord)
        .map((question) => ({
          label: question.commandWord!.word,
          marks: question.marksAvailable,
        }))
    ),
    questionTypes: aggregateByLabel(
      questions.map((question) => ({
        label: question.questionType.name,
        marks: question.marksAvailable,
      }))
    ),
  };
}

export async function getPastPaperTopicIntelligence(
  db: Database,
  qualificationVersionId: QualificationVersionId | string,
  topicId: TopicId | string
): Promise<PastPaperTopicIntelligence> {
  const [questions, topicRow] = await Promise.all([
    listPastPaperQuestionIntelligence(db, {
      qualificationVersionId,
      topicId,
    }),
    db
      .select({ name: topics.name })
      .from(topics)
      .where(
        and(
          eq(topics.id, topicId),
          eq(topics.qualificationVersionId, qualificationVersionId)
        )
      )
      .limit(1),
  ]);

  const signalCounts = new Map<string, {
    signalType: PastPaperSignalType;
    code: string;
    label: string;
    count: number;
  }>();

  for (const question of questions) {
    for (const signal of question.signals) {
      const key = `${signal.signalType}:${signal.code}`;
      const existing = signalCounts.get(key) ?? {
        signalType: signal.signalType,
        code: signal.code,
        label: signal.label,
        count: 0,
      };
      existing.count += 1;
      signalCounts.set(key, existing);
    }
  }

  return {
    qualificationVersionId: String(qualificationVersionId),
    topicId: String(topicId),
    topicName: topicRow[0]?.name ?? null,
    questionCount: questions.length,
    totalMarks: questions.reduce(
      (sum, question) => sum + question.marksAvailable,
      0
    ),
    commandWords: aggregateByLabel(
      questions
        .filter((question) => question.commandWord)
        .map((question) => ({
          label: question.commandWord!.word,
          marks: question.marksAvailable,
        }))
    ),
    questionTypes: aggregateByLabel(
      questions.map((question) => ({
        label: question.questionType.name,
        marks: question.marksAvailable,
      }))
    ),
    signals: [...signalCounts.values()].sort(
      (left, right) =>
        right.count - left.count ||
        left.signalType.localeCompare(right.signalType) ||
        left.label.localeCompare(right.label)
    ),
    questions,
  };
}

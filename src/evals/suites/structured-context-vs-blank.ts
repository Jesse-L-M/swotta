import { buildSystemPrompt, loadPromptTemplate } from "@/ai/study-modes";
import type { EvalMetric, EvalScenarioResult, EvalSuiteResult } from "@/evals/core/types";
import {
  type DifficultyBand,
  STRUCTURED_CONTEXT_EVAL_FIXTURES,
  type StructuredContextEvalScenario,
} from "@/evals/fixtures/context-vs-blank";
import { BLOCK_TYPE_LABELS } from "@/lib/labels";

interface PromptSignals {
  masteryPercent: number | null;
  misconceptions: string[];
  sources: Array<{ name: string; excerpt: string }>;
}

interface PromptSimulation {
  openingTurn: string;
  difficultyBand: DifficultyBand;
  signals: PromptSignals;
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function scoreKeywordCoverage(text: string, keywords: string[]): number {
  if (keywords.length === 0) {
    return 1;
  }

  const normalizedText = normalize(text);
  const matches = keywords.filter((keyword) =>
    normalizedText.includes(normalize(keyword))
  );

  return matches.length / keywords.length;
}

function extractMasteryPercent(prompt: string): number | null {
  const match = prompt.match(/\*\*Current mastery level\*\*: (\d+)%/);
  return match ? Number(match[1]) : null;
}

function extractSection(prompt: string, startMarker: string, endMarker: string): string {
  const startIndex = prompt.indexOf(startMarker);
  if (startIndex === -1) {
    return "";
  }

  const fromStart = prompt.slice(startIndex + startMarker.length);
  const endIndex = fromStart.indexOf(endMarker);
  if (endIndex === -1) {
    return fromStart.trim();
  }

  return fromStart.slice(0, endIndex).trim();
}

function extractBulletLines(section: string): string[] {
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).replace(/\*\*/g, "").trim())
    .filter((line) => line.length > 0 && line !== "None recorded.");
}

function extractSignals(prompt: string): PromptSignals {
  const misconceptionsSection = extractSection(
    prompt,
    "- **Known misconceptions**:\n",
    "- **Confirmed memory**:"
  );
  const misconceptions = extractBulletLines(misconceptionsSection);

  const sources: Array<{ name: string; excerpt: string }> = [];
  const sourcePattern =
    /### Source \d+ \(from "([^"]+)"\)\n\n([\s\S]*?)(?=\n### Source |\n## Important Guidelines|$)/g;

  let match: RegExpExecArray | null;
  while ((match = sourcePattern.exec(prompt)) !== null) {
    sources.push({
      name: match[1],
      excerpt: match[2].trim(),
    });
  }

  return {
    masteryPercent: extractMasteryPercent(prompt),
    misconceptions,
    sources,
  };
}

function classifyDifficulty(masteryPercent: number | null): DifficultyBand {
  if (masteryPercent === null) {
    return "intermediate";
  }

  if (masteryPercent < 35) {
    return "foundational";
  }

  if (masteryPercent < 70) {
    return "intermediate";
  }

  return "stretch";
}

function firstSentence(text: string): string {
  const match = text.match(/[^.!?]+[.!?]/);
  return (match?.[0] ?? text).trim();
}

function buildOpeningTurn(
  scenario: StructuredContextEvalScenario,
  prompt: string
): PromptSimulation {
  const signals = extractSignals(prompt);
  const difficultyBand = classifyDifficulty(signals.masteryPercent);
  const misconception = signals.misconceptions[0];
  const source = signals.sources[0];

  let openingTurn: string;

  if (misconception) {
    if (difficultyBand === "foundational") {
      openingTurn = `Let's rebuild the weak point first: ${misconception}`;
    } else if (difficultyBand === "intermediate") {
      openingTurn = `Talk me through this carefully and fix the gap as you go: ${misconception}`;
    } else {
      openingTurn = `Answer this like an exam explanation and make sure you correct the weak spot: ${misconception}`;
    }
  } else if (difficultyBand === "stretch") {
    openingTurn = `Apply ${scenario.block.topicName} to an exam-style answer rather than giving me a definition.`;
  } else {
    openingTurn = `Give me your best explanation of ${scenario.block.topicName} before I step in.`;
  }

  if (source) {
    openingTurn += ` Use the note from ${source.name}: ${firstSentence(source.excerpt)}`;
  }

  return {
    openingTurn,
    difficultyBand,
    signals,
  };
}

async function buildBlankContextPrompt(
  scenario: StructuredContextEvalScenario
): Promise<string> {
  const template = await loadPromptTemplate(scenario.block.blockType);
  const label = BLOCK_TYPE_LABELS[scenario.block.blockType];

  return [
    `You are Swotta, an AI study tutor. You are running a **${label}** session.`,
    "",
    "## Session Mode Instructions",
    "",
    template,
    "",
    "## Topic Context",
    "",
    `- **Topic**: ${scenario.block.topicName}`,
    `- **Session type**: ${label}`,
    `- **Estimated duration**: ${scenario.block.durationMinutes} minutes`,
    `- **Session reason**: ${scenario.block.reason}`,
    "",
    "## Important Guidelines",
    "",
    "- Guide the student to discover answers themselves. Never give answers directly unless reviewing after an attempt.",
    "- Keep responses focused and exam-relevant.",
    "- When the session block is complete, include `<session_status>complete</session_status>` at the very end of your message.",
    "- Do not include the session_status tag until the block is genuinely complete.",
  ].join("\n");
}

function makeMetric(id: string, label: string, value: number): EvalMetric {
  return {
    id,
    label,
    value: Number(value.toFixed(2)),
    unit: "/100",
    direction: "higher",
  };
}

async function runScenario(
  scenario: StructuredContextEvalScenario
): Promise<EvalScenarioResult> {
  const structuredPrompt = await buildSystemPrompt(
    scenario.block,
    scenario.learnerContext,
    scenario.sourceChunks
  );
  const blankPrompt = await buildBlankContextPrompt(scenario);

  const structuredSimulation = buildOpeningTurn(scenario, structuredPrompt);
  const blankSimulation = buildOpeningTurn(scenario, blankPrompt);

  const buildVariant = (
    id: string,
    label: string,
    simulation: PromptSimulation,
    prompt: string
  ) => {
    const gapScore = scoreKeywordCoverage(
      simulation.openingTurn,
      scenario.expectations.gapKeywords
    );
    const misconceptionScore = scoreKeywordCoverage(
      simulation.openingTurn,
      scenario.expectations.misconceptionKeywords
    );
    const sourceScore = scoreKeywordCoverage(
      simulation.openingTurn,
      scenario.expectations.sourceKeywords
    );
    const difficultyScore =
      simulation.difficultyBand === scenario.expectations.expectedDifficultyBand
        ? 1
        : 0;

    const totalScore =
      mean([gapScore, misconceptionScore, sourceScore, difficultyScore]) * 100;

    const usedSource = simulation.signals.sources[0]?.name ?? "none";
    const usedMisconception = simulation.signals.misconceptions[0] ?? "none";

    return {
      id,
      label,
      summary: `${simulation.difficultyBand} opening that ${misconceptionScore > 0 ? "recalls" : "misses"} the target misconception and ${sourceScore > 0 ? "uses" : "does not use"} the committed source cue.`,
      totalScore: Number(totalScore.toFixed(2)),
      metrics: [
        makeMetric("gap_targeting", "Gap targeting", gapScore * 100),
        makeMetric(
          "misconception_recall",
          "Misconception recall",
          misconceptionScore * 100
        ),
        makeMetric(
          "difficulty_calibration",
          "Difficulty calibration",
          difficultyScore * 100
        ),
        makeMetric("source_grounding", "Source grounding", sourceScore * 100),
      ],
      highlights: [
        `Opening turn: ${simulation.openingTurn}`,
        `Primary misconception cue: ${usedMisconception}`,
        `Primary source cue: ${usedSource}`,
      ],
      details: {
        openingTurn: simulation.openingTurn,
        difficultyBand: simulation.difficultyBand,
        masteryPercent: simulation.signals.masteryPercent,
        misconceptionCount: simulation.signals.misconceptions.length,
        sourceCount: simulation.signals.sources.length,
        promptLength: prompt.length,
      },
    };
  };

  const structuredVariant = buildVariant(
    "structured_context",
    "Structured context",
    structuredSimulation,
    structuredPrompt
  );
  const blankVariant = buildVariant(
    "blank_context",
    "Blank context",
    blankSimulation,
    blankPrompt
  );

  const delta =
    (structuredVariant.totalScore ?? 0) - (blankVariant.totalScore ?? 0);

  return {
    id: scenario.id,
    title: scenario.title,
    summary: scenario.summary,
    provenance: scenario.provenance,
    highlights: [
      `Structured minus blank score delta: ${delta.toFixed(2)} points.`,
      `Expected difficulty band: ${scenario.expectations.expectedDifficultyBand}.`,
    ],
    variants: [structuredVariant, blankVariant],
  };
}

export async function runStructuredContextVsBlankSuite(): Promise<EvalSuiteResult> {
  const scenarios = await Promise.all(
    STRUCTURED_CONTEXT_EVAL_FIXTURES.map((scenario) => runScenario(scenario))
  );

  const structuredScores = scenarios.map(
    (scenario) => scenario.variants[0].totalScore ?? 0
  );
  const blankScores = scenarios.map(
    (scenario) => scenario.variants[1].totalScore ?? 0
  );

  const structuredMean = mean(structuredScores);
  const blankMean = mean(blankScores);
  const deltas = structuredScores.map((score, index) => score - blankScores[index]);
  const structuredWins = deltas.filter((delta) => delta > 0).length;

  return {
    id: "structured-context-vs-blank",
    title: "Structured Context vs Blank Context",
    description:
      "Runs committed learner scenarios through the real structured prompt builder and a blank baseline prompt, then scores the resulting tutor opening with a deterministic rubric.",
    headlineMetrics: [
      makeMetric("structured_mean", "Structured mean score", structuredMean),
      makeMetric("blank_mean", "Blank mean score", blankMean),
      makeMetric(
        "mean_delta",
        "Mean structured lift",
        mean(deltas)
      ),
      {
        id: "structured_wins",
        label: "Structured scenario wins",
        value: structuredWins,
        unit: `/${scenarios.length}`,
        direction: "higher",
      },
    ],
    scenarios,
    proves: [
      "The committed learner-context fixtures contain enough structured signal for the current prompt assembly path to surface gap-specific, misconception-aware, source-grounded openings.",
      "The baseline path stays intentionally sparse, so score deltas are attributable to structured learner memory and retrieved sources rather than hidden live API calls.",
    ],
    doesNotProve: [
      "It does not prove a live Anthropic model will produce the same lift in production; the scorer is deterministic and prompt-grounded by design.",
      "It does not measure downstream learner outcomes like mastery gain or session completion yet; it only evaluates the opening-turn quality signal defined in these fixtures.",
    ],
  };
}

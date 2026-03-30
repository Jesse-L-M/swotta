import {
  createEvalRunReport,
  formatHumanReport,
} from "@/evals/core/report";
import type {
  EvalRunReport,
  EvalSuiteDefinition,
} from "@/evals/core/types";
import { runSchedulerQualitySuite } from "@/evals/suites/scheduler-quality";
import { runStructuredContextVsBlankSuite } from "@/evals/suites/structured-context-vs-blank";

const SUITES: EvalSuiteDefinition[] = [
  {
    id: "structured-context-vs-blank",
    title: "Structured Context vs Blank Context",
    run: runStructuredContextVsBlankSuite,
  },
  {
    id: "scheduler-quality-vs-baselines",
    title: "Scheduler Quality vs Baselines",
    run: runSchedulerQualitySuite,
  },
];

export function listEvalSuites(): EvalSuiteDefinition[] {
  return [...SUITES];
}

export function resolveSuiteSelection(selection: string): EvalSuiteDefinition[] {
  if (selection === "all") {
    return listEvalSuites();
  }

  const suite = SUITES.find((candidate) => candidate.id === selection);
  if (!suite) {
    throw new Error(
      `Unknown eval suite "${selection}". Available suites: ${SUITES.map((candidate) => candidate.id).join(", ")}`
    );
  }

  return [suite];
}

export async function runEvalSuites(
  selection = "all",
  generatedAt?: string
): Promise<EvalRunReport> {
  const suites = resolveSuiteSelection(selection);
  const results = await Promise.all(suites.map((suite) => suite.run()));
  return createEvalRunReport(results, generatedAt);
}

export { formatHumanReport };

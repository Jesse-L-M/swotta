import type {
  EvalMetric,
  EvalRunReport,
  EvalSuiteResult,
} from "@/evals/core/types";

function formatMetric(metric: EvalMetric): string {
  const fixed = Number.isInteger(metric.value)
    ? metric.value.toString()
    : metric.value.toFixed(2);

  if (!metric.unit) {
    return fixed;
  }

  if (metric.unit === "%") {
    return `${fixed}%`;
  }

  if (metric.unit.startsWith("/")) {
    return `${fixed} ${metric.unit}`;
  }

  return `${fixed} ${metric.unit}`;
}

function formatSuite(result: EvalSuiteResult): string[] {
  const lines = [
    `${result.title} (${result.id})`,
    result.description,
    "",
    "Headline metrics:",
    ...result.headlineMetrics.map(
      (metric) => `- ${metric.label}: ${formatMetric(metric)}`
    ),
    "",
    "What this does prove:",
    ...result.proves.map((line) => `- ${line}`),
    "",
    "What this does not prove:",
    ...result.doesNotProve.map((line) => `- ${line}`),
    "",
    "Scenarios:",
  ];

  for (const scenario of result.scenarios) {
    lines.push(`- ${scenario.id}: ${scenario.title}`);
    lines.push(`  ${scenario.summary}`);
    lines.push(`  Provenance: ${scenario.provenance}`);

    for (const highlight of scenario.highlights) {
      lines.push(`  ${highlight}`);
    }

    for (const variant of scenario.variants) {
      const scoreLine =
        typeof variant.totalScore === "number"
          ? ` (${variant.totalScore.toFixed(2)}/100)`
          : "";
      lines.push(`  ${variant.label}${scoreLine}: ${variant.summary}`);

      for (const metric of variant.metrics) {
        lines.push(`  ${metric.label}: ${formatMetric(metric)}`);
      }

      for (const highlight of variant.highlights) {
        lines.push(`  ${highlight}`);
      }
    }

    lines.push("");
  }

  return lines;
}

export function createEvalRunReport(
  suites: EvalSuiteResult[],
  generatedAt = new Date().toISOString()
): EvalRunReport {
  return {
    version: 1,
    generatedAt,
    suiteCount: suites.length,
    suites,
  };
}

export function formatHumanReport(report: EvalRunReport): string {
  const lines = [
    "Swotta eval report",
    `Generated: ${report.generatedAt}`,
    `Suites: ${report.suiteCount}`,
    "",
  ];

  report.suites.forEach((suite, index) => {
    if (index > 0) {
      lines.push("");
    }
    lines.push(...formatSuite(suite));
  });

  return lines.join("\n").trim();
}

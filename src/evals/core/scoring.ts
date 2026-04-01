import type { EvalMetric, MetricDirection } from "@/evals/core/types";

export function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function scoreKeywordCoverage(text: string, keywords: string[]): number {
  if (keywords.length === 0) {
    return 1;
  }

  const normalizedText = normalize(text);
  const matches = keywords.filter((keyword) =>
    normalizedText.includes(normalize(keyword))
  );

  return matches.length / keywords.length;
}

export function scoreForbiddenKeywordAbsence(
  text: string,
  forbiddenKeywords: string[]
): number {
  if (forbiddenKeywords.length === 0) {
    return 1;
  }

  const normalizedText = normalize(text);
  const cleanCount = forbiddenKeywords.filter(
    (keyword) => !normalizedText.includes(normalize(keyword))
  ).length;

  return cleanCount / forbiddenKeywords.length;
}

export function round(value: number): number {
  return Number(value.toFixed(2));
}

export function makeMetric(
  id: string,
  label: string,
  value: number,
  options?: {
    unit?: string;
    direction?: MetricDirection;
  }
): EvalMetric {
  return {
    id,
    label,
    value: round(value),
    unit: options?.unit ?? "/100",
    direction: options?.direction ?? "higher",
  };
}

export function unique(values: string[]): string[] {
  return [...new Set(values)];
}

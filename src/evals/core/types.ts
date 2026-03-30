export type MetricDirection = "higher" | "lower";

export interface EvalMetric {
  id: string;
  label: string;
  value: number;
  unit?: string;
  direction: MetricDirection;
}

export interface EvalVariantResult {
  id: string;
  label: string;
  summary: string;
  totalScore?: number | null;
  metrics: EvalMetric[];
  highlights: string[];
  details?: Record<string, unknown>;
}

export interface EvalScenarioResult {
  id: string;
  title: string;
  summary: string;
  provenance: string;
  highlights: string[];
  variants: EvalVariantResult[];
}

export interface EvalSuiteResult {
  id: string;
  title: string;
  description: string;
  headlineMetrics: EvalMetric[];
  scenarios: EvalScenarioResult[];
  proves: string[];
  doesNotProve: string[];
}

export interface EvalRunReport {
  version: 1;
  generatedAt: string;
  suiteCount: number;
  suites: EvalSuiteResult[];
}

export interface EvalSuiteDefinition {
  id: string;
  title: string;
  run: () => Promise<EvalSuiteResult>;
}

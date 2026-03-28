import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  extractCurriculumDraft,
  formatExtractionIssues,
} from "./extract";
import {
  formatNormalizationIssues,
  normalizeCurriculumDraft,
} from "./normalize";
import { renderCurriculumReviewReport } from "./review-report";
import { formatSeedResult, seedCurriculumFile } from "./seed";
import {
  formatValidationReport,
  validateCurriculumPackage,
} from "./validation";
import {
  formatVerificationResult,
  verifyCurriculumInput,
} from "./verify";

export const curriculumCommandNames = [
  "validate",
  "review-report",
  "seed",
  "verify",
  "extract",
  "normalize",
] as const;

export type CurriculumCommandName = (typeof curriculumCommandNames)[number];

export interface CurriculumCommandDefinition {
  name: CurriculumCommandName;
  description: string;
}

export interface CurriculumCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export const curriculumCommandDefinitions: CurriculumCommandDefinition[] = [
  {
    name: "validate",
    description: "Validate a canonical curriculum package or legacy seed JSON",
  },
  {
    name: "review-report",
    description:
      "Render a human-readable review report for a package or legacy seed JSON",
  },
  {
    name: "seed",
    description:
      "Seed an approved/reference package or legacy seed via the real loader",
  },
  {
    name: "verify",
    description:
      "Dry-run seed and downstream curriculum verification checks",
  },
  {
    name: "extract",
    description: "Extract a structured draft from supported curriculum source text",
  },
  {
    name: "normalize",
    description:
      "Normalize an extracted draft into the canonical curriculum package shape",
  },
];

function formatHelpText(): string {
  const lines = [
    "Usage: curriculum <command> [options]",
    "",
    "Commands:",
    ...curriculumCommandDefinitions.map(
      (definition) =>
        `  ${definition.name.padEnd(13)} ${definition.description}`
    ),
    "",
    "Seed and verify:",
    "  <path>             Path to an approved/reference package JSON or legacy seed JSON",
    "  verify             Runs as a dry run and rolls seeded rows back after checks",
    "",
    "Validate options:",
    "  --format=json    Print the validation report as JSON",
    "  --strict         Fail when warnings are present",
    "",
    "Normalize options:",
    "  --package-only   Print only the canonical package JSON",
  ];

  return lines.join("\n");
}

async function readJsonInput(filePath: string): Promise<
  | {
      absolutePath: string;
      input: unknown;
    }
  | {
      error: string;
    }
> {
  const absolutePath = path.resolve(process.cwd(), filePath);

  try {
    const fileContents = await readFile(absolutePath, "utf8");
    return {
      absolutePath,
      input: JSON.parse(fileContents) as unknown,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      error: `Unable to read ${filePath}: ${message}`,
    };
  }
}

async function runValidateCommand(
  args: string[]
): Promise<CurriculumCommandResult> {
  const filePath = args.find((arg) => !arg.startsWith("--"));
  const strict = args.includes("--strict");
  const jsonFormat = args.includes("--format=json");

  if (!filePath) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "validate requires a path to a JSON file",
    };
  }

  const jsonInput = await readJsonInput(filePath);
  if ("error" in jsonInput) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: jsonInput.error,
    };
  }

  const report = validateCurriculumPackage(jsonInput.input);
  const warningsMakeCommandFail = strict && report.warnings.length > 0;
  const exitCode = report.ok && !warningsMakeCommandFail ? 0 : 1;

  return {
    exitCode,
    stdout: jsonFormat
      ? `${JSON.stringify(report, null, 2)}\n`
      : `${formatValidationReport(report)}\n`,
    stderr: "",
  };
}

async function runReviewReportCommand(
  args: string[]
): Promise<CurriculumCommandResult> {
  const filePath = args.find((arg) => !arg.startsWith("--"));

  if (!filePath) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "review-report requires a path to a JSON file",
    };
  }

  const jsonInput = await readJsonInput(filePath);
  if ("error" in jsonInput) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: jsonInput.error,
    };
  }

  const renderedReport = renderCurriculumReviewReport(jsonInput.input);

  return {
    exitCode: renderedReport.report.ok ? 0 : 1,
    stdout: `${renderedReport.text}\n`,
    stderr: "",
  };
}

async function runSeedCommand(
  args: string[]
): Promise<CurriculumCommandResult> {
  const filePath = args.find((arg) => !arg.startsWith("--"));

  if (!filePath) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "seed requires a path to a JSON file",
    };
  }

  try {
    const result = await seedCurriculumFile(filePath);
    return {
      exitCode: 0,
      stdout: `${formatSeedResult(result)}\n`,
      stderr: "",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: 1,
      stdout: "",
      stderr: message,
    };
  }
}

async function runVerifyCommand(
  args: string[]
): Promise<CurriculumCommandResult> {
  const filePath = args.find((arg) => !arg.startsWith("--"));

  if (!filePath) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "verify requires a path to a JSON file",
    };
  }

  const jsonInput = await readJsonInput(filePath);
  if ("error" in jsonInput) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: jsonInput.error,
    };
  }

  try {
    const verificationResult = await verifyCurriculumInput(jsonInput.input);
    return {
      exitCode: verificationResult.ok ? 0 : 1,
      stdout: `${formatVerificationResult(verificationResult)}\n`,
      stderr: "",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: 1,
      stdout: "",
      stderr: message,
    };
  }
}

async function runExtractCommand(
  args: string[]
): Promise<CurriculumCommandResult> {
  const filePath = args.find((arg) => !arg.startsWith("--"));

  if (!filePath) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "extract requires a path to a JSON request file",
    };
  }

  const jsonInput = await readJsonInput(filePath);
  if ("error" in jsonInput) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: jsonInput.error,
    };
  }

  const result = await extractCurriculumDraft(jsonInput.input, {
    baseDirectory: path.dirname(jsonInput.absolutePath),
  });

  if (!result.draft) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: formatExtractionIssues(result.errors, result.warnings),
    };
  }

  return {
    exitCode: 0,
    stdout: `${JSON.stringify(result.draft, null, 2)}\n`,
    stderr:
      result.warnings.length > 0
        ? formatExtractionIssues([], result.warnings)
        : "",
  };
}

async function runNormalizeCommand(
  args: string[]
): Promise<CurriculumCommandResult> {
  const filePath = args.find((arg) => !arg.startsWith("--"));
  const packageOnly = args.includes("--package-only");

  if (!filePath) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "normalize requires a path to an extracted draft JSON file",
    };
  }

  const jsonInput = await readJsonInput(filePath);
  if ("error" in jsonInput) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: jsonInput.error,
    };
  }

  const result = normalizeCurriculumDraft(jsonInput.input);

  return {
    exitCode: result.ok ? 0 : 1,
    stdout: packageOnly
      ? result.package
        ? `${JSON.stringify(result.package, null, 2)}\n`
        : ""
      : `${JSON.stringify(result, null, 2)}\n`,
    stderr: formatNormalizationIssues(result),
  };
}

export async function runCurriculumCommand(
  argv: string[]
): Promise<CurriculumCommandResult> {
  const [command, ...args] = argv;

  if (!command || command === "help" || command === "--help") {
    return {
      exitCode: 0,
      stdout: `${formatHelpText()}\n`,
      stderr: "",
    };
  }

  switch (command) {
    case "validate":
      return runValidateCommand(args);
    case "review-report":
      return runReviewReportCommand(args);
    case "seed":
      return runSeedCommand(args);
    case "verify":
      return runVerifyCommand(args);
    case "extract":
      return runExtractCommand(args);
    case "normalize":
      return runNormalizeCommand(args);
    default:
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Unknown curriculum command: ${command}\n\n${formatHelpText()}`,
      };
  }
}

export function getCurriculumHelpText(): string {
  return formatHelpText();
}

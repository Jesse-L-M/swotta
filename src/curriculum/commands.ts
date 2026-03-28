import { readFile } from "node:fs/promises";
import path from "node:path";
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
    description: "Seed and run downstream curriculum verification checks",
  },
  {
    name: "extract",
    description: "Reserved command surface for source extraction",
  },
  {
    name: "normalize",
    description: "Reserved command surface for canonical package normalization",
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
    "",
    "Validate options:",
    "  --format=json    Print the validation report as JSON",
    "  --strict         Fail when warnings are present",
  ];

  return lines.join("\n");
}

function notImplementedCommand(
  commandName: Exclude<
    CurriculumCommandName,
    "validate" | "review-report" | "seed" | "verify"
  >
): CurriculumCommandResult {
  return {
    exitCode: 2,
    stdout: "",
    stderr: `${commandName} is not implemented yet. The command surface is reserved and stable.`,
  };
}

async function readCurriculumInputFile(
  filePath: string
): Promise<{ input: unknown } | { error: string }> {
  const absolutePath = path.resolve(process.cwd(), filePath);

  try {
    const fileContents = await readFile(absolutePath, "utf8");
    return {
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

  const result = await readCurriculumInputFile(filePath);
  if ("error" in result) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: result.error,
    };
  }

  const report = validateCurriculumPackage(result.input);
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

  const result = await readCurriculumInputFile(filePath);
  if ("error" in result) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: result.error,
    };
  }

  const renderedReport = renderCurriculumReviewReport(result.input);

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

  const result = await readCurriculumInputFile(filePath);
  if ("error" in result) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: result.error,
    };
  }

  try {
    const verificationResult = await verifyCurriculumInput(result.input);
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
    case "normalize":
      return notImplementedCommand(command);
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

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  formatValidationReport,
  validateCurriculumPackage,
} from "./validation";

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
    description: "Reserved command surface for rendered review artifacts",
  },
  {
    name: "seed",
    description: "Reserved command surface for idempotent package seeding",
  },
  {
    name: "verify",
    description: "Reserved command surface for downstream curriculum checks",
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
    "Validate options:",
    "  --format=json    Print the validation report as JSON",
    "  --strict         Fail when warnings are present",
  ];

  return lines.join("\n");
}

function notImplementedCommand(commandName: Exclude<CurriculumCommandName, "validate">): CurriculumCommandResult {
  return {
    exitCode: 2,
    stdout: "",
    stderr: `${commandName} is not implemented yet. The command surface is reserved and stable.`,
  };
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

  const absolutePath = path.resolve(process.cwd(), filePath);
  let input: unknown;

  try {
    const fileContents = await readFile(absolutePath, "utf8");
    input = JSON.parse(fileContents) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Unable to read ${filePath}: ${message}`,
    };
  }

  const report = validateCurriculumPackage(input);
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
    case "seed":
    case "verify":
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

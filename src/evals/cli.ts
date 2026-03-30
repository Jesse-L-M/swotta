import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { formatHumanReport, runEvalSuites } from "@/evals";

interface CliOptions {
  selection: string;
  outputDir: string | null;
  format: "human" | "json";
}

function parseArgs(argv: string[]): CliOptions {
  let selection = "all";
  let outputDir: string | null = path.resolve(process.cwd(), ".context/evals");
  let format: "human" | "json" = "human";

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (!arg) {
      continue;
    }

    if (arg === "--suite") {
      selection = argv[index + 1] ?? selection;
      index++;
      continue;
    }

    if (arg === "--output-dir") {
      outputDir = argv[index + 1]
        ? path.resolve(process.cwd(), argv[index + 1])
        : outputDir;
      index++;
      continue;
    }

    if (arg === "--no-write") {
      outputDir = null;
      continue;
    }

    if (arg === "--format") {
      const candidate = argv[index + 1];
      if (candidate === "human" || candidate === "json") {
        format = candidate;
      }
      index++;
      continue;
    }

    if (!arg.startsWith("--")) {
      selection = arg;
    }
  }

  return {
    selection,
    outputDir,
    format,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const report = await runEvalSuites(options.selection);
  const human = formatHumanReport(report);
  const json = JSON.stringify(report, null, 2);

  if (options.outputDir) {
    await mkdir(options.outputDir, { recursive: true });
    const safeSelection = options.selection.replace(/[^a-z0-9-]/gi, "_");
    const stamp = report.generatedAt.replace(/[:.]/g, "-");
    const jsonPath = path.join(options.outputDir, `${stamp}-${safeSelection}.json`);
    const humanPath = path.join(options.outputDir, `${stamp}-${safeSelection}.md`);

    await writeFile(jsonPath, json);
    await writeFile(humanPath, human);

    if (options.format === "human") {
      process.stdout.write(`${human}\n\nArtifacts:\n- ${humanPath}\n- ${jsonPath}\n`);
      return;
    }
  }

  process.stdout.write(options.format === "json" ? `${json}\n` : `${human}\n`);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

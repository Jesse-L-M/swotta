#!/usr/bin/env node

import { writeSync } from "node:fs";
import { runCurriculumCommand } from "./commands";

async function main(): Promise<void> {
  const result = await runCurriculumCommand(process.argv.slice(2));

  if (result.stdout) {
    writeSync(1, result.stdout);
  }

  if (result.stderr) {
    writeSync(2, `${result.stderr}\n`);
  }

  process.exit(result.exitCode);
}

void main();

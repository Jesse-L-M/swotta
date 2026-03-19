import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { retrieveChunks } from "@/engine/ingestion";
import { configureSessionRunner } from "@/engine/session";

let isConfigured = false;

export function ensureSessionRunnerConfigured(): void {
  if (isConfigured) {
    return;
  }

  configureSessionRunner({
    db,
    anthropic: new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    }),
    retrieveChunks,
  });

  isConfigured = true;
}

export function resetSessionRunnerConfiguration(): void {
  isConfigured = false;
}

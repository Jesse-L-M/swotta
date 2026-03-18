"use client";

import { cn } from "@/lib/utils";
import type { SessionPhase } from "./use-study-session";

export interface ProgressIndicatorProps {
  phase: SessionPhase;
  messagesCount: number;
  topicName: string;
  blockTypeLabel: string;
}

const PHASE_STEPS: Array<{
  key: SessionPhase | SessionPhase[];
  label: string;
}> = [
  { key: "confidence-before", label: "Rate confidence" },
  { key: ["active", "streaming"], label: "Study" },
  { key: ["completing", "confidence-after"], label: "Reflect" },
  { key: "complete", label: "Done" },
];

function isPhaseComplete(
  stepKey: SessionPhase | SessionPhase[],
  currentPhase: SessionPhase
): boolean {
  const phaseOrder: SessionPhase[] = [
    "loading",
    "confidence-before",
    "active",
    "streaming",
    "completing",
    "confidence-after",
    "complete",
  ];

  const currentIdx = phaseOrder.indexOf(currentPhase);
  const keys = Array.isArray(stepKey) ? stepKey : [stepKey];
  const stepMaxIdx = Math.max(...keys.map((k) => phaseOrder.indexOf(k)));

  return currentIdx > stepMaxIdx;
}

function isPhaseActive(
  stepKey: SessionPhase | SessionPhase[],
  currentPhase: SessionPhase
): boolean {
  const keys = Array.isArray(stepKey) ? stepKey : [stepKey];
  return keys.includes(currentPhase);
}

export function ProgressIndicator({
  phase,
  messagesCount,
  topicName,
  blockTypeLabel,
}: ProgressIndicatorProps) {
  return (
    <div data-testid="progress-indicator">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">{blockTypeLabel}</h1>
          <p className="text-sm text-muted-foreground">{topicName}</p>
        </div>
        {messagesCount > 0 && (
          <span
            className="text-xs text-muted-foreground"
            data-testid="message-count"
          >
            {messagesCount} {messagesCount === 1 ? "message" : "messages"}
          </span>
        )}
      </div>

      <div className="flex gap-1">
        {PHASE_STEPS.map((step) => {
          const complete = isPhaseComplete(step.key, phase);
          const active = isPhaseActive(step.key, phase);

          return (
            <div key={step.label} className="flex-1">
              <div
                className={cn(
                  "h-1 rounded-full transition-colors",
                  complete
                    ? "bg-teal-500"
                    : active
                      ? "bg-teal-300"
                      : "bg-muted"
                )}
                data-testid={`step-${step.label}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { isPhaseComplete, isPhaseActive, PHASE_STEPS };

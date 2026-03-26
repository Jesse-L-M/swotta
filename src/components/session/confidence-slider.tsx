"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ConfidenceSliderProps {
  label: string;
  description: string;
  onSubmit: (value: number) => void;
}

const CONFIDENCE_LEVELS = [
  { value: 1, label: "Not at all", emoji: "1" },
  { value: 2, label: "A little", emoji: "2" },
  { value: 3, label: "Somewhat", emoji: "3" },
  { value: 4, label: "Mostly", emoji: "4" },
  { value: 5, label: "Very", emoji: "5" },
] as const;

export function ConfidenceSlider({
  label,
  description,
  onSubmit,
}: ConfidenceSliderProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const selectedLevel = CONFIDENCE_LEVELS.find(
    (level) => level.value === selected
  );

  return (
    <div
      className="mx-auto flex w-full max-w-md flex-col items-center gap-6 px-4 py-6 sm:px-6"
      data-testid="confidence-slider"
    >
      <div className="text-center">
        <h2 className="text-lg font-semibold">{label}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      <div
        className="flex w-full justify-between gap-2"
        role="radiogroup"
        aria-label={label}
      >
        {CONFIDENCE_LEVELS.map((level) => (
          <button
            key={level.value}
            type="button"
            role="radio"
            aria-checked={selected === level.value}
            aria-label={level.label}
            onClick={() => setSelected(level.value)}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl border-2 px-2 py-3 text-center transition-all sm:px-3",
              selected === level.value
                ? "border-teal-500 bg-teal-50 text-teal-700"
                : "border-border hover:border-muted-foreground/30"
            )}
            data-testid={`confidence-${level.value}`}
          >
            <span className="text-lg font-bold">{level.emoji}</span>
            <span className="hidden text-xs leading-tight sm:block">
              {level.label}
            </span>
          </button>
        ))}
      </div>

      <div className="flex w-full items-center justify-between text-xs text-muted-foreground sm:hidden">
        <span>Not at all</span>
        <span>Very</span>
      </div>

      {selectedLevel ? (
        <p
          className="text-sm font-medium text-foreground sm:hidden"
          data-testid="confidence-selection-label"
        >
          {selectedLevel.label}
        </p>
      ) : null}

      <Button
        disabled={selected === null}
        onClick={() => {
          if (selected !== null) onSubmit(selected / 5);
        }}
        className="w-full"
        size="lg"
        data-testid="confidence-submit"
      >
        Continue
      </Button>
    </div>
  );
}

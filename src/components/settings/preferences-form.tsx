"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  preferencesSchema,
  SESSION_MINUTE_OPTIONS,
  DIFFICULTY_OPTIONS,
  STUDY_TIME_OPTIONS,
  DIFFICULTY_LABELS,
  STUDY_TIME_LABELS,
  type PreferencesInput,
} from "./settings-schemas";

interface PreferencesFormProps {
  initialValues: PreferencesInput;
  onSave: (
    values: PreferencesInput
  ) => Promise<{ success: boolean; error?: string }>;
  disabled?: boolean;
}

export function PreferencesForm({
  initialValues,
  onSave,
  disabled = false,
}: PreferencesFormProps) {
  const [values, setValues] = useState<PreferencesInput>(initialValues);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSuccess(false);

      const result = preferencesSchema.safeParse(values);
      if (!result.success) {
        setError(result.error.issues[0]?.message ?? "Invalid input");
        return;
      }

      setSaving(true);
      try {
        const saveResult = await onSave(result.data);
        if (!saveResult.success) {
          setError(saveResult.error ?? "Failed to save preferences");
          return;
        }

        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to save preferences"
        );
      } finally {
        setSaving(false);
      }
    },
    [values, onSave]
  );

  const isDisabled = disabled || saving;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-5">
        <div className="space-y-2">
          <label
            htmlFor="sessionMinutes"
            className="text-sm font-medium text-[#1A1917]"
          >
            Preferred session length
          </label>
          <select
            id="sessionMinutes"
            value={values.preferredSessionMinutes}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                preferredSessionMinutes: Number(e.target.value) as PreferencesInput["preferredSessionMinutes"],
              }))
            }
            disabled={isDisabled}
            className="w-full rounded-[8px] border border-[#E5E0D6] bg-[#FFFCF8] px-3 py-2.5 text-sm text-[#1A1917] focus:border-[#2D7A6E] focus:outline-none focus:ring-1 focus:ring-[#2D7A6E] disabled:cursor-not-allowed disabled:bg-[#F0ECE4] disabled:text-[#949085]"
          >
            {SESSION_MINUTE_OPTIONS.map((min) => (
              <option key={min} value={min}>
                {min} minutes
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="difficulty"
            className="text-sm font-medium text-[#1A1917]"
          >
            Preferred difficulty
          </label>
          <select
            id="difficulty"
            value={values.preferredDifficulty}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                preferredDifficulty: Number(e.target.value) as PreferencesInput["preferredDifficulty"],
              }))
            }
            disabled={isDisabled}
            className="w-full rounded-[8px] border border-[#E5E0D6] bg-[#FFFCF8] px-3 py-2.5 text-sm text-[#1A1917] focus:border-[#2D7A6E] focus:outline-none focus:ring-1 focus:ring-[#2D7A6E] disabled:cursor-not-allowed disabled:bg-[#F0ECE4] disabled:text-[#949085]"
          >
            {DIFFICULTY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABELS[d]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="studyTime"
            className="text-sm font-medium text-[#1A1917]"
          >
            Preferred study time
          </label>
          <select
            id="studyTime"
            value={values.preferredStudyTime}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                preferredStudyTime: e.target.value as PreferencesInput["preferredStudyTime"],
              }))
            }
            disabled={isDisabled}
            className="w-full rounded-[8px] border border-[#E5E0D6] bg-[#FFFCF8] px-3 py-2.5 text-sm text-[#1A1917] focus:border-[#2D7A6E] focus:outline-none focus:ring-1 focus:ring-[#2D7A6E] disabled:cursor-not-allowed disabled:bg-[#F0ECE4] disabled:text-[#949085]"
          >
            {STUDY_TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {STUDY_TIME_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="weeklyGoal"
            className="text-sm font-medium text-[#1A1917]"
          >
            Weekly study goal (minutes)
          </label>
          <input
            id="weeklyGoal"
            type="number"
            min={30}
            max={1200}
            step={15}
            value={values.weeklyGoalMinutes}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                weeklyGoalMinutes: Number(e.target.value),
              }))
            }
            disabled={isDisabled}
            className="w-full rounded-[8px] border border-[#E5E0D6] bg-[#FFFCF8] px-3 py-2.5 text-sm text-[#1A1917] focus:border-[#2D7A6E] focus:outline-none focus:ring-1 focus:ring-[#2D7A6E] disabled:cursor-not-allowed disabled:bg-[#F0ECE4] disabled:text-[#949085]"
          />
          <p className="text-xs text-[#5C5950]">
            {Math.round((values.weeklyGoalMinutes / 60) * 10) / 10} hours per
            week
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-[12px] border border-[#E5E0D6] bg-[#FAF6F0] px-4 py-3">
          <input
            id="studyReminders"
            type="checkbox"
            checked={values.studyReminders}
            onChange={(e) =>
              setValues((v) => ({ ...v, studyReminders: e.target.checked }))
            }
            disabled={isDisabled}
            className="mt-0.5 size-4 rounded border-[#CFC8BB] text-[#2D7A6E] accent-[#2D7A6E]"
          />
          <div className="space-y-1">
            <label
              htmlFor="studyReminders"
              className="block text-sm font-medium text-[#1A1917]"
            >
              Enable study reminders
            </label>
            <p className="block text-xs leading-5 text-[#5C5950]">
              Keep revision nudges turned on when you want Swotta to help you
              hold your weekly goal.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-[8px] border-l-[3px] border-[#D4654A] bg-[#FAEAE5] px-4 py-3 text-sm text-[#D4654A]"
        >
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-[8px] border-l-[3px] border-[#2D7A6E] bg-[#E4F0ED] px-4 py-3 text-sm text-[#2D7A6E]">
          Preferences saved
        </div>
      )}

      <Button
        type="submit"
        disabled={isDisabled}
        className="h-10 rounded-[8px] bg-[#2D7A6E] px-5 text-sm font-medium text-white hover:bg-[#256860]"
      >
        {saving ? "Saving..." : "Save preferences"}
      </Button>
    </form>
  );
}

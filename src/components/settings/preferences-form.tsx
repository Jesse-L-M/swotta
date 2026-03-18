"use client";

import { useState, useCallback } from "react";
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
  onSave: (values: PreferencesInput) => Promise<void>;
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
        await onSave(result.data);
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
      <div className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="sessionMinutes"
            className="text-sm font-medium"
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
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
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
            className="text-sm font-medium"
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
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
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
            className="text-sm font-medium"
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
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
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
            className="text-sm font-medium"
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
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          <p className="text-xs text-muted-foreground">
            {Math.round(values.weeklyGoalMinutes / 60 * 10) / 10} hours per week
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            id="studyReminders"
            type="checkbox"
            checked={values.studyReminders}
            onChange={(e) =>
              setValues((v) => ({ ...v, studyReminders: e.target.checked }))
            }
            disabled={isDisabled}
            className="size-4 rounded border-input"
          />
          <label
            htmlFor="studyReminders"
            className="text-sm font-medium"
          >
            Enable study reminders
          </label>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400">
          Preferences saved
        </div>
      )}

      <Button type="submit" disabled={isDisabled}>
        {saving ? "Saving..." : "Save preferences"}
      </Button>
    </form>
  );
}

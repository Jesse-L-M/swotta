"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  notificationConfigSchema,
  type NotificationConfigInput,
} from "./settings-schemas";

interface NotificationConfigProps {
  initialValues: NotificationConfigInput;
  onSave: (values: NotificationConfigInput) => Promise<void>;
  disabled?: boolean;
}

export function NotificationConfig({
  initialValues,
  onSave,
  disabled = false,
}: NotificationConfigProps) {
  const [values, setValues] = useState<NotificationConfigInput>(initialValues);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSuccess(false);

      const result = notificationConfigSchema.safeParse(values);
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
          err instanceof Error ? err.message : "Failed to save notification settings"
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
        <div className="flex items-center gap-3">
          <input
            id="weeklyReport"
            type="checkbox"
            checked={values.receivesWeeklyReport}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                receivesWeeklyReport: e.target.checked,
              }))
            }
            disabled={isDisabled}
            className="size-4 rounded border-input"
          />
          <div>
            <label
              htmlFor="weeklyReport"
              className="text-sm font-medium"
            >
              Weekly progress report
            </label>
            <p className="text-xs text-muted-foreground">
              Receive a summary of study activity and mastery changes each week
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            id="safetyFlags"
            type="checkbox"
            checked={values.receivesFlags}
            onChange={(e) =>
              setValues((v) => ({ ...v, receivesFlags: e.target.checked }))
            }
            disabled={isDisabled}
            className="size-4 rounded border-input"
          />
          <div>
            <label
              htmlFor="safetyFlags"
              className="text-sm font-medium"
            >
              Safety and engagement alerts
            </label>
            <p className="text-xs text-muted-foreground">
              Get notified about disengagement, avoidance patterns, or other concerns
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400">
          Notification settings saved
        </div>
      )}

      <Button type="submit" disabled={isDisabled}>
        {saving ? "Saving..." : "Save notification settings"}
      </Button>
    </form>
  );
}

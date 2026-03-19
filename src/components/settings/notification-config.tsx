"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  notificationConfigSchema,
  type NotificationConfigInput,
} from "./settings-schemas";

interface NotificationConfigProps {
  initialValues: NotificationConfigInput;
  onSave: (
    values: NotificationConfigInput
  ) => Promise<{ success: boolean; error?: string }>;
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

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

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
        const saveResult = await onSave(result.data);
        if (!saveResult.success) {
          setError(
            saveResult.error ?? "Failed to save notification settings"
          );
          return;
        }

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
        <div className="flex items-start gap-3 rounded-[12px] border border-[#E5E0D6] bg-[#FAF6F0] px-4 py-3">
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
            className="mt-0.5 size-4 rounded border-[#CFC8BB] text-[#2D7A6E] accent-[#2D7A6E]"
          />
          <div className="space-y-1">
            <label
              htmlFor="weeklyReport"
              className="block text-sm font-medium text-[#1A1917]"
            >
              Weekly progress report
            </label>
            <p className="text-xs leading-5 text-[#5C5950]">
              Receive a summary of study activity and mastery changes each week
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-[12px] border border-[#E5E0D6] bg-[#FAF6F0] px-4 py-3">
          <input
            id="safetyFlags"
            type="checkbox"
            checked={values.receivesFlags}
            onChange={(e) =>
              setValues((v) => ({ ...v, receivesFlags: e.target.checked }))
            }
            disabled={isDisabled}
            className="mt-0.5 size-4 rounded border-[#CFC8BB] text-[#2D7A6E] accent-[#2D7A6E]"
          />
          <div className="space-y-1">
            <label
              htmlFor="safetyFlags"
              className="block text-sm font-medium text-[#1A1917]"
            >
              Safety and engagement alerts
            </label>
            <p className="text-xs leading-5 text-[#5C5950]">
              Get notified about disengagement, avoidance patterns, or other concerns
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
          Notification settings saved
        </div>
      )}

      <Button
        type="submit"
        disabled={isDisabled}
        className="h-10 rounded-[8px] bg-[#2D7A6E] px-5 text-sm font-medium text-white hover:bg-[#256860]"
      >
        {saving ? "Saving..." : "Save notification settings"}
      </Button>
    </form>
  );
}

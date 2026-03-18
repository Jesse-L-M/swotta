import { z } from "zod";

export const PREFERENCE_KEYS = {
  preferredSessionMinutes: "preferred_session_minutes",
  preferredDifficulty: "preferred_difficulty",
  preferredStudyTime: "preferred_study_time",
  studyReminders: "study_reminders",
  weeklyGoalMinutes: "weekly_goal_minutes",
} as const;

export const SESSION_MINUTE_OPTIONS = [15, 20, 30, 45, 60] as const;
export const DIFFICULTY_OPTIONS = [1, 2, 3, 4, 5] as const;
export const STUDY_TIME_OPTIONS = [
  "morning",
  "afternoon",
  "evening",
  "no_preference",
] as const;

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: "Very Easy",
  2: "Easy",
  3: "Medium",
  4: "Hard",
  5: "Very Hard",
};

export const STUDY_TIME_LABELS: Record<string, string> = {
  morning: "Morning (6am-12pm)",
  afternoon: "Afternoon (12pm-5pm)",
  evening: "Evening (5pm-10pm)",
  no_preference: "No preference",
};

export const preferencesSchema = z.object({
  preferredSessionMinutes: z
    .number()
    .refine(
      (v): v is (typeof SESSION_MINUTE_OPTIONS)[number] =>
        (SESSION_MINUTE_OPTIONS as readonly number[]).includes(v),
      { message: "Invalid session length" }
    ),
  preferredDifficulty: z
    .number()
    .refine(
      (v): v is (typeof DIFFICULTY_OPTIONS)[number] =>
        (DIFFICULTY_OPTIONS as readonly number[]).includes(v),
      { message: "Difficulty must be between 1 and 5" }
    ),
  preferredStudyTime: z.enum(STUDY_TIME_OPTIONS),
  studyReminders: z.boolean(),
  weeklyGoalMinutes: z
    .number()
    .min(30, "Weekly goal must be at least 30 minutes")
    .max(1200, "Weekly goal cannot exceed 20 hours"),
});

export type PreferencesInput = z.infer<typeof preferencesSchema>;

export const DEFAULT_PREFERENCES: PreferencesInput = {
  preferredSessionMinutes: 30,
  preferredDifficulty: 3,
  preferredStudyTime: "no_preference",
  studyReminders: true,
  weeklyGoalMinutes: 180,
};

export const notificationConfigSchema = z.object({
  receivesWeeklyReport: z.boolean(),
  receivesFlags: z.boolean(),
});

export type NotificationConfigInput = z.infer<typeof notificationConfigSchema>;

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfigInput = {
  receivesWeeklyReport: true,
  receivesFlags: true,
};

export function preferencesToDbRows(
  learnerId: string,
  prefs: PreferencesInput
): Array<{ learnerId: string; key: string; value: unknown; source: string }> {
  return [
    {
      learnerId,
      key: PREFERENCE_KEYS.preferredSessionMinutes,
      value: prefs.preferredSessionMinutes,
      source: "stated",
    },
    {
      learnerId,
      key: PREFERENCE_KEYS.preferredDifficulty,
      value: prefs.preferredDifficulty,
      source: "stated",
    },
    {
      learnerId,
      key: PREFERENCE_KEYS.preferredStudyTime,
      value: prefs.preferredStudyTime,
      source: "stated",
    },
    {
      learnerId,
      key: PREFERENCE_KEYS.studyReminders,
      value: prefs.studyReminders,
      source: "stated",
    },
    {
      learnerId,
      key: PREFERENCE_KEYS.weeklyGoalMinutes,
      value: prefs.weeklyGoalMinutes,
      source: "stated",
    },
  ];
}

export function dbRowsToPreferences(
  rows: Array<{ key: string; value: unknown }>
): PreferencesInput {
  const prefs = { ...DEFAULT_PREFERENCES };

  for (const row of rows) {
    switch (row.key) {
      case PREFERENCE_KEYS.preferredSessionMinutes:
        if (
          typeof row.value === "number" &&
          (SESSION_MINUTE_OPTIONS as readonly number[]).includes(row.value)
        ) {
          prefs.preferredSessionMinutes =
            row.value as PreferencesInput["preferredSessionMinutes"];
        }
        break;
      case PREFERENCE_KEYS.preferredDifficulty:
        if (
          typeof row.value === "number" &&
          (DIFFICULTY_OPTIONS as readonly number[]).includes(row.value)
        ) {
          prefs.preferredDifficulty =
            row.value as PreferencesInput["preferredDifficulty"];
        }
        break;
      case PREFERENCE_KEYS.preferredStudyTime:
        if (
          typeof row.value === "string" &&
          (STUDY_TIME_OPTIONS as readonly string[]).includes(row.value)
        ) {
          prefs.preferredStudyTime =
            row.value as PreferencesInput["preferredStudyTime"];
        }
        break;
      case PREFERENCE_KEYS.studyReminders:
        if (typeof row.value === "boolean") {
          prefs.studyReminders = row.value;
        }
        break;
      case PREFERENCE_KEYS.weeklyGoalMinutes:
        if (typeof row.value === "number" && row.value >= 30 && row.value <= 1200) {
          prefs.weeklyGoalMinutes = row.value;
        }
        break;
    }
  }

  return prefs;
}

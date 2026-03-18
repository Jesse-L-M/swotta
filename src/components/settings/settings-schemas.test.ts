import { describe, it, expect } from "vitest";
import {
  preferencesSchema,
  notificationConfigSchema,
  preferencesToDbRows,
  dbRowsToPreferences,
  DEFAULT_PREFERENCES,
  DEFAULT_NOTIFICATION_CONFIG,
  PREFERENCE_KEYS,
  SESSION_MINUTE_OPTIONS,
  DIFFICULTY_OPTIONS,
  STUDY_TIME_OPTIONS,
  DIFFICULTY_LABELS,
  STUDY_TIME_LABELS,
} from "./settings-schemas";

describe("preferencesSchema", () => {
  it("validates default preferences", () => {
    const result = preferencesSchema.safeParse(DEFAULT_PREFERENCES);
    expect(result.success).toBe(true);
  });

  it("validates all valid session minute options", () => {
    for (const minutes of SESSION_MINUTE_OPTIONS) {
      const result = preferencesSchema.safeParse({
        ...DEFAULT_PREFERENCES,
        preferredSessionMinutes: minutes,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid session minutes", () => {
    const result = preferencesSchema.safeParse({
      ...DEFAULT_PREFERENCES,
      preferredSessionMinutes: 25,
    });
    expect(result.success).toBe(false);
  });

  it("validates all difficulty options", () => {
    for (const diff of DIFFICULTY_OPTIONS) {
      const result = preferencesSchema.safeParse({
        ...DEFAULT_PREFERENCES,
        preferredDifficulty: diff,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects difficulty outside range", () => {
    const result = preferencesSchema.safeParse({
      ...DEFAULT_PREFERENCES,
      preferredDifficulty: 6,
    });
    expect(result.success).toBe(false);
  });

  it("rejects difficulty of 0", () => {
    const result = preferencesSchema.safeParse({
      ...DEFAULT_PREFERENCES,
      preferredDifficulty: 0,
    });
    expect(result.success).toBe(false);
  });

  it("validates all study time options", () => {
    for (const time of STUDY_TIME_OPTIONS) {
      const result = preferencesSchema.safeParse({
        ...DEFAULT_PREFERENCES,
        preferredStudyTime: time,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid study time", () => {
    const result = preferencesSchema.safeParse({
      ...DEFAULT_PREFERENCES,
      preferredStudyTime: "midnight",
    });
    expect(result.success).toBe(false);
  });

  it("validates boolean studyReminders", () => {
    const resultTrue = preferencesSchema.safeParse({
      ...DEFAULT_PREFERENCES,
      studyReminders: true,
    });
    const resultFalse = preferencesSchema.safeParse({
      ...DEFAULT_PREFERENCES,
      studyReminders: false,
    });
    expect(resultTrue.success).toBe(true);
    expect(resultFalse.success).toBe(true);
  });

  it("validates weekly goal in range", () => {
    const result = preferencesSchema.safeParse({
      ...DEFAULT_PREFERENCES,
      weeklyGoalMinutes: 300,
    });
    expect(result.success).toBe(true);
  });

  it("rejects weekly goal below minimum", () => {
    const result = preferencesSchema.safeParse({
      ...DEFAULT_PREFERENCES,
      weeklyGoalMinutes: 29,
    });
    expect(result.success).toBe(false);
  });

  it("rejects weekly goal above maximum", () => {
    const result = preferencesSchema.safeParse({
      ...DEFAULT_PREFERENCES,
      weeklyGoalMinutes: 1201,
    });
    expect(result.success).toBe(false);
  });

  it("accepts weekly goal at boundaries", () => {
    const min = preferencesSchema.safeParse({
      ...DEFAULT_PREFERENCES,
      weeklyGoalMinutes: 30,
    });
    const max = preferencesSchema.safeParse({
      ...DEFAULT_PREFERENCES,
      weeklyGoalMinutes: 1200,
    });
    expect(min.success).toBe(true);
    expect(max.success).toBe(true);
  });
});

describe("notificationConfigSchema", () => {
  it("validates default config", () => {
    const result = notificationConfigSchema.safeParse(
      DEFAULT_NOTIFICATION_CONFIG
    );
    expect(result.success).toBe(true);
  });

  it("validates all combinations", () => {
    for (const report of [true, false]) {
      for (const flags of [true, false]) {
        const result = notificationConfigSchema.safeParse({
          receivesWeeklyReport: report,
          receivesFlags: flags,
        });
        expect(result.success).toBe(true);
      }
    }
  });

  it("rejects missing fields", () => {
    const result = notificationConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean values", () => {
    const result = notificationConfigSchema.safeParse({
      receivesWeeklyReport: "yes",
      receivesFlags: true,
    });
    expect(result.success).toBe(false);
  });
});

describe("preferencesToDbRows", () => {
  it("converts preferences to database rows", () => {
    const rows = preferencesToDbRows("learner-1", DEFAULT_PREFERENCES);
    expect(rows).toHaveLength(5);

    const keys = rows.map((r) => r.key);
    expect(keys).toContain(PREFERENCE_KEYS.preferredSessionMinutes);
    expect(keys).toContain(PREFERENCE_KEYS.preferredDifficulty);
    expect(keys).toContain(PREFERENCE_KEYS.preferredStudyTime);
    expect(keys).toContain(PREFERENCE_KEYS.studyReminders);
    expect(keys).toContain(PREFERENCE_KEYS.weeklyGoalMinutes);
  });

  it("sets learner ID on all rows", () => {
    const rows = preferencesToDbRows("learner-42", DEFAULT_PREFERENCES);
    for (const row of rows) {
      expect(row.learnerId).toBe("learner-42");
    }
  });

  it("sets source to stated for all rows", () => {
    const rows = preferencesToDbRows("learner-1", DEFAULT_PREFERENCES);
    for (const row of rows) {
      expect(row.source).toBe("stated");
    }
  });

  it("preserves custom values", () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      preferredSessionMinutes: 45 as const,
      preferredDifficulty: 4 as const,
    };
    const rows = preferencesToDbRows("learner-1", prefs);

    const sessionRow = rows.find(
      (r) => r.key === PREFERENCE_KEYS.preferredSessionMinutes
    );
    expect(sessionRow?.value).toBe(45);

    const diffRow = rows.find(
      (r) => r.key === PREFERENCE_KEYS.preferredDifficulty
    );
    expect(diffRow?.value).toBe(4);
  });
});

describe("dbRowsToPreferences", () => {
  it("returns defaults for empty rows", () => {
    const prefs = dbRowsToPreferences([]);
    expect(prefs).toEqual(DEFAULT_PREFERENCES);
  });

  it("parses valid session minutes", () => {
    const prefs = dbRowsToPreferences([
      { key: PREFERENCE_KEYS.preferredSessionMinutes, value: 45 },
    ]);
    expect(prefs.preferredSessionMinutes).toBe(45);
  });

  it("ignores invalid session minutes", () => {
    const prefs = dbRowsToPreferences([
      { key: PREFERENCE_KEYS.preferredSessionMinutes, value: 25 },
    ]);
    expect(prefs.preferredSessionMinutes).toBe(
      DEFAULT_PREFERENCES.preferredSessionMinutes
    );
  });

  it("ignores non-number session minutes", () => {
    const prefs = dbRowsToPreferences([
      { key: PREFERENCE_KEYS.preferredSessionMinutes, value: "thirty" },
    ]);
    expect(prefs.preferredSessionMinutes).toBe(
      DEFAULT_PREFERENCES.preferredSessionMinutes
    );
  });

  it("parses valid difficulty", () => {
    const prefs = dbRowsToPreferences([
      { key: PREFERENCE_KEYS.preferredDifficulty, value: 5 },
    ]);
    expect(prefs.preferredDifficulty).toBe(5);
  });

  it("ignores invalid difficulty", () => {
    const prefs = dbRowsToPreferences([
      { key: PREFERENCE_KEYS.preferredDifficulty, value: 6 },
    ]);
    expect(prefs.preferredDifficulty).toBe(
      DEFAULT_PREFERENCES.preferredDifficulty
    );
  });

  it("ignores non-number difficulty", () => {
    const prefs = dbRowsToPreferences([
      { key: PREFERENCE_KEYS.preferredDifficulty, value: "hard" },
    ]);
    expect(prefs.preferredDifficulty).toBe(
      DEFAULT_PREFERENCES.preferredDifficulty
    );
  });

  it("parses valid study time", () => {
    const prefs = dbRowsToPreferences([
      { key: PREFERENCE_KEYS.preferredStudyTime, value: "morning" },
    ]);
    expect(prefs.preferredStudyTime).toBe("morning");
  });

  it("ignores invalid study time", () => {
    const prefs = dbRowsToPreferences([
      { key: PREFERENCE_KEYS.preferredStudyTime, value: "midnight" },
    ]);
    expect(prefs.preferredStudyTime).toBe(
      DEFAULT_PREFERENCES.preferredStudyTime
    );
  });

  it("ignores non-string study time", () => {
    const prefs = dbRowsToPreferences([
      { key: PREFERENCE_KEYS.preferredStudyTime, value: 42 },
    ]);
    expect(prefs.preferredStudyTime).toBe(
      DEFAULT_PREFERENCES.preferredStudyTime
    );
  });

  it("parses boolean study reminders", () => {
    const prefs = dbRowsToPreferences([
      { key: PREFERENCE_KEYS.studyReminders, value: false },
    ]);
    expect(prefs.studyReminders).toBe(false);
  });

  it("ignores non-boolean study reminders", () => {
    const prefs = dbRowsToPreferences([
      { key: PREFERENCE_KEYS.studyReminders, value: "yes" },
    ]);
    expect(prefs.studyReminders).toBe(DEFAULT_PREFERENCES.studyReminders);
  });

  it("parses valid weekly goal", () => {
    const prefs = dbRowsToPreferences([
      { key: PREFERENCE_KEYS.weeklyGoalMinutes, value: 300 },
    ]);
    expect(prefs.weeklyGoalMinutes).toBe(300);
  });

  it("ignores out-of-range weekly goal (too low)", () => {
    const prefs = dbRowsToPreferences([
      { key: PREFERENCE_KEYS.weeklyGoalMinutes, value: 10 },
    ]);
    expect(prefs.weeklyGoalMinutes).toBe(
      DEFAULT_PREFERENCES.weeklyGoalMinutes
    );
  });

  it("ignores out-of-range weekly goal (too high)", () => {
    const prefs = dbRowsToPreferences([
      { key: PREFERENCE_KEYS.weeklyGoalMinutes, value: 5000 },
    ]);
    expect(prefs.weeklyGoalMinutes).toBe(
      DEFAULT_PREFERENCES.weeklyGoalMinutes
    );
  });

  it("ignores non-number weekly goal", () => {
    const prefs = dbRowsToPreferences([
      { key: PREFERENCE_KEYS.weeklyGoalMinutes, value: "lots" },
    ]);
    expect(prefs.weeklyGoalMinutes).toBe(
      DEFAULT_PREFERENCES.weeklyGoalMinutes
    );
  });

  it("parses all fields together", () => {
    const prefs = dbRowsToPreferences([
      { key: PREFERENCE_KEYS.preferredSessionMinutes, value: 60 },
      { key: PREFERENCE_KEYS.preferredDifficulty, value: 1 },
      { key: PREFERENCE_KEYS.preferredStudyTime, value: "evening" },
      { key: PREFERENCE_KEYS.studyReminders, value: false },
      { key: PREFERENCE_KEYS.weeklyGoalMinutes, value: 600 },
    ]);
    expect(prefs).toEqual({
      preferredSessionMinutes: 60,
      preferredDifficulty: 1,
      preferredStudyTime: "evening",
      studyReminders: false,
      weeklyGoalMinutes: 600,
    });
  });

  it("ignores unknown keys", () => {
    const prefs = dbRowsToPreferences([
      { key: "unknown_key", value: "foo" },
    ]);
    expect(prefs).toEqual(DEFAULT_PREFERENCES);
  });

  it("accepts boundary weekly goals", () => {
    const prefsMin = dbRowsToPreferences([
      { key: PREFERENCE_KEYS.weeklyGoalMinutes, value: 30 },
    ]);
    expect(prefsMin.weeklyGoalMinutes).toBe(30);

    const prefsMax = dbRowsToPreferences([
      { key: PREFERENCE_KEYS.weeklyGoalMinutes, value: 1200 },
    ]);
    expect(prefsMax.weeklyGoalMinutes).toBe(1200);
  });
});

describe("constants", () => {
  it("DIFFICULTY_LABELS covers all options", () => {
    for (const opt of DIFFICULTY_OPTIONS) {
      expect(DIFFICULTY_LABELS[opt]).toBeDefined();
    }
  });

  it("STUDY_TIME_LABELS covers all options", () => {
    for (const opt of STUDY_TIME_OPTIONS) {
      expect(STUDY_TIME_LABELS[opt]).toBeDefined();
    }
  });

  it("PREFERENCE_KEYS has all expected keys", () => {
    expect(PREFERENCE_KEYS.preferredSessionMinutes).toBe(
      "preferred_session_minutes"
    );
    expect(PREFERENCE_KEYS.preferredDifficulty).toBe("preferred_difficulty");
    expect(PREFERENCE_KEYS.preferredStudyTime).toBe("preferred_study_time");
    expect(PREFERENCE_KEYS.studyReminders).toBe("study_reminders");
    expect(PREFERENCE_KEYS.weeklyGoalMinutes).toBe("weekly_goal_minutes");
  });
});

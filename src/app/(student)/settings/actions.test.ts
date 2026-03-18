import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "@/test/setup";
import type { Database } from "@/lib/db";
import {
  createTestOrg,
  createTestUser,
  createTestLearner,
  createTestGuardianLink,
} from "@/test/fixtures";
import {
  getPreferences,
  savePreferences,
  getNotificationConfig,
  saveNotificationConfig,
} from "./actions";
import {
  DEFAULT_PREFERENCES,
  DEFAULT_NOTIFICATION_CONFIG,
  PREFERENCE_KEYS,
  type PreferencesInput,
} from "@/components/settings/settings-schemas";

describe("settings actions", () => {
  let learnerId: string;
  let guardianUserId: string;
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    db = getTestDb();
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    learnerId = learner.id;
    const guardian = await createTestUser();
    await createTestGuardianLink(guardian.id, learnerId);
    guardianUserId = guardian.id;
  });

  describe("getPreferences", () => {
    it("returns defaults when no preferences are saved", async () => {
      const prefs = await getPreferences(learnerId, db);
      expect(prefs).toEqual(DEFAULT_PREFERENCES);
    });

    it("returns saved preferences", async () => {
      const input: PreferencesInput = {
        preferredSessionMinutes: 45,
        preferredDifficulty: 4,
        preferredStudyTime: "evening",
        studyReminders: false,
        weeklyGoalMinutes: 300,
      };
      await savePreferences(learnerId, input, db);

      const prefs = await getPreferences(learnerId, db);
      expect(prefs).toEqual(input);
    });
  });

  describe("savePreferences", () => {
    it("saves valid preferences", async () => {
      const input: PreferencesInput = {
        preferredSessionMinutes: 60,
        preferredDifficulty: 1,
        preferredStudyTime: "morning",
        studyReminders: true,
        weeklyGoalMinutes: 600,
      };

      const result = await savePreferences(learnerId, input, db);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("rejects invalid preferences", async () => {
      const invalid = {
        ...DEFAULT_PREFERENCES,
        preferredSessionMinutes: 25,
      };

      const result = await savePreferences(
        learnerId,
        invalid as PreferencesInput,
        db
      );
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("updates existing preferences (idempotent)", async () => {
      const first: PreferencesInput = {
        ...DEFAULT_PREFERENCES,
        preferredDifficulty: 2,
      };
      await savePreferences(learnerId, first, db);

      const second: PreferencesInput = {
        ...DEFAULT_PREFERENCES,
        preferredDifficulty: 5,
      };
      const result = await savePreferences(learnerId, second, db);
      expect(result.success).toBe(true);

      const prefs = await getPreferences(learnerId, db);
      expect(prefs.preferredDifficulty).toBe(5);
    });
  });

  describe("getNotificationConfig", () => {
    it("returns defaults when no guardian link exists", async () => {
      // Use a non-existent learner ID
      const config = await getNotificationConfig(
        guardianUserId,
        crypto.randomUUID(),
        db
      );
      expect(config).toEqual(DEFAULT_NOTIFICATION_CONFIG);
    });

    it("returns existing notification config", async () => {
      const config = await getNotificationConfig(
        guardianUserId,
        learnerId,
        db
      );
      expect(config.receivesWeeklyReport).toBe(true);
      expect(config.receivesFlags).toBe(true);
    });
  });

  describe("saveNotificationConfig", () => {
    it("saves valid notification config", async () => {
      const result = await saveNotificationConfig(
        guardianUserId,
        learnerId,
        { receivesWeeklyReport: false, receivesFlags: true },
        db
      );
      expect(result.success).toBe(true);

      const config = await getNotificationConfig(
        guardianUserId,
        learnerId,
        db
      );
      expect(config.receivesWeeklyReport).toBe(false);
      expect(config.receivesFlags).toBe(true);
    });

    it("rejects invalid notification config", async () => {
      const result = await saveNotificationConfig(
        guardianUserId,
        learnerId,
        { receivesWeeklyReport: "yes" } as unknown as {
          receivesWeeklyReport: boolean;
          receivesFlags: boolean;
        },
        db
      );
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("updates both fields", async () => {
      await saveNotificationConfig(
        guardianUserId,
        learnerId,
        { receivesWeeklyReport: false, receivesFlags: false },
        db
      );

      const config = await getNotificationConfig(
        guardianUserId,
        learnerId,
        db
      );
      expect(config.receivesWeeklyReport).toBe(false);
      expect(config.receivesFlags).toBe(false);
    });
  });

  describe("error handling", () => {
    it("savePreferences returns error on DB failure", async () => {
      // Use a non-existent learner ID to trigger FK violation
      const result = await savePreferences(
        crypto.randomUUID(),
        DEFAULT_PREFERENCES,
        db
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to save preferences");
    });

    it("saveNotificationConfig returns error on DB failure", async () => {
      // Create a mock DB that throws
      const failingDb = {
        update: () => {
          throw new Error("DB connection lost");
        },
      } as unknown as Database;

      const result = await saveNotificationConfig(
        guardianUserId,
        learnerId,
        { receivesWeeklyReport: true, receivesFlags: true },
        failingDb
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to save notification settings");
    });

    it("savePreferences handles non-Error thrown value", async () => {
      const failingDb = {
        transaction: () => {
          throw "string error";
        },
      } as unknown as Database;

      const result = await savePreferences(
        learnerId,
        DEFAULT_PREFERENCES,
        failingDb
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to save preferences");
    });
  });
});

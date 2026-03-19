import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDb } from "@/test/setup";
import type { Database } from "@/lib/db";
import { requireLearner } from "@/lib/auth";
import {
  createTestGuardianLink,
  createTestLearner,
  createTestOrg,
  createTestUser,
} from "@/test/fixtures";
import {
  getNotificationConfig,
  getPreferences,
  loadSettingsPageData,
  saveNotificationConfig,
  savePreferences,
} from "./actions";
import {
  DEFAULT_NOTIFICATION_CONFIG,
  DEFAULT_PREFERENCES,
  type PreferencesInput,
} from "@/components/settings/settings-schemas";

vi.mock("@/lib/auth", () => ({
  requireLearner: vi.fn(),
}));

type MockLearnerScope = {
  learnerId: string;
  orgId: string;
  user: {
    id: string;
    firebaseUid: string;
    email: string;
    name: string;
  };
  roles: Array<{ orgId: string; role: string }>;
};

const mockedRequireLearner = vi.mocked(requireLearner);

function mockLearnerScope(learnerId: string, orgId: string) {
  const scope: MockLearnerScope = {
    learnerId,
    orgId,
    user: {
      id: "current-user",
      firebaseUid: "firebase-current-user",
      email: "learner@example.com",
      name: "Current Learner",
    },
    roles: [{ orgId, role: "learner" }],
  };

  mockedRequireLearner.mockResolvedValue(
    scope as Awaited<ReturnType<typeof requireLearner>>
  );
}

describe("settings actions", () => {
  let learnerId: string;
  let orgId: string;
  let guardianUserId: string;
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = getTestDb();

    const org = await createTestOrg();
    orgId = org.id;

    const learner = await createTestLearner(org.id);
    learnerId = learner.id;

    const guardian = await createTestUser();
    guardianUserId = guardian.id;

    mockLearnerScope(learnerId, orgId);
  });

  describe("getPreferences", () => {
    it("returns defaults when no preferences are saved", async () => {
      const prefs = await getPreferences(db);
      expect(prefs).toEqual(DEFAULT_PREFERENCES);
    });

    it("returns the current learner's saved preferences", async () => {
      const input: PreferencesInput = {
        preferredSessionMinutes: 45,
        preferredDifficulty: 4,
        preferredStudyTime: "evening",
        studyReminders: false,
        weeklyGoalMinutes: 300,
      };

      await savePreferences(input, db);
      const prefs = await getPreferences(db);

      expect(prefs).toEqual(input);
    });

    it("does not leak another learner's preferences", async () => {
      const otherLearner = await createTestLearner(orgId);

      mockLearnerScope(otherLearner.id, orgId);
      await savePreferences(
        {
          ...DEFAULT_PREFERENCES,
          preferredDifficulty: 5,
        },
        db
      );

      mockLearnerScope(learnerId, orgId);
      const prefs = await getPreferences(db);

      expect(prefs).toEqual(DEFAULT_PREFERENCES);
    });
  });

  describe("savePreferences", () => {
    it("saves valid preferences for the current learner", async () => {
      const result = await savePreferences(
        {
          preferredSessionMinutes: 60,
          preferredDifficulty: 1,
          preferredStudyTime: "morning",
          studyReminders: true,
          weeklyGoalMinutes: 600,
        },
        db
      );

      expect(result).toEqual({ success: true });
      expect(await getPreferences(db)).toMatchObject({
        preferredSessionMinutes: 60,
        preferredDifficulty: 1,
        preferredStudyTime: "morning",
        studyReminders: true,
        weeklyGoalMinutes: 600,
      });
    });

    it("rejects invalid preferences", async () => {
      const result = await savePreferences(
        {
          ...DEFAULT_PREFERENCES,
          preferredSessionMinutes: 25,
        } as PreferencesInput,
        db
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid session length");
    });

    it("updates existing preferences idempotently", async () => {
      await savePreferences(
        {
          ...DEFAULT_PREFERENCES,
          preferredDifficulty: 2,
        },
        db
      );

      const result = await savePreferences(
        {
          ...DEFAULT_PREFERENCES,
          preferredDifficulty: 5,
        },
        db
      );

      expect(result).toEqual({ success: true });
      expect((await getPreferences(db)).preferredDifficulty).toBe(5);
    });

    it("returns an error when the database write fails", async () => {
      const failingDb = {
        transaction: () => {
          throw "string error";
        },
      } as unknown as Database;

      const result = await savePreferences(DEFAULT_PREFERENCES, failingDb);

      expect(result).toEqual({
        success: false,
        error: "Failed to save preferences",
      });
    });
  });

  describe("getNotificationConfig", () => {
    it("returns a no-guardians state when no guardian is linked", async () => {
      const config = await getNotificationConfig(db);

      expect(config).toEqual({
        mode: "no_guardians",
        guardianCount: 0,
        initialValues: DEFAULT_NOTIFICATION_CONFIG,
      });
    });

    it("returns the linked guardian config for the current learner", async () => {
      await createTestGuardianLink(guardianUserId, learnerId);

      const config = await getNotificationConfig(db);

      expect(config).toEqual({
        mode: "single_guardian",
        guardianCount: 1,
        initialValues: DEFAULT_NOTIFICATION_CONFIG,
      });
    });

    it("returns a multiple-guardians state when more than one guardian is linked", async () => {
      await createTestGuardianLink(guardianUserId, learnerId);
      const secondGuardian = await createTestUser();
      await createTestGuardianLink(secondGuardian.id, learnerId, "guardian");

      const config = await getNotificationConfig(db);

      expect(config).toEqual({
        mode: "multiple_guardians",
        guardianCount: 2,
        initialValues: DEFAULT_NOTIFICATION_CONFIG,
      });
    });
  });

  describe("saveNotificationConfig", () => {
    it("saves notification settings for a singly linked guardian", async () => {
      await createTestGuardianLink(guardianUserId, learnerId);

      const result = await saveNotificationConfig(
        { receivesWeeklyReport: false, receivesFlags: true },
        db
      );

      expect(result).toEqual({ success: true });
      expect(await getNotificationConfig(db)).toEqual({
        mode: "single_guardian",
        guardianCount: 1,
        initialValues: {
          receivesWeeklyReport: false,
          receivesFlags: true,
        },
      });
    });

    it("rejects invalid notification input", async () => {
      await createTestGuardianLink(guardianUserId, learnerId);

      const result = await saveNotificationConfig(
        { receivesWeeklyReport: "yes" } as unknown as {
          receivesWeeklyReport: boolean;
          receivesFlags: boolean;
        },
        db
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("returns an error when no guardian link exists", async () => {
      const result = await saveNotificationConfig(
        { receivesWeeklyReport: false, receivesFlags: false },
        db
      );

      expect(result).toEqual({
        success: false,
        error: "No linked guardian notification settings to update",
      });
    });

    it("returns an error when the learner has multiple guardians", async () => {
      await createTestGuardianLink(guardianUserId, learnerId);
      const secondGuardian = await createTestUser();
      await createTestGuardianLink(secondGuardian.id, learnerId, "guardian");

      const result = await saveNotificationConfig(
        { receivesWeeklyReport: false, receivesFlags: false },
        db
      );

      expect(result).toEqual({
        success: false,
        error:
          "This learner has multiple guardians. Notification controls still need a per-guardian settings flow.",
      });
      expect(await getNotificationConfig(db)).toEqual({
        mode: "multiple_guardians",
        guardianCount: 2,
        initialValues: DEFAULT_NOTIFICATION_CONFIG,
      });
    });

    it("returns an error when the notification update fails", async () => {
      await createTestGuardianLink(guardianUserId, learnerId);

      const failingDb = {
        select: () => ({
          from: () => ({
            where: async () => [
              {
                guardianUserId,
                receivesWeeklyReport: true,
                receivesFlags: true,
              },
            ],
          }),
        }),
        update: () => {
          throw new Error("DB connection lost");
        },
      } as unknown as Database;

      const result = await saveNotificationConfig(
        { receivesWeeklyReport: true, receivesFlags: true },
        failingDb
      );

      expect(result).toEqual({
        success: false,
        error: "Failed to save notification settings",
      });
    });
  });

  describe("loadSettingsPageData", () => {
    it("returns auth-scoped preferences and notification data together", async () => {
      await createTestGuardianLink(guardianUserId, learnerId);
      await savePreferences(
        {
          preferredSessionMinutes: 20,
          preferredDifficulty: 2,
          preferredStudyTime: "afternoon",
          studyReminders: true,
          weeklyGoalMinutes: 240,
        },
        db
      );

      const result = await loadSettingsPageData(db);

      expect(result).toEqual({
        preferences: {
          preferredSessionMinutes: 20,
          preferredDifficulty: 2,
          preferredStudyTime: "afternoon",
          studyReminders: true,
          weeklyGoalMinutes: 240,
        },
        notificationConfig: {
          mode: "single_guardian",
          guardianCount: 1,
          initialValues: DEFAULT_NOTIFICATION_CONFIG,
        },
      });
    });
  });
});

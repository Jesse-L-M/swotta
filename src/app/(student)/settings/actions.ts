"use server";

import { eq, and } from "drizzle-orm";
import { db, type Database } from "@/lib/db";
import { learnerPreferences, guardianLinks } from "@/db/schema";
import { structuredLog } from "@/lib/logger";
import { requireLearner } from "@/lib/auth";
import {
  preferencesSchema,
  notificationConfigSchema,
  preferencesToDbRows,
  dbRowsToPreferences,
  DEFAULT_NOTIFICATION_CONFIG,
  type PreferencesInput,
  type NotificationConfigInput,
} from "@/components/settings/settings-schemas";

type ActionResult = { success: true } | { success: false; error: string };

export interface NotificationConfigState {
  mode: "single_guardian" | "no_guardians" | "multiple_guardians";
  guardianCount: number;
  initialValues: NotificationConfigInput;
}

export interface SettingsPageData {
  preferences: PreferencesInput;
  notificationConfig: NotificationConfigState;
}

async function resolveCurrentLearnerId(
  database: Database
): Promise<string> {
  const { learnerId } = await requireLearner(database);
  return learnerId;
}

async function loadPreferencesForLearner(
  learnerId: string,
  database: Database
): Promise<PreferencesInput> {
  const rows = await database
    .select({ key: learnerPreferences.key, value: learnerPreferences.value })
    .from(learnerPreferences)
    .where(eq(learnerPreferences.learnerId, learnerId));

  return dbRowsToPreferences(
    rows.map((row) => ({ key: row.key, value: row.value }))
  );
}

async function loadGuardianNotificationLinks(
  learnerId: string,
  database: Database
) {
  return await database
    .select({
      guardianUserId: guardianLinks.guardianUserId,
      receivesWeeklyReport: guardianLinks.receivesWeeklyReport,
      receivesFlags: guardianLinks.receivesFlags,
    })
    .from(guardianLinks)
    .where(eq(guardianLinks.learnerId, learnerId));
}

async function loadNotificationConfigForLearner(
  learnerId: string,
  database: Database
): Promise<NotificationConfigState> {
  const links = await loadGuardianNotificationLinks(learnerId, database);

  if (links.length === 0) {
    return {
      mode: "no_guardians",
      guardianCount: 0,
      initialValues: DEFAULT_NOTIFICATION_CONFIG,
    };
  }

  if (links.length > 1) {
    return {
      mode: "multiple_guardians",
      guardianCount: links.length,
      initialValues: DEFAULT_NOTIFICATION_CONFIG,
    };
  }

  return {
    mode: "single_guardian",
    guardianCount: 1,
    initialValues: {
      receivesWeeklyReport: links[0].receivesWeeklyReport,
      receivesFlags: links[0].receivesFlags,
    },
  };
}

export async function getPreferences(
  database: Database = db
): Promise<PreferencesInput> {
  const learnerId = await resolveCurrentLearnerId(database);
  return await loadPreferencesForLearner(learnerId, database);
}

export async function savePreferences(
  input: PreferencesInput,
  database: Database = db
): Promise<ActionResult> {
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid preferences",
    };
  }

  const learnerId = await resolveCurrentLearnerId(database);
  const dbRows = preferencesToDbRows(learnerId, parsed.data);

  try {
    await database.transaction(async (tx) => {
      for (const row of dbRows) {
        await tx
          .insert(learnerPreferences)
          .values({
            learnerId: row.learnerId,
            key: row.key,
            value: row.value,
            source: row.source,
          })
          .onConflictDoUpdate({
            target: [learnerPreferences.learnerId, learnerPreferences.key],
            set: {
              value: row.value,
              source: row.source,
              updatedAt: new Date(),
            },
          });
      }
    });

    structuredLog("preferences.saved", { learnerId });
    return { success: true };
  } catch (err) {
    structuredLog("preferences.save_error", {
      learnerId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { success: false, error: "Failed to save preferences" };
  }
}

export async function getNotificationConfig(
  database: Database = db
): Promise<NotificationConfigState> {
  const learnerId = await resolveCurrentLearnerId(database);
  return await loadNotificationConfigForLearner(learnerId, database);
}

export async function saveNotificationConfig(
  input: NotificationConfigInput,
  database: Database = db
): Promise<ActionResult> {
  const parsed = notificationConfigSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ?? "Invalid notification settings",
    };
  }

  const learnerId = await resolveCurrentLearnerId(database);
  const links = await loadGuardianNotificationLinks(learnerId, database);

  if (links.length === 0) {
    return {
      success: false,
      error: "No linked guardian notification settings to update",
    };
  }

  if (links.length > 1) {
    return {
      success: false,
      error:
        "This learner has multiple guardians. Notification controls still need a per-guardian settings flow.",
    };
  }

  const guardianUserId = links[0].guardianUserId;

  try {
    await database
      .update(guardianLinks)
      .set({
        receivesWeeklyReport: parsed.data.receivesWeeklyReport,
        receivesFlags: parsed.data.receivesFlags,
      })
      .where(
        and(
          eq(guardianLinks.learnerId, learnerId),
          eq(guardianLinks.guardianUserId, guardianUserId)
        )
      );

    structuredLog("notification_config.saved", {
      guardianUserId,
      learnerId,
    });
    return { success: true };
  } catch (err) {
    structuredLog("notification_config.save_error", {
      guardianUserId,
      learnerId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { success: false, error: "Failed to save notification settings" };
  }
}

export async function loadSettingsPageData(
  database: Database = db
): Promise<SettingsPageData> {
  const learnerId = await resolveCurrentLearnerId(database);
  const [preferences, notificationConfig] = await Promise.all([
    loadPreferencesForLearner(learnerId, database),
    loadNotificationConfigForLearner(learnerId, database),
  ]);

  return {
    preferences,
    notificationConfig,
  };
}

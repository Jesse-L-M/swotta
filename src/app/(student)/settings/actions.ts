"use server";

import { eq } from "drizzle-orm";
import { db, type Database } from "@/lib/db";
import { learnerPreferences, guardianLinks } from "@/db/schema";
import { structuredLog } from "@/lib/logger";
import {
  preferencesSchema,
  notificationConfigSchema,
  preferencesToDbRows,
  dbRowsToPreferences,
  DEFAULT_NOTIFICATION_CONFIG,
  type PreferencesInput,
  type NotificationConfigInput,
} from "@/components/settings/settings-schemas";

export async function getPreferences(
  learnerId: string,
  database: Database = db
): Promise<PreferencesInput> {
  const rows = await database
    .select({ key: learnerPreferences.key, value: learnerPreferences.value })
    .from(learnerPreferences)
    .where(eq(learnerPreferences.learnerId, learnerId));

  return dbRowsToPreferences(
    rows.map((r) => ({ key: r.key, value: r.value }))
  );
}

export async function savePreferences(
  learnerId: string,
  input: PreferencesInput,
  database: Database = db
): Promise<{ success: boolean; error?: string }> {
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message };
  }

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
  guardianUserId: string,
  learnerId: string,
  database: Database = db
): Promise<NotificationConfigInput> {
  const links = await database
    .select({
      receivesWeeklyReport: guardianLinks.receivesWeeklyReport,
      receivesFlags: guardianLinks.receivesFlags,
    })
    .from(guardianLinks)
    .where(eq(guardianLinks.learnerId, learnerId))
    .limit(1);

  if (links.length === 0) {
    return DEFAULT_NOTIFICATION_CONFIG;
  }

  return {
    receivesWeeklyReport: links[0].receivesWeeklyReport,
    receivesFlags: links[0].receivesFlags,
  };
}

export async function saveNotificationConfig(
  guardianUserId: string,
  learnerId: string,
  input: NotificationConfigInput,
  database: Database = db
): Promise<{ success: boolean; error?: string }> {
  const parsed = notificationConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message };
  }

  try {
    await database
      .update(guardianLinks)
      .set({
        receivesWeeklyReport: parsed.data.receivesWeeklyReport,
        receivesFlags: parsed.data.receivesFlags,
      })
      .where(eq(guardianLinks.learnerId, learnerId));

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

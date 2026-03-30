import { redirect } from "next/navigation";
import { AuthError } from "@/lib/auth";
import { structuredLog } from "@/lib/logger";
import { PreferencesForm } from "@/components/settings/preferences-form";
import {
  loadSettingsPageData,
  savePreferences,
  type SettingsPageData,
} from "@/app/(student)/settings/actions";
import { requireStudentPageAuth } from "../student-page-auth";

export default async function SettingsPage() {
  await requireStudentPageAuth("/settings");

  let settingsData: SettingsPageData;
  try {
    settingsData = await loadSettingsPageData();
  } catch (error) {
    structuredLog("settings.page_load_error", {
      code: error instanceof AuthError ? error.code : "UNKNOWN",
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof AuthError) {
      redirect("/onboarding");
    }

    throw error;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <div className="overflow-hidden rounded-[20px] border border-[#E5E0D6] bg-[linear-gradient(135deg,_rgba(255,255,255,0.94)_0%,_rgba(250,246,240,0.96)_60%,_rgba(228,240,237,0.92)_100%)] px-6 py-8 shadow-[0_1px_3px_rgba(26,25,23,0.05)] sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#2D7A6E]">
            Settings
          </p>
          <h1 className="mt-4 font-[family-name:var(--font-serif)] text-3xl leading-tight text-[#1A1917] sm:text-4xl">
            Shape how Swotta supports your study.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5C5950] sm:text-base">
            Update your session rhythm, revision targets, and the family
            notifications tied to your progress.
          </p>
        </div>
      </div>

      <section className="space-y-6 rounded-[16px] border border-[#E5E0D6] bg-white p-6 shadow-[0_1px_3px_rgba(26,25,23,0.05)] sm:p-8">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#2D7A6E]">
            Study Preferences
          </p>
          <h2 className="font-[family-name:var(--font-serif)] text-2xl text-[#1A1917]">
            Set the pace for each study week.
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-[#5C5950]">
            These choices shape the default session length, difficulty target,
            study window, and reminder cadence across the learner experience.
          </p>
        </div>
        <PreferencesForm
          initialValues={settingsData.preferences}
          onSave={savePreferences}
        />
      </section>

      <section className="space-y-6 rounded-[16px] border border-[#E5E0D6] bg-white p-6 shadow-[0_1px_3px_rgba(26,25,23,0.05)] sm:p-8">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#D4654A]">
            Household Notifications
          </p>
          <h2 className="font-[family-name:var(--font-serif)] text-2xl text-[#1A1917]">
            Manage the linked guardian alerts.
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-[#5C5950]">
            These settings govern the weekly report and safety alerts that go to
            the guardian connections already attached to this learner.
          </p>
        </div>

        {settingsData.notificationConfig.mode === "single_guardian" ? (
          <div className="space-y-4 rounded-[12px] border border-[#E5E0D6] bg-[#FAF6F0] px-4 py-4">
            <p className="text-sm leading-6 text-[#5C5950]">
              Guardian notification preferences are managed from the linked
              guardian account. The current delivery settings are shown here for
              reference.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[10px] border border-[#E5E0D6] bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#949085]">
                  Weekly Progress Report
                </p>
                <p className="mt-2 text-sm font-medium text-[#1A1917]">
                  {settingsData.notificationConfig.initialValues
                    .receivesWeeklyReport
                    ? "Enabled"
                    : "Disabled"}
                </p>
              </div>
              <div className="rounded-[10px] border border-[#E5E0D6] bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#949085]">
                  Safety And Engagement Alerts
                </p>
                <p className="mt-2 text-sm font-medium text-[#1A1917]">
                  {settingsData.notificationConfig.initialValues.receivesFlags
                    ? "Enabled"
                    : "Disabled"}
                </p>
              </div>
            </div>
          </div>
        ) : settingsData.notificationConfig.mode === "no_guardians" ? (
          <div className="rounded-[8px] border-l-[3px] border-[#949085] bg-[#F0ECE4] px-4 py-3 text-sm text-[#5C5950]">
            No guardian is linked to this learner yet, so there are no family
            notifications to manage here.
          </div>
        ) : (
          <div className="rounded-[8px] border-l-[3px] border-[#D4654A] bg-[#FAEAE5] px-4 py-3 text-sm text-[#D4654A]">
            {settingsData.notificationConfig.guardianCount} guardians are linked
            to this learner. Each guardian will need to manage their own
            notification settings from the guardian account.
          </div>
        )}
      </section>
    </div>
  );
}

import { PreferencesForm } from "@/components/settings/preferences-form";
import { NotificationConfig } from "@/components/settings/notification-config";
import { DEFAULT_PREFERENCES, DEFAULT_NOTIFICATION_CONFIG } from "@/components/settings/settings-schemas";

// TODO: Get learnerId/guardianUserId from auth context (Task 2.1)
// For now, this renders with defaults. When auth is wired up,
// call getPreferences(learnerId) and getNotificationConfig(guardianUserId, learnerId).

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your study preferences and notification settings.
        </p>
      </div>

      <section className="space-y-4 rounded-lg border p-6">
        <div>
          <h2 className="text-lg font-medium">Study Preferences</h2>
          <p className="text-sm text-muted-foreground">
            Customise how your study sessions are structured.
          </p>
        </div>
        <PreferencesForm
          initialValues={DEFAULT_PREFERENCES}
          onSave={async () => {
            // TODO: Wire to savePreferences server action
          }}
        />
      </section>

      <section className="space-y-4 rounded-lg border p-6">
        <div>
          <h2 className="text-lg font-medium">Notifications</h2>
          <p className="text-sm text-muted-foreground">
            Control what notifications you receive.
          </p>
        </div>
        <NotificationConfig
          initialValues={DEFAULT_NOTIFICATION_CONFIG}
          onSave={async () => {
            // TODO: Wire to saveNotificationConfig server action
          }}
        />
      </section>
    </div>
  );
}

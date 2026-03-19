// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { getAuthContext } from "@/lib/auth";
import {
  loadSettingsPageData,
  savePreferences,
} from "@/app/(student)/settings/actions";
import SettingsPage from "@/app/(student)/settings/page";

vi.mock("@/lib/auth", () => ({
  getAuthContext: vi.fn(),
  AuthError: class AuthError extends Error {},
}));

vi.mock("@/app/(student)/settings/actions", () => ({
  loadSettingsPageData: vi.fn(),
  savePreferences: vi.fn(),
}));

const mockedGetAuthContext = vi.mocked(getAuthContext);
const mockedLoadSettingsPageData = vi.mocked(loadSettingsPageData);

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetAuthContext.mockResolvedValue({
      user: {
        id: "user-1",
        firebaseUid: "firebase-user-1",
        email: "learner@example.com",
        name: "Learner",
      },
      roles: [{ orgId: "org-1", role: "learner" }],
    });
    vi.mocked(savePreferences).mockResolvedValue({ success: true });
  });

  it("renders real settings values from the server-backed loader", async () => {
    mockedLoadSettingsPageData.mockResolvedValue({
      preferences: {
        preferredSessionMinutes: 45,
        preferredDifficulty: 4,
        preferredStudyTime: "evening",
        studyReminders: false,
        weeklyGoalMinutes: 240,
      },
      notificationConfig: {
        mode: "single_guardian",
        guardianCount: 1,
        initialValues: {
          receivesWeeklyReport: false,
          receivesFlags: true,
        },
      },
    });

    render(await SettingsPage());

    expect(
      (screen.getByLabelText("Preferred session length") as HTMLSelectElement)
        .value
    ).toBe("45");
    expect(
      (screen.getByLabelText("Preferred difficulty") as HTMLSelectElement).value
    ).toBe("4");
    expect(
      (screen.getByLabelText("Enable study reminders") as HTMLInputElement)
        .checked
    ).toBe(false);
    expect(
      screen.getByText(/guardian notification preferences are managed/i)
    ).toBeDefined();
    expect(screen.getByText("Disabled")).toBeDefined();
    expect(screen.getByText("Enabled")).toBeDefined();
  });

  it("surfaces the multi-guardian UX gap instead of rendering unsafe controls", async () => {
    mockedLoadSettingsPageData.mockResolvedValue({
      preferences: {
        preferredSessionMinutes: 30,
        preferredDifficulty: 3,
        preferredStudyTime: "no_preference",
        studyReminders: true,
        weeklyGoalMinutes: 180,
      },
      notificationConfig: {
        mode: "multiple_guardians",
        guardianCount: 2,
        initialValues: {
          receivesWeeklyReport: true,
          receivesFlags: true,
        },
      },
    });

    render(await SettingsPage());

    expect(
      screen.getByText(/2 guardians are linked to this learner/i)
    ).toBeDefined();
    expect(
      screen.getByText(/each guardian will need to manage their own/i)
    ).toBeDefined();
  });
});

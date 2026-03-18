import { test, expect } from "@playwright/test";
import { authenticateAsStudent } from "./helpers/auth";

test.describe("Onboarding flow", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAsStudent(page);
  });

  test("completes full onboarding: select subject, qualification, exam date, then see dashboard", async ({
    page,
  }) => {
    await page.goto("/onboarding");

    // Step 1: Subject picker
    await expect(
      page.getByText("What are you studying?")
    ).toBeVisible();
    await expect(page.getByText("Set up your studies")).toBeVisible();

    // Step indicator shows 3 steps
    await expect(page.getByText("Subjects")).toBeVisible();
    await expect(page.getByText("Qualifications")).toBeVisible();
    await expect(page.getByText("Exam dates")).toBeVisible();

    // Select a subject (click the first available subject button)
    const subjectButtons = page.locator(
      "button:has-text('Biology'), button:has-text('Chemistry'), button:has-text('Physics')"
    );
    const firstSubject = subjectButtons.first();
    await firstSubject.click();

    // The selected subject should have teal styling
    await expect(firstSubject).toHaveClass(/border-teal/);

    // Click Continue
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 2: Qualification picker
    await expect(
      page.getByText("Choose your qualifications")
    ).toBeVisible({ timeout: 5_000 });

    // Select a qualification
    const qualButtons = page.locator(".grid button").first();
    await qualButtons.click();

    // Click Continue
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 3: Exam date entry
    await expect(
      page.getByText("Set your exam dates")
    ).toBeVisible({ timeout: 5_000 });

    // Set a target grade (placeholder: "e.g. 7, A*, B")
    const gradeInputs = page.locator('input[placeholder*="e.g."]');
    if ((await gradeInputs.count()) > 0) {
      await gradeInputs.first().fill("7");
    }

    // Set an exam date
    const dateInputs = page.locator('input[type="date"]');
    if ((await dateInputs.count()) > 0) {
      await dateInputs.first().fill("2026-06-15");
    }

    // Complete setup
    await page.getByRole("button", { name: "Complete setup" }).click();

    // Should redirect to dashboard
    await page.waitForURL("**/dashboard", { timeout: 10_000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("shows error when no subject is selected and Continue is clicked", async ({
    page,
  }) => {
    await page.goto("/onboarding");
    await expect(page.getByText("What are you studying?")).toBeVisible();

    // Click Continue without selecting a subject
    await page.getByRole("button", { name: "Continue" }).click();

    // Error message should appear
    await expect(
      page.getByText("Select at least one subject")
    ).toBeVisible();
  });

  test("shows error when no qualification is selected and Continue is clicked", async ({
    page,
  }) => {
    await page.goto("/onboarding");

    // Select a subject first
    const subjectButtons = page.locator(
      "button:has-text('Biology'), button:has-text('Chemistry'), button:has-text('Physics')"
    );
    await subjectButtons.first().click();
    await page.getByRole("button", { name: "Continue" }).click();

    // Now on qualification step — click Continue without selecting
    await expect(
      page.getByText("Choose your qualifications")
    ).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "Continue" }).click();

    // Error message should appear
    await expect(
      page.getByText("Select at least one qualification")
    ).toBeVisible();
  });

  test("back button navigates to previous step", async ({ page }) => {
    await page.goto("/onboarding");

    // Select a subject and go to step 2
    const subjectButtons = page.locator(
      "button:has-text('Biology'), button:has-text('Chemistry'), button:has-text('Physics')"
    );
    await subjectButtons.first().click();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(
      page.getByText("Choose your qualifications")
    ).toBeVisible({ timeout: 5_000 });

    // Click Back
    await page.getByRole("button", { name: "Back" }).click();

    // Should be back on subject picker
    await expect(page.getByText("What are you studying?")).toBeVisible();
  });

  test("already onboarded user is redirected to dashboard", async ({
    page,
  }) => {
    // If the user already has active qualifications, /onboarding redirects to /dashboard.
    // This test verifies the redirect behavior by navigating to /onboarding
    // after completing onboarding. The server checks for existing qualifications.
    // Note: depends on the user having completed onboarding in a prior test or seed data.
    await page.goto("/dashboard");

    // If on dashboard, navigating to /onboarding should redirect back
    if (page.url().includes("/dashboard")) {
      await page.goto("/onboarding");
      // Should redirect back to dashboard if already onboarded
      await page.waitForURL("**/dashboard", { timeout: 10_000 });
      await expect(page).toHaveURL(/\/dashboard/);
    }
  });
});

test.describe("Dashboard after onboarding", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAsStudent(page);
  });

  test("dashboard displays key sections", async ({ page }) => {
    await page.goto("/dashboard");

    // Dashboard should show greeting with user's name
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();

    // Stat cards visible
    await expect(page.getByText("Average mastery")).toBeVisible();
    await expect(page.getByText("Sessions")).toBeVisible();
    await expect(page.getByText("Streak")).toBeVisible();
    await expect(page.getByText("Next exam")).toBeVisible();

    // Section headings
    await expect(page.getByText("Today's queue")).toBeVisible();
    await expect(page.getByText("Your subjects")).toBeVisible();
  });

  test("dashboard uses warm cream background from design system", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    // The student layout applies bg-[#FFFBF5] (warm cream variant)
    const layout = page.locator("div.min-h-screen").first();
    await expect(layout).toBeVisible();
    const bgColor = await layout.evaluate(
      (el) => getComputedStyle(el).backgroundColor
    );
    // #FFFBF5 = rgb(255, 251, 245)
    expect(bgColor).toBe("rgb(255, 251, 245)");
  });

  test("dashboard shows serif font for headings per design system", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    // Headings should use Instrument Serif (--font-serif variable)
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();
    const fontFamily = await heading.evaluate(
      (el) => getComputedStyle(el).fontFamily
    );
    expect(fontFamily.toLowerCase()).toContain("instrument serif");
  });
});

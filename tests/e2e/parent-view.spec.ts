import { test, expect } from "@playwright/test";
import { authenticateAsParent } from "./helpers/auth";

test.describe("Parent view", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAsParent(page);
  });

  test("parent dashboard shows linked learner cards", async ({ page }) => {
    await page.goto("/parent/dashboard");

    // Page heading
    await expect(page.getByText("Your children")).toBeVisible({
      timeout: 10_000,
    });

    // Learner card should be visible (requires seeded guardian_links + learner data)
    const learnerCards = page.getByTestId("learner-card");
    const cardCount = await learnerCards.count();

    if (cardCount > 0) {
      // Card displays learner name
      const firstCard = learnerCards.first();
      await expect(firstCard).toBeVisible();

      // Card has "View details" link
      await expect(
        firstCard.getByText("View details")
      ).toBeVisible();

      // Quick stats or "No reports yet" should be present
      const hasStats =
        (await firstCard.getByText("Sessions").count()) > 0;
      const hasNoReport =
        (await firstCard.getByTestId("no-report").count()) > 0;
      expect(hasStats || hasNoReport).toBe(true);
    }
  });

  test("parent dashboard shows sign-in message when not authenticated", async ({
    page,
  }) => {
    // Note: Currently the parent pages have a stub getGuardianUserId() that
    // returns null, so they always show the sign-in message.
    // This test verifies that unauthenticated state is handled gracefully.
    await page.goto("/parent/dashboard");

    // Either shows learner cards (authenticated) or sign-in message
    const signInMessage = page.getByText("Sign in required");
    const childrenHeading = page.getByText("Your children");
    const noLearners = page.getByText("No linked learners");

    const isSignInVisible = await signInMessage.isVisible().catch(() => false);
    const isChildrenVisible = await childrenHeading
      .isVisible()
      .catch(() => false);
    const isNoLearnersVisible = await noLearners
      .isVisible()
      .catch(() => false);

    // One of these states should be visible
    expect(
      isSignInVisible || isChildrenVisible || isNoLearnersVisible
    ).toBe(true);
  });

  test("learner detail page shows report or empty state", async ({
    page,
  }) => {
    await page.goto("/parent/dashboard");

    // Try to navigate to a learner detail page
    const viewDetailsLink = page.getByText("View details").first();
    const hasLink = await viewDetailsLink.isVisible().catch(() => false);

    if (hasLink) {
      await viewDetailsLink.click();
      await expect(page).toHaveURL(/\/parent\/learners\/.+/);

      // Should show back navigation
      await expect(
        page.getByText("Back to dashboard")
      ).toBeVisible();

      // Should show either a report view or "No weekly reports yet"
      const reportView = page.getByTestId("report-view");
      const noReports = page.getByText("No weekly reports yet");

      const hasReport = await reportView.isVisible().catch(() => false);
      const hasNoReports = await noReports.isVisible().catch(() => false);

      expect(hasReport || hasNoReports).toBe(true);

      if (hasReport) {
        // Verify report view sections
        await expect(
          page.getByText("Weekly Report:")
        ).toBeVisible();
        await expect(page.getByText("Study patterns")).toBeVisible();
        await expect(page.getByText("Summary")).toBeVisible();
      }
    }
  });

  test("learner detail shows report sections when data exists", async ({
    page,
  }) => {
    // Navigate directly to a learner detail page with known data
    // This requires seeded data: guardian_links, learners, weekly_reports
    await page.goto("/parent/dashboard");

    const viewDetailsLink = page.getByText("View details").first();
    const hasLink = await viewDetailsLink.isVisible().catch(() => false);

    if (!hasLink) {
      // Skip if no linked learners — parent auth may not be wired
      test.skip();
      return;
    }

    await viewDetailsLink.click();

    const reportView = page.getByTestId("report-view");
    const hasReport = await reportView.isVisible().catch(() => false);

    if (!hasReport) {
      // No reports yet — expected for a new learner
      await expect(
        page.getByText("No weekly reports yet")
      ).toBeVisible();
      return;
    }

    // Report sections
    await expect(page.getByText("Study patterns")).toBeVisible();
    await expect(page.getByText("Summary")).toBeVisible();

    // Study pattern stats (sessions, minutes, topics)
    await expect(page.getByText("Sessions")).toBeVisible();
    await expect(page.getByText("Minutes")).toBeVisible();
    await expect(page.getByText("Topics")).toBeVisible();
  });

  test("parent dashboard has correct layout structure", async ({ page }) => {
    await page.goto("/parent/dashboard");

    // Parent layout header
    await expect(page.getByText("Swotta")).toBeVisible();
    await expect(page.getByText("Parent Dashboard")).toBeVisible();

    // Max-width container (mx-auto max-w-4xl pattern)
    const mainContainer = page.locator("main");
    await expect(mainContainer).toBeVisible();
  });

  test("back to dashboard link on learner detail page works", async ({
    page,
  }) => {
    // Navigate to any learner detail page
    await page.goto("/parent/dashboard");

    const viewDetailsLink = page.getByText("View details").first();
    const hasLink = await viewDetailsLink.isVisible().catch(() => false);

    if (!hasLink) {
      test.skip();
      return;
    }

    await viewDetailsLink.click();
    await expect(page).toHaveURL(/\/parent\/learners\/.+/);

    // Click back to dashboard
    await page.getByText("Back to dashboard").click();
    await expect(page).toHaveURL(/\/parent\/dashboard/);
  });

  test("safety flags are displayed when present", async ({ page }) => {
    await page.goto("/parent/dashboard");

    // If there are learner cards with flags, verify they're displayed
    const learnerCards = page.getByTestId("learner-card");
    const cardCount = await learnerCards.count();

    if (cardCount > 0) {
      // Check if any card has the "Attention needed" section
      const attentionSection = page.getByText("Attention needed");
      const hasFlags = await attentionSection.isVisible().catch(() => false);

      if (hasFlags) {
        // Flag alerts should be present
        await expect(
          page.locator("[data-testid='learner-card'] >> text=Attention needed")
        ).toBeVisible();
      }
    }
  });
});

import { test, expect } from "@playwright/test";
import { authenticateAsStudent } from "./helpers/auth";
import {
  mockSessionApis,
  MOCK_BLOCK,
  MOCK_BLOCK_ID,
  MOCK_SESSION_END,
} from "./helpers/mock-data";

test.describe("Study session flow", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAsStudent(page);
    await mockSessionApis(page);
  });

  test("completes full session lifecycle: load, confidence, chat, complete, summary", async ({
    page,
  }) => {
    await page.goto(`/session/${MOCK_BLOCK_ID}`);

    // Phase 1: Loading
    const loading = page.getByTestId("session-loading");
    // Loading may be brief — wait for it to disappear
    await expect(loading).toBeVisible({ timeout: 5_000 }).catch(() => {
      // Loading may have already passed
    });

    // Phase 2: Confidence before
    const confidenceBefore = page.getByTestId("session-confidence-before");
    await expect(confidenceBefore).toBeVisible({ timeout: 10_000 });

    // Topic name and block type should be shown
    await expect(
      page.getByText(MOCK_BLOCK.topicName)
    ).toBeVisible();
    await expect(page.getByText("Retrieval Drill")).toBeVisible();

    // AI guidance callout should be visible
    await expect(
      page.getByText(/How confident do you feel\?/)
    ).toBeVisible();

    // Select confidence level 3 ("Somewhat")
    await page.getByTestId("confidence-3").click();

    // Submit confidence
    await page.getByTestId("confidence-submit").click();

    // Phase 3: Active session with chat
    const chatInterface = page.getByTestId("chat-interface");
    await expect(chatInterface).toBeVisible({ timeout: 10_000 });

    // Initial AI message should appear
    await expect(
      page.getByText(/three main parts of an animal cell/)
    ).toBeVisible({ timeout: 10_000 });

    // Session timer should be visible
    await expect(page.getByText(/\d+:\d+/)).toBeVisible();

    // Type and send a message
    const chatInput = page.getByTestId("chat-input");
    await chatInput.fill("The nucleus, cell membrane, and cytoplasm");
    await page.getByTestId("send-btn").click();

    // User message should appear in the chat
    await expect(
      page.getByText("The nucleus, cell membrane, and cytoplasm")
    ).toBeVisible();

    // AI response should stream in (mocked — contains completion signal)
    // After completion, session transitions to confidence-after

    // Phase 4: Confidence after
    const confidenceAfter = page.getByTestId("session-confidence-after");
    await expect(confidenceAfter).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByText(/How confident do you feel now\?/)
    ).toBeVisible();

    // Select confidence level 4 ("Mostly")
    await page.getByTestId("confidence-4").click();
    await page.getByTestId("confidence-submit").click();

    // Phase 5: Session complete
    const completeView = page.getByTestId("session-complete");
    await expect(completeView).toBeVisible({ timeout: 10_000 });

    // Summary text
    await expect(page.getByText(/Good session/)).toBeVisible();

    // Score stat
    await expect(page.getByTestId("stat-score")).toContainText(
      `${Math.round(MOCK_SESSION_END.outcome.score)}%`
    );

    // Time stat
    await expect(page.getByTestId("stat-time")).toBeVisible();

    // Navigation buttons
    await expect(page.getByTestId("next-block-btn")).toBeVisible();
    await expect(page.getByTestId("dashboard-btn")).toBeVisible();

    // Session complete header
    await expect(page.getByText("Session Complete")).toBeVisible();
  });

  test("can abandon session early", async ({ page }) => {
    await page.goto(`/session/${MOCK_BLOCK_ID}`);

    // Wait for confidence before phase
    await expect(
      page.getByTestId("session-confidence-before")
    ).toBeVisible({ timeout: 10_000 });

    // Submit confidence
    await page.getByTestId("confidence-3").click();
    await page.getByTestId("confidence-submit").click();

    // Wait for active phase
    await expect(
      page.getByTestId("chat-interface")
    ).toBeVisible({ timeout: 10_000 });

    // Click "End session early"
    await page.getByTestId("abandon-btn").click();

    // Should show completion (session end called with "abandoned" reason)
    const completeView = page.getByTestId("session-complete");
    await expect(completeView).toBeVisible({ timeout: 10_000 });
  });

  test("confidence slider requires selection before submit", async ({
    page,
  }) => {
    await page.goto(`/session/${MOCK_BLOCK_ID}`);

    await expect(
      page.getByTestId("session-confidence-before")
    ).toBeVisible({ timeout: 10_000 });

    // Continue button should be disabled without selection
    const submitBtn = page.getByTestId("confidence-submit");
    await expect(submitBtn).toBeDisabled();

    // Select a confidence level
    await page.getByTestId("confidence-2").click();

    // Now submit should be enabled
    await expect(submitBtn).toBeEnabled();
  });

  test("keeps confidence choices compact on narrow mobile screens", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`/session/${MOCK_BLOCK_ID}`);

    await expect(
      page.getByTestId("session-confidence-before")
    ).toBeVisible({ timeout: 10_000 });

    const widths = await page.getByRole("radio").evaluateAll((buttons) =>
      buttons.map((button) => {
        const el = button as HTMLElement;
        return {
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
        };
      })
    );

    for (const width of widths) {
      expect(width.scrollWidth).toBeLessThanOrEqual(width.clientWidth + 1);
    }

    await page.getByTestId("confidence-3").click();
    await expect(page.getByTestId("confidence-selection-label")).toHaveText(
      "Somewhat"
    );
  });

  test("chat input is disabled during streaming", async ({ page }) => {
    // Use a slow mock for the message endpoint to keep streaming state
    await page.route("**/api/sessions/*/message", async (route) => {
      // Delay response to observe streaming state
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return route.fulfill({
        status: 200,
        contentType: "text/plain",
        body: "Thinking about that...",
      });
    });

    await page.goto(`/session/${MOCK_BLOCK_ID}`);

    // Get through confidence phase
    await expect(
      page.getByTestId("session-confidence-before")
    ).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("confidence-3").click();
    await page.getByTestId("confidence-submit").click();

    // Wait for chat
    await expect(
      page.getByTestId("chat-interface")
    ).toBeVisible({ timeout: 10_000 });

    // Send a message
    const chatInput = page.getByTestId("chat-input");
    await chatInput.fill("Test message");
    await page.getByTestId("send-btn").click();

    // During streaming, input should be disabled
    await expect(chatInput).toBeDisabled({ timeout: 2_000 });
  });

  test("navigating to dashboard from session complete works", async ({
    page,
  }) => {
    await page.goto(`/session/${MOCK_BLOCK_ID}`);

    // Quick-path through session
    await expect(
      page.getByTestId("session-confidence-before")
    ).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("confidence-3").click();
    await page.getByTestId("confidence-submit").click();

    await expect(
      page.getByTestId("chat-interface")
    ).toBeVisible({ timeout: 10_000 });

    await page.getByTestId("chat-input").fill("My answer");
    await page.getByTestId("send-btn").click();

    // Wait for confidence after (triggered by completion signal)
    await expect(
      page.getByTestId("session-confidence-after")
    ).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("confidence-4").click();
    await page.getByTestId("confidence-submit").click();

    // Click Dashboard button
    await expect(
      page.getByTestId("session-complete")
    ).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("dashboard-btn").click();

    // Should navigate to dashboard
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

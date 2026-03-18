import type { Page } from "@playwright/test";

const MOCK_BLOCK_ID = "test-block-001";

const MOCK_BLOCK = {
  id: MOCK_BLOCK_ID,
  topicName: "Cell Structure",
  blockType: "retrieval_drill" as const,
  durationMinutes: 15,
  reason: "Scheduled review",
};

const MOCK_SESSION_START = {
  sessionId: "test-session-001",
  systemPrompt: "You are a biology tutor helping with Cell Structure.",
  initialMessage:
    "Let's test your knowledge of cell structure. Can you name the three main parts of an animal cell?",
};

const MOCK_SESSION_END = {
  outcome: {
    blockId: MOCK_BLOCK_ID,
    score: 85,
    confidenceBefore: 0.6,
    confidenceAfter: null,
    helpRequested: false,
    helpTiming: null,
    misconceptions: [],
    retentionOutcome: "remembered" as const,
    durationMinutes: 8,
    rawInteraction: null,
  },
  summary:
    "Good session! You correctly identified the nucleus, cell membrane, and cytoplasm. Your understanding of cell structure is solid.",
};

/**
 * Mock the session-related API routes that don't exist yet.
 * Intercepts /api/blocks/:id, /api/sessions/start, /api/sessions/:id/message,
 * and /api/sessions/:id/end with realistic responses matching INTERFACES.md.
 */
export async function mockSessionApis(page: Page): Promise<void> {
  // GET /api/blocks/:id — return block info
  await page.route("**/api/blocks/**", (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: MOCK_BLOCK }),
    });
  });

  // POST /api/sessions/start — return session info + initial message
  await page.route("**/api/sessions/start", (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: MOCK_SESSION_START }),
    });
  });

  // POST /api/sessions/:id/message — return streaming text
  await page.route("**/api/sessions/*/message", (route) => {
    const responseText =
      "Good answer! The three main parts are the nucleus, cell membrane, and cytoplasm. " +
      "Can you describe what the nucleus does?" +
      "<session_status>complete</session_status>";

    return route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: responseText,
    });
  });

  // POST /api/sessions/:id/end — return outcome + summary
  await page.route("**/api/sessions/*/end", (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: MOCK_SESSION_END }),
    });
  });
}

export { MOCK_BLOCK, MOCK_BLOCK_ID, MOCK_SESSION_START, MOCK_SESSION_END };

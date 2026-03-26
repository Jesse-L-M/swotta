// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DiagnosticPageClient from "./diagnostic-page-client";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () =>
    new URLSearchParams(
      "qualificationVersionId=11111111-1111-1111-1111-111111111111"
    ),
}));

describe("DiagnosticPage", () => {
  const originalFetch = global.fetch;
  const originalScrollIntoView = Element.prototype.scrollIntoView;

  beforeEach(() => {
    pushMock.mockReset();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalScrollIntoView) {
      Object.defineProperty(Element.prototype, "scrollIntoView", {
        configurable: true,
        value: originalScrollIntoView,
      });
    } else {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
    vi.clearAllMocks();
  });

  it("rolls back a failed message send so the transcript stays server-aligned", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        buildResponse({
          data: {
            systemPrompt: "server prompt",
            qualificationName: "GCSE Test Subject",
            topics: [
              { id: "topic-1", name: "Unit 1", code: "1" },
              { id: "topic-2", name: "Unit 2", code: "2" },
            ],
            progress: {
              explored: [],
              current: "Unit 1",
              total: 2,
              isComplete: false,
            },
            reply: "Opening question",
          },
        })
      )
      .mockResolvedValueOnce(
        buildResponse(
          {
            error: {
              message: "Claude is temporarily unavailable",
            },
          },
          { ok: false, status: 503 }
        )
      );

    global.fetch = fetchMock as typeof fetch;

    render(<DiagnosticPageClient />);

    fireEvent.click(screen.getByTestId("start-btn"));
    await waitFor(() => expect(screen.getByTestId("chat-input")).toBeDefined());

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "I know quite a bit about this." },
    });
    fireEvent.submit(screen.getByTestId("chat-input-form"));

    await waitFor(() =>
      expect(
        (screen.getByTestId("chat-input") as HTMLTextAreaElement).value
      ).toBe("I know quite a bit about this.")
    );

    expect(screen.getAllByTestId("message-user")).toHaveLength(1);
    expect(screen.queryByText("Claude is temporarily unavailable")).toBeTruthy();
  });
});

function buildResponse(
  body: Record<string, unknown>,
  init: { ok?: boolean; status?: number } = {}
) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } satisfies Pick<Response, "ok" | "status" | "json">;
}

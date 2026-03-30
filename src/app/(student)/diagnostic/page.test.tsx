// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DiagnosticPageClient from "./diagnostic-page-client";

const { pushMock, replaceMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

describe("DiagnosticPage", () => {
  const originalFetch = global.fetch;
  const originalScrollIntoView = Element.prototype.scrollIntoView;

  beforeEach(() => {
    pushMock.mockReset();
    replaceMock.mockReset();
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

    render(<DiagnosticPageClient {...buildProps()} />);

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

  it("routes skip and completion through the server-provided next path", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        buildResponse({
          data: {
            topicsInitialised: 5,
            nextPath: "/diagnostic?qualificationVersionId=22222222-2222-2222-2222-222222222222",
          },
        })
      )
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
        buildResponse({
          data: {
            reply: "All done",
            progress: {
              explored: ["Unit 1", "Unit 2"],
              current: null,
              total: 2,
              isComplete: true,
            },
            isComplete: true,
          },
        })
      )
      .mockResolvedValueOnce(
        buildResponse({
          data: {
            results: [
              {
                topicId: "topic-1",
                topicName: "Unit 1",
                score: 0.7,
                confidence: 0.6,
              },
            ],
            topicsUpdated: 5,
            nextPath: "/dashboard",
          },
        })
      );

    global.fetch = fetchMock as typeof fetch;

    const { unmount } = render(
      <DiagnosticPageClient {...buildProps({ remainingPendingCount: 1 })} />
    );

    fireEvent.click(screen.getByTestId("skip-btn"));

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(
        "/diagnostic?qualificationVersionId=22222222-2222-2222-2222-222222222222"
      )
    );

    unmount();
    pushMock.mockReset();

    render(
      <DiagnosticPageClient {...buildProps({ remainingPendingCount: 0 })} />
    );

    fireEvent.click(screen.getByTestId("start-btn"));
    await waitFor(() => expect(screen.getByTestId("chat-input")).toBeDefined());

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "I know a fair bit." },
    });
    fireEvent.submit(screen.getByTestId("chat-input-form"));

    await waitFor(() =>
      expect(screen.getByTestId("see-results-btn")).toBeDefined()
    );

    fireEvent.click(screen.getByTestId("see-results-btn"));

    await waitFor(() =>
      expect(screen.getByTestId("continue-btn")).toBeDefined()
    );
    expect(screen.getByTestId("continue-btn").textContent).toBe(
      "Continue to my dashboard"
    );
    fireEvent.click(screen.getByTestId("continue-btn"));

    expect(pushMock).toHaveBeenCalledWith("/dashboard");
  });

  it("returns to a restart intro when the diagnostic session expires", async () => {
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
              code: "INVALID_DIAGNOSTIC_STATE",
              message:
                "Diagnostic session is invalid or has expired. Please restart the diagnostic.",
            },
          },
          { ok: false, status: 409 }
        )
      );

    global.fetch = fetchMock as typeof fetch;

    render(<DiagnosticPageClient {...buildProps()} />);

    fireEvent.click(screen.getByTestId("start-btn"));
    await waitFor(() => expect(screen.getByTestId("chat-input")).toBeDefined());

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "I know quite a bit about this." },
    });
    fireEvent.submit(screen.getByTestId("chat-input-form"));

    await waitFor(() =>
      expect(screen.getByText(/restart your diagnostic/i)).toBeDefined()
    );

    expect(screen.getByTestId("start-btn").textContent).toBe(
      "Restart diagnostic"
    );
    expect(screen.getByTestId("intro-error").textContent).toContain(
      "Please restart the diagnostic"
    );
  });

  it("routes resolved diagnostics back through the dashboard fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      buildResponse(
        {
          error: {
            code: "DIAGNOSTIC_ALREADY_RESOLVED",
            message: "Diagnostic has already been resolved for this qualification.",
          },
        },
        { ok: false, status: 409 }
      )
    );

    global.fetch = fetchMock as typeof fetch;

    render(<DiagnosticPageClient {...buildProps()} />);

    fireEvent.click(screen.getByTestId("start-btn"));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/dashboard"));
  });

  it("resets back to the intro state when the qualification prop changes", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
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
    );

    global.fetch = fetchMock as typeof fetch;

    const view = render(<DiagnosticPageClient {...buildProps()} />);

    fireEvent.click(screen.getByTestId("start-btn"));
    await waitFor(() => expect(screen.getByTestId("chat-input")).toBeDefined());

    view.rerender(
      <DiagnosticPageClient
        {...buildProps({
          qualificationVersionId: "22222222-2222-2222-2222-222222222222",
          qualificationLabel: "GCSE Chemistry (OCR)",
        })}
      />
    );

    await waitFor(() => expect(screen.getByTestId("start-btn")).toBeDefined());
    expect(screen.queryByTestId("chat-input")).toBeNull();
    expect(screen.getByTestId("qualification-label").textContent).toBe(
      "GCSE Chemistry (OCR)"
    );
  });
});

function buildProps(
  overrides: Partial<{
    qualificationVersionId: string;
    qualificationLabel: string;
    remainingPendingCount: number;
  }> = {}
) {
  return {
    qualificationVersionId:
      overrides.qualificationVersionId ??
      "11111111-1111-1111-1111-111111111111",
    qualificationLabel:
      overrides.qualificationLabel ?? "GCSE Test Subject (AQA)",
    remainingPendingCount: overrides.remainingPendingCount ?? 0,
  };
}

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

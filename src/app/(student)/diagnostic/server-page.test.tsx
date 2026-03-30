import { beforeEach, describe, expect, it, vi } from "vitest";
import DiagnosticPage from "./page";

const {
  requireStudentPageAuthMock,
  resolveDiagnosticPageContextMock,
  redirectMock,
  diagnosticPageClientMock,
} = vi.hoisted(() => ({
  requireStudentPageAuthMock: vi.fn(),
  resolveDiagnosticPageContextMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  diagnosticPageClientMock: vi.fn(() => null),
}));

vi.mock("../student-page-auth", () => ({
  requireStudentPageAuth: requireStudentPageAuthMock,
}));

vi.mock("@/lib/db", () => ({
  db: {},
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("./diagnostic-routing", () => ({
  resolveDiagnosticPageContext: resolveDiagnosticPageContextMock,
}));

vi.mock("./diagnostic-page-client", () => ({
  default: diagnosticPageClientMock,
}));

describe("DiagnosticPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireStudentPageAuthMock.mockResolvedValue({
      learner: { id: "learner-1", displayName: "Learner", yearGroup: 10 },
    });
    resolveDiagnosticPageContextMock.mockResolvedValue({
      context: {
        qualificationVersionId: "11111111-1111-1111-1111-111111111111",
        qualificationName: "GCSE Test Subject",
        remainingPendingCount: 1,
      },
      redirectTo: null,
    });
  });

  it("opts out of pending diagnostic redirects to avoid redirect loops", async () => {
    await DiagnosticPage({
      searchParams: Promise.resolve({
        qualificationVersionId: "11111111-1111-1111-1111-111111111111",
      }),
    });

    expect(requireStudentPageAuthMock).toHaveBeenCalledWith(
      "/diagnostic?qualificationVersionId=11111111-1111-1111-1111-111111111111",
      { allowPendingDiagnostic: true }
    );
  });

  it("passes the resolved qualification context to the client", async () => {
    const element = await DiagnosticPage({
      searchParams: Promise.resolve({
        qualificationVersionId: "11111111-1111-1111-1111-111111111111",
      }),
    });

    expect(resolveDiagnosticPageContextMock).toHaveBeenCalledWith(
      {},
      "learner-1",
      "11111111-1111-1111-1111-111111111111"
    );
    expect(element).toMatchObject({
      type: diagnosticPageClientMock,
      props: {
        qualificationVersionId: "11111111-1111-1111-1111-111111111111",
        qualificationName: "GCSE Test Subject",
        remainingPendingCount: 1,
      },
    });
  });

  it("redirects when the diagnostic route resolver returns a fallback path", async () => {
    resolveDiagnosticPageContextMock.mockResolvedValueOnce({
      context: null,
      redirectTo:
        "/diagnostic?qualificationVersionId=22222222-2222-2222-2222-222222222222",
    });

    await expect(
      DiagnosticPage({
        searchParams: Promise.resolve({
          qualificationVersionId: "11111111-1111-1111-1111-111111111111",
        }),
      })
    ).rejects.toThrow(
      "REDIRECT:/diagnostic?qualificationVersionId=22222222-2222-2222-2222-222222222222"
    );

    expect(redirectMock).toHaveBeenCalledWith(
      "/diagnostic?qualificationVersionId=22222222-2222-2222-2222-222222222222"
    );
  });
});

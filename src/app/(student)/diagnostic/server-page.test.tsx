import { beforeEach, describe, expect, it, vi } from "vitest";
import DiagnosticPage from "./page";

const { requireStudentPageAuthMock } = vi.hoisted(() => ({
  requireStudentPageAuthMock: vi.fn(),
}));

vi.mock("../student-page-auth", () => ({
  requireStudentPageAuth: requireStudentPageAuthMock,
}));

vi.mock("./diagnostic-page-client", () => ({
  default: () => null,
}));

describe("DiagnosticPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireStudentPageAuthMock.mockResolvedValue({
      learner: { id: "learner-1", displayName: "Learner", yearGroup: 10 },
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
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import SessionPage from "./page";

const { requireStudentPageAuthMock } = vi.hoisted(() => ({
  requireStudentPageAuthMock: vi.fn(),
}));

vi.mock("../../student-page-auth", () => ({
  requireStudentPageAuth: requireStudentPageAuthMock,
}));

describe("SessionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireStudentPageAuthMock.mockResolvedValue({
      learner: { id: "learner-1", displayName: "Learner", yearGroup: 10 },
    });
  });

  it("uses the shared student guard for pending diagnostic gating", async () => {
    await SessionPage({
      params: Promise.resolve({ blockId: "block-1" }),
    });

    expect(requireStudentPageAuthMock).toHaveBeenCalledWith(
      "/session/block-1"
    );
  });
});

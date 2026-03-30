import { beforeEach, describe, expect, it, vi } from "vitest";
import UploadPage from "./page";

const { requireStudentPageAuthMock, getCollectionsMock } = vi.hoisted(() => ({
  requireStudentPageAuthMock: vi.fn(),
  getCollectionsMock: vi.fn(),
}));

vi.mock("../../student-page-auth", () => ({
  requireStudentPageAuth: requireStudentPageAuthMock,
}));

vi.mock("../actions", () => ({
  getCollections: getCollectionsMock,
}));

describe("UploadPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireStudentPageAuthMock.mockResolvedValue({
      learner: { id: "learner-1", displayName: "Learner", yearGroup: 10 },
    });
    getCollectionsMock.mockResolvedValue([]);
  });

  it("uses the shared student guard for pending diagnostic gating", async () => {
    await UploadPage();

    expect(requireStudentPageAuthMock).toHaveBeenCalledWith("/sources/upload");
  });
});

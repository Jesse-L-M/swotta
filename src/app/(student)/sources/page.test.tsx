// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SourcesPage from "./page";

const { requireStudentPageAuthMock, getSourcesPageDataMock } = vi.hoisted(
  () => ({
    requireStudentPageAuthMock: vi.fn(),
    getSourcesPageDataMock: vi.fn(),
  })
);

vi.mock("../student-page-auth", () => ({
  requireStudentPageAuth: requireStudentPageAuthMock,
}));

vi.mock("./actions", () => ({
  getSourcesPageData: getSourcesPageDataMock,
}));

describe("SourcesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireStudentPageAuthMock.mockResolvedValue({
      learner: { id: "learner-1", displayName: "Learner", yearGroup: 10 },
    });
    getSourcesPageDataMock.mockResolvedValue({
      collections: [],
      filesByCollectionId: {},
      pendingFileCount: 0,
      failedFileCount: 0,
    });
  });

  it("uses the shared student guard for pending diagnostic gating", async () => {
    await SourcesPage();

    expect(requireStudentPageAuthMock).toHaveBeenCalledWith("/sources");
  });

  it("renders the learner-facing empty state guidance", async () => {
    render(await SourcesPage());

    expect(screen.getByText("Build your sources library")).toBeDefined();
    expect(screen.getByText("Uploaded")).toBeDefined();
    expect(screen.getByText("Processing")).toBeDefined();
    expect(screen.getByText("Ready")).toBeDefined();
  });
});

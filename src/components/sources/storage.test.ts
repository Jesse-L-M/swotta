import { describe, it, expect } from "vitest";
import { buildStoragePath, createGCSClient } from "./storage";

describe("buildStoragePath", () => {
  it("builds correct path with simple filename", () => {
    const path = buildStoragePath("org-1", "col-1", "file-1", "notes.pdf");
    expect(path).toBe("sources/org-1/col-1/file-1/notes.pdf");
  });

  it("sanitizes special characters in filename", () => {
    const path = buildStoragePath(
      "org-1",
      "col-1",
      "file-1",
      "my notes (2024).pdf"
    );
    expect(path).toBe("sources/org-1/col-1/file-1/my_notes__2024_.pdf");
  });

  it("preserves safe characters", () => {
    const path = buildStoragePath(
      "org-1",
      "col-1",
      "file-1",
      "file-name_v2.pdf"
    );
    expect(path).toBe("sources/org-1/col-1/file-1/file-name_v2.pdf");
  });

  it("sanitizes unicode characters", () => {
    const path = buildStoragePath("org-1", "col-1", "file-1", "révision.pdf");
    expect(path).toBe("sources/org-1/col-1/file-1/r_vision.pdf");
  });
});

describe("createGCSClient", () => {
  const client = createGCSClient("test-bucket", "test-project");

  it("generates signed upload URL with bucket name", async () => {
    const url = await client.generateSignedUploadUrl(
      "sources/org/col/file/doc.pdf",
      "application/pdf",
      50 * 1024 * 1024
    );
    expect(url).toContain("test-bucket");
    expect(url).toContain("uploadType=resumable");
  });

  it("generates signed download URL with bucket name", async () => {
    const url = await client.generateSignedDownloadUrl(
      "sources/org/col/file/doc.pdf"
    );
    expect(url).toContain("test-bucket");
  });

  it("deleteFile completes without error", async () => {
    await expect(
      client.deleteFile("sources/org/col/file/doc.pdf")
    ).resolves.toBeUndefined();
  });
});

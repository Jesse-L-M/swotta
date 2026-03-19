import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildStoragePath,
  createConfiguredStorageClient,
  createGCSClient,
  StorageConfigurationError,
} from "./storage";
import { resetEnvCache } from "@/lib/env";

describe("buildStoragePath", () => {
  it("builds the correct path with a simple filename", () => {
    const path = buildStoragePath("org-1", "col-1", "file-1", "notes.pdf");
    expect(path).toBe("sources/org-1/col-1/file-1/notes.pdf");
  });

  it("sanitizes special characters in the filename", () => {
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

describe("createConfiguredStorageClient", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    resetEnvCache();
  });

  it("returns an unconfigured client when bucket env is missing", async () => {
    delete process.env.GCS_BUCKET_NAME;
    delete process.env.GCS_PROJECT_ID;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;

    const client = createConfiguredStorageClient();

    expect(client.mode).toBe("unconfigured");
    await expect(
      client.uploadFile("sources/org/col/file/doc.pdf", new Uint8Array(), "application/pdf")
    ).rejects.toThrow(StorageConfigurationError);
  });

  it("throws when storage env is only partially configured", () => {
    process.env.GCS_BUCKET_NAME = "test-bucket";
    delete process.env.GCS_PROJECT_ID;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;

    expect(() => createConfiguredStorageClient()).toThrow(
      "Missing or invalid storage environment variables"
    );
  });
});

describe("createGCSClient", () => {
  it("uploads, signs, and deletes through the configured storage factory", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const getSignedUrl = vi
      .fn()
      .mockResolvedValueOnce(["https://example.com/upload"])
      .mockResolvedValueOnce(["https://example.com/download"]);
    const deleteFile = vi.fn().mockResolvedValue(undefined);
    const bucket = {
      file: vi.fn(() => ({
        getSignedUrl,
        save,
        delete: deleteFile,
      })),
    };
    const storageFactory = vi.fn().mockResolvedValue({
      bucket: vi.fn(() => bucket),
    });
    const client = createGCSClient("test-bucket", "test-project", {
      clientEmail: "storage@test.example",
      privateKey: "private-key",
      storageFactory,
    });

    await client.uploadFile(
      "sources/org/col/file/doc.pdf",
      new Uint8Array([1, 2, 3]),
      "application/pdf"
    );
    const uploadUrl = await client.generateSignedUploadUrl(
      "sources/org/col/file/doc.pdf",
      "application/pdf",
      50 * 1024 * 1024
    );
    const downloadUrl = await client.generateSignedDownloadUrl(
      "sources/org/col/file/doc.pdf"
    );
    await client.deleteFile("sources/org/col/file/doc.pdf");

    expect(client.mode).toBe("gcs");
    expect(storageFactory).toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), {
      contentType: "application/pdf",
      resumable: false,
      metadata: { contentType: "application/pdf" },
    });
    expect(uploadUrl).toBe("https://example.com/upload");
    expect(downloadUrl).toBe("https://example.com/download");
    expect(deleteFile).toHaveBeenCalled();
  });

  it("returns an unconfigured client without credentials", async () => {
    const client = createGCSClient("test-bucket", "test-project");

    expect(client.mode).toBe("unconfigured");
    await expect(
      client.generateSignedUploadUrl(
        "sources/org/col/file/doc.pdf",
        "application/pdf",
        50 * 1024 * 1024
      )
    ).rejects.toThrow(StorageConfigurationError);
  });
});

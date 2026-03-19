import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "@/test/setup";
import type { Database } from "@/lib/db";
import {
  createTestLearner,
  createTestOrg,
  createTestQualification,
  createTestUser,
} from "@/test/fixtures";
import {
  sourceChunks,
  sourceCollections,
  sourceFiles,
  sourceMappings,
} from "@/db/schema/sources";
import type { StorageClient } from "@/components/sources/storage";

const {
  requireLearnerMock,
  revalidatePathMock,
  createConfiguredStorageClientMock,
} = vi.hoisted(() => ({
  requireLearnerMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  createConfiguredStorageClientMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireLearner: requireLearnerMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/components/sources/storage", async () => {
  const actual =
    await vi.importActual<typeof import("@/components/sources/storage")>(
      "@/components/sources/storage"
    );

  return {
    ...actual,
    createConfiguredStorageClient: createConfiguredStorageClientMock,
  };
});

import {
  createCollection,
  getCollections,
  getFiles,
  getTopicMappings,
  registerUpload,
  uploadSourceFiles,
} from "./actions";

describe("source actions", () => {
  let learnerId: string;
  let userId: string;
  let orgId: string;
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    vi.clearAllMocks();

    db = getTestDb();

    const org = await createTestOrg();
    orgId = org.id;

    const user = await createTestUser();
    userId = user.id;

    const learner = await createTestLearner(org.id, { userId: user.id });
    learnerId = learner.id;

    requireLearnerMock.mockResolvedValue({
      user: {
        id: userId,
        firebaseUid: "firebase-uid",
        email: "student@example.com",
        name: "Student Example",
      },
      roles: [{ orgId, role: "learner" }],
      learnerId,
      orgId,
    });
    createConfiguredStorageClientMock.mockReturnValue(makeStorageClient("gcs"));
  });

  describe("getCollections", () => {
    it("returns empty array when no collections exist", async () => {
      const result = await getCollections(db);
      expect(result).toEqual([]);
    });

    it("returns collections with file counts for the authenticated learner", async () => {
      const createResult = await createCollection(
        { name: "Biology Notes" },
        db
      );
      expect(createResult.success).toBe(true);

      const collections = await getCollections(db);
      expect(collections).toHaveLength(1);
      expect(collections[0].name).toBe("Biology Notes");
      expect(collections[0].fileCount).toBe(0);
    });

    it("does not return collections owned by another learner", async () => {
      const otherUser = await createTestUser();
      const otherLearner = await createTestLearner(orgId, {
        userId: otherUser.id,
      });

      await db.insert(sourceCollections).values({
        scope: "private",
        learnerId: otherLearner.id,
        orgId,
        name: "Other learner collection",
      });

      const collections = await getCollections(db);
      expect(collections).toEqual([]);
    });
  });

  describe("createCollection", () => {
    it("creates a private collection scoped to the authenticated learner", async () => {
      const result = await createCollection(
        { name: "Biology Notes", description: "My notes" },
        db
      );

      expect(result.success).toBe(true);
      expect(result.collectionId).toBeDefined();

      const [collection] = await db
        .select({
          learnerId: sourceCollections.learnerId,
          orgId: sourceCollections.orgId,
          name: sourceCollections.name,
        })
        .from(sourceCollections)
        .where(eq(sourceCollections.id, result.collectionId!));

      expect(collection.learnerId).toBe(learnerId);
      expect(collection.orgId).toBe(orgId);
      expect(collection.name).toBe("Biology Notes");
      expect(revalidatePathMock).toHaveBeenCalledWith("/sources");
      expect(revalidatePathMock).toHaveBeenCalledWith("/sources/upload");
    });

    it("rejects empty name", async () => {
      const result = await createCollection({ name: "" }, db);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("handles non-Error DB failures", async () => {
      const failingDb = {
        insert: () => {
          throw "string error";
        },
      } as unknown as Database;

      const result = await createCollection({ name: "Fail" }, failingDb);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to create collection");
    });
  });

  describe("getFiles", () => {
    it("returns empty array for a collection with no files", async () => {
      const collection = await createCollection({ name: "Empty" }, db);

      const files = await getFiles(collection.collectionId!, db);
      expect(files).toEqual([]);
    });

    it("returns files after upload registration", async () => {
      const collection = await createCollection({ name: "With Files" }, db);

      const registerResult = await registerUpload(
        {
          collectionId: collection.collectionId!,
          filename: "notes.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
        },
        db
      );

      expect(registerResult.success).toBe(true);

      const files = await getFiles(collection.collectionId!, db);
      expect(files).toHaveLength(1);
      expect(files[0].filename).toBe("notes.pdf");
      expect(files[0].status).toBe("pending");
      expect(files[0].sizeBytes).toBe(1024);
    });
  });

  describe("registerUpload", () => {
    it("registers a valid upload using authenticated scope", async () => {
      const collection = await createCollection({ name: "Upload Test" }, db);

      const result = await registerUpload(
        {
          collectionId: collection.collectionId!,
          filename: "document.pdf",
          mimeType: "application/pdf",
          sizeBytes: 5000,
        },
        db
      );

      expect(result.success).toBe(true);
      expect(result.fileId).toBeDefined();
      expect(result.storagePath).toContain(`sources/${orgId}/`);
      expect(result.storagePath).toContain("document.pdf");

      const [file] = await db
        .select({
          uploadedByUserId: sourceFiles.uploadedByUserId,
          status: sourceFiles.status,
        })
        .from(sourceFiles)
        .where(eq(sourceFiles.id, result.fileId!));

      expect(file.uploadedByUserId).toBe(userId);
      expect(file.status).toBe("pending");
    });

    it("rejects uploads for collections the learner does not own", async () => {
      const result = await registerUpload(
        {
          collectionId: crypto.randomUUID(),
          filename: "fail.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
        },
        db
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Collection not found");
    });

    it("rejects invalid mime types", async () => {
      const collection = await createCollection({ name: "Upload Test" }, db);

      const result = await registerUpload(
        {
          collectionId: collection.collectionId!,
          filename: "image.png",
          mimeType: "image/png",
          sizeBytes: 1024,
        },
        db
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("handles non-Error DB failures", async () => {
      const collection = await createCollection({ name: "Upload Test" }, db);
      const failingDb = {
        select: () => {
          throw "string error";
        },
      } as unknown as Database;

      const result = await registerUpload(
        {
          collectionId: collection.collectionId!,
          filename: "fail.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
        },
        failingDb
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to register upload");
    });
  });

  describe("uploadSourceFiles", () => {
    it("creates a collection when needed and stores uploaded files", async () => {
      const uploadFileMock = vi.fn().mockResolvedValue(undefined);
      createConfiguredStorageClientMock.mockReturnValue(
        makeStorageClient("gcs", uploadFileMock)
      );

      const formData = new FormData();
      formData.append(
        "files",
        new File(["%PDF-1.4"], "cell-biology-notes.pdf", {
          type: "application/pdf",
        })
      );

      const result = await uploadSourceFiles(formData, db);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.collection.created).toBe(true);
        expect(result.collection.name).toBe("cell-biology-notes");
        expect(result.files).toHaveLength(1);
        expect(result.files[0].status).toBe("pending");
        expect(result.warnings[0]).toContain("stored immediately");
      }

      expect(uploadFileMock).toHaveBeenCalledTimes(1);

      const collections = await getCollections(db);
      expect(collections).toHaveLength(1);
      expect(collections[0].name).toBe("cell-biology-notes");

      const files = await getFiles(collections[0].id, db);
      expect(files).toHaveLength(1);
      expect(files[0].status).toBe("pending");
    });

    it("marks files as failed when Cloud Storage is unavailable", async () => {
      createConfiguredStorageClientMock.mockReturnValue(
        makeStorageClient("unconfigured")
      );

      const formData = new FormData();
      formData.set("collectionName", "Chemistry Notes");
      formData.append(
        "files",
        new File(["%PDF-1.4"], "chemistry.pdf", {
          type: "application/pdf",
        })
      );

      const result = await uploadSourceFiles(formData, db);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.files).toHaveLength(1);
        expect(result.files[0].status).toBe("failed");
        expect(result.warnings[0]).toContain("not configured");

        const files = await getFiles(result.collection.id, db);
        expect(files).toHaveLength(1);
        expect(files[0].status).toBe("failed");
        expect(files[0].errorMessage).toContain(
          "Cloud Storage is not configured"
        );
      }
    });
  });

  describe("getTopicMappings", () => {
    it("returns empty array when the file has no chunks", async () => {
      const result = await getTopicMappings(crypto.randomUUID(), db);
      expect(result).toEqual([]);
    });

    it("returns aggregated topic mappings for the learner's file", async () => {
      const collection = await createCollection({ name: "Mapped" }, db);
      const upload = await registerUpload(
        {
          collectionId: collection.collectionId!,
          filename: "mapped.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048,
        },
        db
      );

      const qualification = await createTestQualification();
      const topicId = qualification.topics[0].id;

      const [chunk1] = await db
        .insert(sourceChunks)
        .values({
          fileId: upload.fileId!,
          content: "Cell biology content",
          chunkIndex: 0,
          tokenCount: 50,
        })
        .returning();

      const [chunk2] = await db
        .insert(sourceChunks)
        .values({
          fileId: upload.fileId!,
          content: "More cell biology",
          chunkIndex: 1,
          tokenCount: 40,
        })
        .returning();

      await db.insert(sourceMappings).values([
        {
          chunkId: chunk1.id,
          topicId,
          confidence: "0.85",
          mappingMethod: "auto",
        },
        {
          chunkId: chunk2.id,
          topicId,
          confidence: "0.90",
          mappingMethod: "auto",
        },
      ]);

      const mappings = await getTopicMappings(upload.fileId!, db);
      expect(mappings).toHaveLength(1);
      expect(mappings[0].topicId).toBe(topicId);
      expect(mappings[0].chunkCount).toBe(2);
      expect(mappings[0].avgConfidence).toBeCloseTo(0.875, 2);
    });
  });
});

function makeStorageClient(
  mode: StorageClient["mode"],
  uploadFile = vi.fn().mockResolvedValue(undefined)
): StorageClient {
  return {
    mode,
    bucketName: mode === "gcs" ? "test-bucket" : null,
    generateSignedUploadUrl: vi
      .fn()
      .mockResolvedValue("https://example.com/upload"),
    generateSignedDownloadUrl: vi
      .fn()
      .mockResolvedValue("https://example.com/download"),
    uploadFile,
    deleteFile: vi.fn().mockResolvedValue(undefined),
  };
}

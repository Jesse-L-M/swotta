import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "@/test/setup";
import type { Database } from "@/lib/db";
import {
  createTestOrg,
  createTestUser,
  createTestLearner,
  createTestQualification,
} from "@/test/fixtures";
import {
  getCollections,
  getFiles,
  createCollection,
  registerUpload,
  getTopicMappings,
} from "./actions";
import { sourceChunks, sourceMappings } from "@/db/schema/sources";

describe("source actions", () => {
  let learnerId: string;
  let userId: string;
  let orgId: string;
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    db = getTestDb();
    const org = await createTestOrg();
    orgId = org.id;
    const user = await createTestUser();
    userId = user.id;
    const learner = await createTestLearner(org.id, { userId: user.id });
    learnerId = learner.id;
  });

  describe("getCollections", () => {
    it("returns empty array when no collections exist", async () => {
      const result = await getCollections(learnerId, db);
      expect(result).toEqual([]);
    });

    it("returns collections with file counts", async () => {
      const col = await createCollection(
        learnerId,
        orgId,
        { name: "Test Collection" },
        db
      );
      expect(col.success).toBe(true);

      const collections = await getCollections(learnerId, db);
      expect(collections).toHaveLength(1);
      expect(collections[0].name).toBe("Test Collection");
      expect(collections[0].fileCount).toBe(0);
    });

    it("returns multiple collections sorted by creation date", async () => {
      await createCollection(learnerId, orgId, { name: "First" }, db);
      await createCollection(learnerId, orgId, { name: "Second" }, db);

      const collections = await getCollections(learnerId, db);
      expect(collections).toHaveLength(2);
    });
  });

  describe("createCollection", () => {
    it("creates a private collection", async () => {
      const result = await createCollection(
        learnerId,
        orgId,
        { name: "Biology Notes", description: "My notes" },
        db
      );
      expect(result.success).toBe(true);
      expect(result.collectionId).toBeDefined();
    });

    it("rejects empty name", async () => {
      const result = await createCollection(
        learnerId,
        orgId,
        { name: "" },
        db
      );
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("rejects name exceeding 255 chars", async () => {
      const result = await createCollection(
        learnerId,
        orgId,
        { name: "x".repeat(256) },
        db
      );
      expect(result.success).toBe(false);
    });
  });

  describe("getFiles", () => {
    it("returns empty array for collection with no files", async () => {
      const col = await createCollection(
        learnerId,
        orgId,
        { name: "Empty" },
        db
      );

      const files = await getFiles(learnerId, col.collectionId!, db);
      expect(files).toEqual([]);
    });

    it("returns files after upload registration", async () => {
      const col = await createCollection(
        learnerId,
        orgId,
        { name: "With Files" },
        db
      );

      await registerUpload(
        userId,
        orgId,
        learnerId,
        {
          collectionId: col.collectionId!,
          filename: "notes.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
        },
        db
      );

      const files = await getFiles(learnerId, col.collectionId!, db);
      expect(files).toHaveLength(1);
      expect(files[0].filename).toBe("notes.pdf");
      expect(files[0].status).toBe("pending");
      expect(files[0].sizeBytes).toBe(1024);
    });
  });

  describe("registerUpload", () => {
    it("registers a valid upload", async () => {
      const col = await createCollection(
        learnerId,
        orgId,
        { name: "Upload Test" },
        db
      );

      const result = await registerUpload(
        userId,
        orgId,
        learnerId,
        {
          collectionId: col.collectionId!,
          filename: "document.pdf",
          mimeType: "application/pdf",
          sizeBytes: 5000,
        },
        db
      );

      expect(result.success).toBe(true);
      expect(result.fileId).toBeDefined();
      expect(result.storagePath).toContain("sources/");
      expect(result.storagePath).toContain("document.pdf");
    });

    it("rejects invalid mime type", async () => {
      const col = await createCollection(
        learnerId,
        orgId,
        { name: "Upload Test" },
        db
      );

      const result = await registerUpload(
        userId,
        orgId,
        learnerId,
        {
          collectionId: col.collectionId!,
          filename: "image.png",
          mimeType: "image/png",
          sizeBytes: 1024,
        },
        db
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("rejects empty filename", async () => {
      const col = await createCollection(
        learnerId,
        orgId,
        { name: "Upload Test" },
        db
      );

      const result = await registerUpload(
        userId,
        orgId,
        learnerId,
        {
          collectionId: col.collectionId!,
          filename: "",
          mimeType: "application/pdf",
          sizeBytes: 1024,
        },
        db
      );

      expect(result.success).toBe(false);
    });

    it("rejects zero-byte file", async () => {
      const col = await createCollection(
        learnerId,
        orgId,
        { name: "Upload Test" },
        db
      );

      const result = await registerUpload(
        userId,
        orgId,
        learnerId,
        {
          collectionId: col.collectionId!,
          filename: "empty.pdf",
          mimeType: "application/pdf",
          sizeBytes: 0,
        },
        db
      );

      expect(result.success).toBe(false);
    });
  });

  describe("getTopicMappings", () => {
    it("returns empty array when file has no chunks", async () => {
      const result = await getTopicMappings(learnerId, crypto.randomUUID(), db);
      expect(result).toEqual([]);
    });

    it("returns aggregated topic mappings", async () => {
      const col = await createCollection(
        learnerId,
        orgId,
        { name: "Mapped" },
        db
      );
      const upload = await registerUpload(
        userId,
        orgId,
        learnerId,
        {
          collectionId: col.collectionId!,
          filename: "mapped.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048,
        },
        db
      );

      const qual = await createTestQualification();
      const topicId = qual.topics[0].id;

      // Insert chunks and mappings directly for testing
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

      const mappings = await getTopicMappings(learnerId, upload.fileId!, db);
      expect(mappings).toHaveLength(1);
      expect(mappings[0].topicId).toBe(topicId);
      expect(mappings[0].chunkCount).toBe(2);
      expect(mappings[0].avgConfidence).toBeCloseTo(0.875, 2);
    });
  });

  describe("error handling", () => {
    it("createCollection returns error on DB failure", async () => {
      // Non-existent learner_id triggers FK violation
      const result = await createCollection(
        crypto.randomUUID(),
        orgId,
        { name: "Should Fail" },
        db
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to create collection");
    });

    it("registerUpload returns error for non-owned collection", async () => {
      const result = await registerUpload(
        userId,
        orgId,
        learnerId,
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

    it("createCollection handles non-Error thrown value", async () => {
      const failingDb = {
        insert: () => {
          throw "string error";
        },
      } as unknown as Database;

      const result = await createCollection(
        learnerId,
        orgId,
        { name: "Fail" },
        failingDb
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to create collection");
    });

    it("registerUpload handles non-Error thrown value", async () => {
      const failingDb = {
        select: () => {
          throw "string error";
        },
      } as unknown as Database;

      const col = await createCollection(
        learnerId,
        orgId,
        { name: "For Error Test" },
        db
      );

      const result = await registerUpload(
        userId,
        orgId,
        learnerId,
        {
          collectionId: col.collectionId!,
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
});

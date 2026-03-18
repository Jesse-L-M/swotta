"use server";

import { eq, and, desc, inArray } from "drizzle-orm";
import { db, type Database } from "@/lib/db";
import {
  sourceCollections,
  sourceFiles,
  sourceChunks,
  sourceMappings,
} from "@/db/schema/sources";
import { topics } from "@/db/schema/curriculum";
import { structuredLog } from "@/lib/logger";
import {
  uploadFileSchema,
  createCollectionSchema,
  type UploadFileInput,
  type CreateCollectionInput,
} from "@/components/sources/upload-utils";
import { buildStoragePath } from "@/components/sources/storage";
import type {
  SourceFileInfo,
  SourceCollectionInfo,
  TopicMapping,
} from "@/components/sources/source-types";
import type { TopicId } from "@/lib/types";

export async function getCollections(
  learnerId: string,
  database: Database = db
): Promise<SourceCollectionInfo[]> {
  const rows = await database
    .select({
      id: sourceCollections.id,
      name: sourceCollections.name,
      description: sourceCollections.description,
      scope: sourceCollections.scope,
      createdAt: sourceCollections.createdAt,
    })
    .from(sourceCollections)
    .where(eq(sourceCollections.learnerId, learnerId))
    .orderBy(desc(sourceCollections.createdAt));

  const collectionsWithCounts: SourceCollectionInfo[] = [];
  for (const row of rows) {
    const files = await database
      .select({ id: sourceFiles.id })
      .from(sourceFiles)
      .where(eq(sourceFiles.collectionId, row.id));

    collectionsWithCounts.push({
      id: row.id,
      name: row.name,
      description: row.description,
      scope: row.scope,
      fileCount: files.length,
      createdAt: row.createdAt,
    });
  }

  return collectionsWithCounts;
}

export async function getFiles(
  collectionId: string,
  database: Database = db
): Promise<SourceFileInfo[]> {
  const rows = await database
    .select({
      id: sourceFiles.id,
      collectionId: sourceFiles.collectionId,
      filename: sourceFiles.filename,
      mimeType: sourceFiles.mimeType,
      sizeBytes: sourceFiles.sizeBytes,
      status: sourceFiles.status,
      pageCount: sourceFiles.pageCount,
      errorMessage: sourceFiles.errorMessage,
      processedAt: sourceFiles.processedAt,
      createdAt: sourceFiles.createdAt,
    })
    .from(sourceFiles)
    .where(eq(sourceFiles.collectionId, collectionId))
    .orderBy(desc(sourceFiles.createdAt));

  return rows.map((r) => ({
    ...r,
    sizeBytes: Number(r.sizeBytes),
  }));
}

export async function createCollection(
  learnerId: string,
  orgId: string,
  input: CreateCollectionInput,
  database: Database = db
): Promise<{ success: boolean; collectionId?: string; error?: string }> {
  const parsed = createCollectionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message };
  }

  try {
    const [collection] = await database
      .insert(sourceCollections)
      .values({
        scope: "private",
        learnerId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
      })
      .returning({ id: sourceCollections.id });

    structuredLog("collection.created", {
      learnerId,
      collectionId: collection.id,
    });

    return { success: true, collectionId: collection.id };
  } catch (err) {
    structuredLog("collection.create_error", {
      learnerId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { success: false, error: "Failed to create collection" };
  }
}

export async function registerUpload(
  userId: string,
  orgId: string,
  input: UploadFileInput,
  database: Database = db
): Promise<{
  success: boolean;
  fileId?: string;
  storagePath?: string;
  error?: string;
}> {
  const parsed = uploadFileSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message };
  }

  try {
    const fileId = crypto.randomUUID();
    const storagePath = buildStoragePath(
      orgId,
      parsed.data.collectionId,
      fileId,
      parsed.data.filename
    );

    await database.insert(sourceFiles).values({
      id: fileId,
      collectionId: parsed.data.collectionId,
      uploadedByUserId: userId,
      filename: parsed.data.filename,
      mimeType: parsed.data.mimeType,
      storagePath,
      sizeBytes: parsed.data.sizeBytes,
      status: "pending",
    });

    structuredLog("upload.registered", {
      userId,
      fileId,
      filename: parsed.data.filename,
      collectionId: parsed.data.collectionId,
    });

    return { success: true, fileId, storagePath };
  } catch (err) {
    structuredLog("upload.register_error", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { success: false, error: "Failed to register upload" };
  }
}

export async function getTopicMappings(
  fileId: string,
  database: Database = db
): Promise<TopicMapping[]> {
  const chunks = await database
    .select({ id: sourceChunks.id })
    .from(sourceChunks)
    .where(eq(sourceChunks.fileId, fileId));

  if (chunks.length === 0) return [];

  const chunkIds = chunks.map((c) => c.id);

  const mappings = await database
    .select({
      topicId: sourceMappings.topicId,
      topicName: topics.name,
      confidence: sourceMappings.confidence,
    })
    .from(sourceMappings)
    .innerJoin(topics, eq(sourceMappings.topicId, topics.id))
    .where(inArray(sourceMappings.chunkId, chunkIds));

  const byTopic = new Map<
    string,
    { topicName: string; chunkCount: number; totalConfidence: number }
  >();

  for (const m of mappings) {
    if (!m.topicId) continue;
    const existing = byTopic.get(m.topicId);
    const conf = Number(m.confidence);
    if (existing) {
      existing.chunkCount++;
      existing.totalConfidence += conf;
    } else {
      byTopic.set(m.topicId, {
        topicName: m.topicName,
        chunkCount: 1,
        totalConfidence: conf,
      });
    }
  }

  return Array.from(byTopic.entries()).map(([topicId, data]) => ({
    topicId: topicId as TopicId,
    topicName: data.topicName,
    chunkCount: data.chunkCount,
    avgConfidence: data.totalConfidence / data.chunkCount,
  }));
}

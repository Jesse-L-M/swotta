"use server";

import { and, count, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, type Database } from "@/lib/db";
import { requireLearner } from "@/lib/auth";
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
  validateFilesBatch,
  createCollectionSchema,
  type UploadFileInput,
  type CreateCollectionInput,
} from "@/components/sources/upload-utils";
import {
  buildStoragePath,
  createConfiguredStorageClient,
} from "@/components/sources/storage";
import type {
  FileStatus,
  SourceFileInfo,
  SourceCollectionInfo,
  TopicMapping,
} from "@/components/sources/source-types";
import type { TopicId } from "@/lib/types";

const collectionIdSchema = z.string().uuid("Invalid collection ID");
const fileIdSchema = z.string().uuid("Invalid file ID");

interface LearnerScope {
  userId: string;
  orgId: string;
  learnerId: string;
}

export interface UploadedSourceFileResult {
  fileId: string | null;
  filename: string;
  status: FileStatus;
  errorMessage: string | null;
}

export type UploadSourcesResult =
  | { success: false; error: string }
  | {
      success: true;
      collection: { id: string; name: string; created: boolean };
      files: UploadedSourceFileResult[];
      topicMappings: TopicMapping[];
      warnings: string[];
    };

async function getLearnerScope(database: Database): Promise<LearnerScope> {
  const ctx = await requireLearner(database);
  return {
    userId: ctx.user.id,
    orgId: ctx.orgId,
    learnerId: ctx.learnerId,
  };
}

async function listCollectionsForLearner(
  learnerId: string,
  database: Database
): Promise<SourceCollectionInfo[]> {
  const rows = await database
    .select({
      id: sourceCollections.id,
      name: sourceCollections.name,
      description: sourceCollections.description,
      scope: sourceCollections.scope,
      createdAt: sourceCollections.createdAt,
      fileCount: count(sourceFiles.id),
    })
    .from(sourceCollections)
    .leftJoin(sourceFiles, eq(sourceCollections.id, sourceFiles.collectionId))
    .where(eq(sourceCollections.learnerId, learnerId))
    .groupBy(
      sourceCollections.id,
      sourceCollections.name,
      sourceCollections.description,
      sourceCollections.scope,
      sourceCollections.createdAt
    )
    .orderBy(desc(sourceCollections.createdAt));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    scope: row.scope,
    fileCount: Number(row.fileCount),
    createdAt: row.createdAt,
  }));
}

async function listFilesForCollection(
  learnerId: string,
  collectionId: string,
  database: Database
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
    .innerJoin(
      sourceCollections,
      eq(sourceFiles.collectionId, sourceCollections.id)
    )
    .where(
      and(
        eq(sourceFiles.collectionId, collectionId),
        eq(sourceCollections.learnerId, learnerId)
      )
    )
    .orderBy(desc(sourceFiles.createdAt));

  return rows.map(mapSourceFileInfo);
}

async function listFilesForCollections(
  learnerId: string,
  collectionIds: string[],
  database: Database
): Promise<SourceFileInfo[]> {
  if (collectionIds.length === 0) return [];

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
    .innerJoin(
      sourceCollections,
      eq(sourceFiles.collectionId, sourceCollections.id)
    )
    .where(
      and(
        inArray(sourceFiles.collectionId, collectionIds),
        eq(sourceCollections.learnerId, learnerId)
      )
    )
    .orderBy(desc(sourceFiles.createdAt));

  return rows.map(mapSourceFileInfo);
}

async function listFilesByIds(
  learnerId: string,
  fileIds: string[],
  database: Database
): Promise<SourceFileInfo[]> {
  if (fileIds.length === 0) return [];

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
    .innerJoin(
      sourceCollections,
      eq(sourceFiles.collectionId, sourceCollections.id)
    )
    .where(
      and(
        inArray(sourceFiles.id, fileIds),
        eq(sourceCollections.learnerId, learnerId)
      )
    )
    .orderBy(desc(sourceFiles.createdAt));

  return rows.map(mapSourceFileInfo);
}

async function findOwnedCollection(
  learnerId: string,
  collectionId: string,
  database: Database
): Promise<{
  id: string;
  name: string;
  description: string | null;
} | null> {
  const [collection] = await database
    .select({
      id: sourceCollections.id,
      name: sourceCollections.name,
      description: sourceCollections.description,
    })
    .from(sourceCollections)
    .where(
      and(
        eq(sourceCollections.id, collectionId),
        eq(sourceCollections.learnerId, learnerId)
      )
    )
    .limit(1);

  return collection ?? null;
}

async function createCollectionRecord(
  scope: LearnerScope,
  input: CreateCollectionInput,
  database: Database
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
        learnerId: scope.learnerId,
        orgId: scope.orgId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
      })
      .returning({ id: sourceCollections.id });

    structuredLog("collection.created", {
      learnerId: scope.learnerId,
      collectionId: collection.id,
    });

    return { success: true, collectionId: collection.id };
  } catch (err) {
    structuredLog("collection.create_error", {
      learnerId: scope.learnerId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { success: false, error: "Failed to create collection" };
  }
}

async function registerUploadRecord(
  scope: LearnerScope,
  input: UploadFileInput,
  database: Database
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
    const collection = await findOwnedCollection(
      scope.learnerId,
      parsed.data.collectionId,
      database
    );

    if (!collection) {
      return { success: false, error: "Collection not found" };
    }

    const fileId = crypto.randomUUID();
    const storagePath = buildStoragePath(
      scope.orgId,
      parsed.data.collectionId,
      fileId,
      parsed.data.filename
    );

    await database.insert(sourceFiles).values({
      id: fileId,
      collectionId: parsed.data.collectionId,
      uploadedByUserId: scope.userId,
      filename: parsed.data.filename,
      mimeType: parsed.data.mimeType,
      storagePath,
      sizeBytes: parsed.data.sizeBytes,
      status: "pending",
    });

    structuredLog("upload.registered", {
      userId: scope.userId,
      fileId,
      filename: parsed.data.filename,
      collectionId: parsed.data.collectionId,
    });

    return { success: true, fileId, storagePath };
  } catch (err) {
    structuredLog("upload.register_error", {
      userId: scope.userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { success: false, error: "Failed to register upload" };
  }
}

async function markFileFailed(
  fileId: string,
  errorMessage: string,
  database: Database
): Promise<void> {
  await database
    .update(sourceFiles)
    .set({ status: "failed", errorMessage })
    .where(eq(sourceFiles.id, fileId));
}

function mapSourceFileInfo(row: {
  id: string;
  collectionId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: FileStatus;
  pageCount: number | null;
  errorMessage: string | null;
  processedAt: Date | null;
  createdAt: Date;
}): SourceFileInfo {
  return {
    ...row,
    sizeBytes: Number(row.sizeBytes),
  };
}

function normalizeStringEntry(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function extractFilesFromFormData(formData: FormData): File[] {
  return formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
}

function buildDefaultCollectionName(files: File[]): string {
  const fallback = `Study materials ${new Date().toISOString().slice(0, 10)}`;
  const singleFileStem = files[0]?.name.replace(/\.[^.]+$/, "").trim();

  if (files.length === 1 && singleFileStem) {
    return singleFileStem.slice(0, 255);
  }

  return fallback.slice(0, 255);
}

function revalidateSourcesViews(): void {
  revalidatePath("/sources");
  revalidatePath("/sources/upload");
}

function buildUploadWarnings(storageMode: "gcs" | "unconfigured"): string[] {
  if (storageMode === "unconfigured") {
    return [
      "Cloud Storage is not configured in this environment. File records were created as failed and the upload bytes were not stored.",
    ];
  }

  return [
    "Files are stored immediately. Automatic processing and topic mapping still depend on the ingestion worker.",
  ];
}

export async function getSourcesPageData(
  database: Database = db
): Promise<{
  collections: SourceCollectionInfo[];
  filesByCollectionId: Record<string, SourceFileInfo[]>;
  pendingFileCount: number;
  failedFileCount: number;
}> {
  const { learnerId } = await getLearnerScope(database);
  const collections = await listCollectionsForLearner(learnerId, database);
  const files = await listFilesForCollections(
    learnerId,
    collections.map((collection) => collection.id),
    database
  );

  const filesByCollectionId: Record<string, SourceFileInfo[]> = {};

  for (const collection of collections) {
    filesByCollectionId[collection.id] = [];
  }

  for (const file of files) {
    filesByCollectionId[file.collectionId] ??= [];
    filesByCollectionId[file.collectionId].push(file);
  }

  return {
    collections,
    filesByCollectionId,
    pendingFileCount: files.filter(
      (file) => file.status === "pending" || file.status === "processing"
    ).length,
    failedFileCount: files.filter((file) => file.status === "failed").length,
  };
}

export async function getCollections(
  database: Database = db
): Promise<SourceCollectionInfo[]> {
  const { learnerId } = await getLearnerScope(database);
  return listCollectionsForLearner(learnerId, database);
}

export async function getFiles(
  collectionId: string,
  database: Database = db
): Promise<SourceFileInfo[]> {
  const parsed = collectionIdSchema.safeParse(collectionId);
  if (!parsed.success) return [];

  const { learnerId } = await getLearnerScope(database);
  return listFilesForCollection(learnerId, parsed.data, database);
}

export async function createCollection(
  input: CreateCollectionInput,
  database: Database = db
): Promise<{ success: boolean; collectionId?: string; error?: string }> {
  const scope = await getLearnerScope(database);
  const result = await createCollectionRecord(scope, input, database);

  if (result.success) {
    revalidateSourcesViews();
  }

  return result;
}

export async function registerUpload(
  input: UploadFileInput,
  database: Database = db
): Promise<{
  success: boolean;
  fileId?: string;
  storagePath?: string;
  error?: string;
}> {
  const scope = await getLearnerScope(database);
  return registerUploadRecord(scope, input, database);
}

export async function uploadSourceFiles(
  formData: FormData,
  database: Database = db
): Promise<UploadSourcesResult> {
  const scope = await getLearnerScope(database);
  const files = extractFilesFromFormData(formData);
  const validation = validateFilesBatch(
    files.map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type,
    }))
  );

  if (!validation.valid) {
    return {
      success: false,
      error: validation.errors[0] ?? "Select at least one valid file",
    };
  }

  const requestedCollectionId = normalizeStringEntry(formData.get("collectionId"));
  const requestedCollectionName = normalizeStringEntry(formData.get("collectionName"));

  let collection: { id: string; name: string; created: boolean };

  if (requestedCollectionId) {
    const parsed = collectionIdSchema.safeParse(requestedCollectionId);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid collection ID" };
    }

    const existingCollection = await findOwnedCollection(
      scope.learnerId,
      parsed.data,
      database
    );

    if (!existingCollection) {
      return { success: false, error: "Collection not found" };
    }

    collection = {
      id: existingCollection.id,
      name: existingCollection.name,
      created: false,
    };
  } else {
    const collectionName = requestedCollectionName ?? buildDefaultCollectionName(files);
    const createdCollection = await createCollectionRecord(
      scope,
      { name: collectionName },
      database
    );

    if (!createdCollection.success || !createdCollection.collectionId) {
      return {
        success: false,
        error: createdCollection.error ?? "Failed to create collection",
      };
    }

    collection = {
      id: createdCollection.collectionId,
      name: collectionName,
      created: true,
    };
  }

  const storageClient = createConfiguredStorageClient();
  const initialResults: UploadedSourceFileResult[] = [];

  for (const file of files) {
    const uploadRecord = await registerUploadRecord(
      scope,
      {
        collectionId: collection.id,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      },
      database
    );

    if (!uploadRecord.success || !uploadRecord.fileId || !uploadRecord.storagePath) {
      initialResults.push({
        fileId: null,
        filename: file.name,
        status: "failed",
        errorMessage: uploadRecord.error ?? "Failed to register upload",
      });
      continue;
    }

    if (storageClient.mode === "unconfigured") {
      const errorMessage =
        "Cloud Storage is not configured for uploads in this environment";
      await markFileFailed(uploadRecord.fileId, errorMessage, database);
      initialResults.push({
        fileId: uploadRecord.fileId,
        filename: file.name,
        status: "failed",
        errorMessage,
      });
      continue;
    }

    try {
      const contents = new Uint8Array(await file.arrayBuffer());
      await storageClient.uploadFile(
        uploadRecord.storagePath,
        contents,
        file.type
      );
      initialResults.push({
        fileId: uploadRecord.fileId,
        filename: file.name,
        status: "pending",
        errorMessage: null,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to upload file";

      await markFileFailed(uploadRecord.fileId, errorMessage, database);
      structuredLog("upload.store_error", {
        userId: scope.userId,
        fileId: uploadRecord.fileId,
        filename: file.name,
        error: errorMessage,
      });

      initialResults.push({
        fileId: uploadRecord.fileId,
        filename: file.name,
        status: "failed",
        errorMessage,
      });
    }
  }

  const storedFiles = await listFilesByIds(
    scope.learnerId,
    initialResults
      .map((result) => result.fileId)
      .filter((fileId): fileId is string => fileId !== null),
    database
  );
  const storedFileById = new Map(storedFiles.map((file) => [file.id, file]));

  revalidateSourcesViews();

  return {
    success: true,
    collection,
    files: initialResults.map((result) => {
      if (!result.fileId) return result;

      const storedFile = storedFileById.get(result.fileId);
      if (!storedFile) return result;

      return {
        fileId: storedFile.id,
        filename: storedFile.filename,
        status: storedFile.status,
        errorMessage: storedFile.errorMessage,
      };
    }),
    topicMappings: [],
    warnings: buildUploadWarnings(storageClient.mode),
  };
}

export async function getTopicMappings(
  fileId: string,
  database: Database = db
): Promise<TopicMapping[]> {
  const parsed = fileIdSchema.safeParse(fileId);
  if (!parsed.success) return [];

  const { learnerId } = await getLearnerScope(database);
  const mappings = await database
    .select({
      topicId: sourceMappings.topicId,
      topicName: topics.name,
      confidence: sourceMappings.confidence,
    })
    .from(sourceChunks)
    .innerJoin(sourceMappings, eq(sourceChunks.id, sourceMappings.chunkId))
    .innerJoin(topics, eq(sourceMappings.topicId, topics.id))
    .innerJoin(sourceFiles, eq(sourceChunks.fileId, sourceFiles.id))
    .innerJoin(
      sourceCollections,
      eq(sourceFiles.collectionId, sourceCollections.id)
    )
    .where(
      and(
        eq(sourceChunks.fileId, parsed.data),
        eq(sourceCollections.learnerId, learnerId)
      )
    );

  if (mappings.length === 0) return [];

  const byTopic = new Map<
    string,
    { topicName: string; chunkCount: number; totalConfidence: number }
  >();

  for (const mapping of mappings) {
    if (!mapping.topicId) continue;

    const existing = byTopic.get(mapping.topicId);
    const confidence = Number(mapping.confidence);

    if (existing) {
      existing.chunkCount += 1;
      existing.totalConfidence += confidence;
      continue;
    }

    byTopic.set(mapping.topicId, {
      topicName: mapping.topicName,
      chunkCount: 1,
      totalConfidence: confidence,
    });
  }

  return Array.from(byTopic.entries()).map(([topicId, data]) => ({
    topicId: topicId as TopicId,
    topicName: data.topicName,
    chunkCount: data.chunkCount,
    avgConfidence: data.totalConfidence / data.chunkCount,
  }));
}

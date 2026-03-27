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
import { queueSourceFileUploaded } from "@/lib/background-events";
import type {
  FileStatus,
  SourceFileInfo,
  SourceCollectionInfo,
  TopicMapping,
} from "@/components/sources/source-types";
import type { TopicId } from "@/lib/types";

const collectionIdSchema = z.string().uuid("Invalid collection ID");
const fileIdSchema = z.string().uuid("Invalid file ID");
const preparedUploadFileSchema = uploadFileSchema.omit({
  collectionId: true,
});
const prepareSourceUploadsSchema = z.object({
  collectionId: collectionIdSchema.optional(),
  collectionName: createCollectionSchema.shape.name.optional(),
  files: z.array(preparedUploadFileSchema).min(1, "No files selected"),
});
const uploadFailureReportSchema = z.object({
  fileId: fileIdSchema,
  errorMessage: z
    .string()
    .trim()
    .min(1, "Error message is required")
    .max(1000, "Error message too long"),
});
const uploadSuccessReportSchema = z.object({
  fileId: fileIdSchema,
  qualificationVersionId: z.string().uuid().optional(),
});

interface LearnerScope {
  userId: string;
  orgId: string;
  learnerId: string;
}

export interface PreparedSourceFileResult {
  fileId: string | null;
  filename: string;
  status: FileStatus;
  errorMessage: string | null;
  uploadUrl: string | null;
}

export type PrepareSourceUploadsInput = z.infer<
  typeof prepareSourceUploadsSchema
>;

export type PrepareSourceUploadsResult =
  | { success: false; error: string }
  | {
      success: true;
      collection: { id: string; name: string; created: boolean };
      files: PreparedSourceFileResult[];
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

async function markPendingFileFailed(
  fileId: string,
  errorMessage: string,
  database: Database
): Promise<boolean> {
  const failed = await database
    .update(sourceFiles)
    .set({ status: "failed", errorMessage })
    .where(and(eq(sourceFiles.id, fileId), eq(sourceFiles.status, "pending")))
    .returning({ id: sourceFiles.id });

  return failed.length > 0;
}

async function claimPendingFileForQueueing(
  fileId: string,
  database: Database
): Promise<boolean> {
  const claimed = await database
    .update(sourceFiles)
    .set({ status: "queueing", errorMessage: null, processedAt: null })
    .where(and(eq(sourceFiles.id, fileId), eq(sourceFiles.status, "pending")))
    .returning({ id: sourceFiles.id });

  return claimed.length > 0;
}

async function markQueuedFileProcessing(
  fileId: string,
  database: Database
): Promise<boolean> {
  const updated = await database
    .update(sourceFiles)
    .set({ status: "processing", errorMessage: null, processedAt: null })
    .where(and(eq(sourceFiles.id, fileId), eq(sourceFiles.status, "queueing")))
    .returning({ id: sourceFiles.id });

  return updated.length > 0;
}

async function markQueueingFilePending(
  fileId: string,
  database: Database
): Promise<boolean> {
  const updated = await database
    .update(sourceFiles)
    .set({ status: "pending", errorMessage: null, processedAt: null })
    .where(and(eq(sourceFiles.id, fileId), eq(sourceFiles.status, "queueing")))
    .returning({ id: sourceFiles.id });

  return updated.length > 0;
}

async function waitForUploadQueueingResolution(
  learnerId: string,
  fileId: string,
  database: Database,
  attempts = 5,
  delayMs = 25
): Promise<SourceFileInfo | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const [file] = await listFilesByIds(learnerId, [fileId], database);

    if (!file || file.status !== "queueing") {
      return file ?? null;
    }

    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const [file] = await listFilesByIds(learnerId, [fileId], database);
  return file ?? null;
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

function buildDefaultCollectionName(
  files: Array<{ filename: string }>
): string {
  const fallback = `Study materials ${new Date().toISOString().slice(0, 10)}`;
  const singleFileStem = files[0]?.filename.replace(/\.[^.]+$/, "").trim();

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

  return [];
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
      (file) =>
        file.status === "pending"
        || file.status === "queueing"
        || file.status === "processing"
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

export async function prepareSourceUploads(
  input: PrepareSourceUploadsInput,
  database: Database = db
): Promise<PrepareSourceUploadsResult> {
  const scope = await getLearnerScope(database);
  const parsedInput = prepareSourceUploadsSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      success: false,
      error: parsedInput.error.issues[0]?.message ?? "Invalid upload request",
    };
  }

  const files = parsedInput.data.files;
  const validation = validateFilesBatch(
    files.map((file) => ({
      name: file.filename,
      size: file.sizeBytes,
      type: file.mimeType,
    }))
  );

  if (!validation.valid) {
    return {
      success: false,
      error: validation.errors[0] ?? "Select at least one valid file",
    };
  }

  const requestedCollectionId = parsedInput.data.collectionId;
  const requestedCollectionName = parsedInput.data.collectionName;

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
    const collectionName =
      requestedCollectionName ?? buildDefaultCollectionName(files);
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

  let storageClient: ReturnType<typeof createConfiguredStorageClient>;
  try {
    storageClient = createConfiguredStorageClient();
  } catch (error) {
    structuredLog("upload.storage_config_error", {
      userId: scope.userId,
      collectionId: collection.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: "Cloud Storage is misconfigured for uploads",
    };
  }

  const initialResults: PreparedSourceFileResult[] = [];

  for (const file of files) {
    const uploadRecord = await registerUploadRecord(
      scope,
      {
        collectionId: collection.id,
        filename: file.filename,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      },
      database
    );

    if (!uploadRecord.success || !uploadRecord.fileId || !uploadRecord.storagePath) {
      initialResults.push({
        fileId: null,
        filename: file.filename,
        status: "failed",
        errorMessage: uploadRecord.error ?? "Failed to register upload",
        uploadUrl: null,
      });
      continue;
    }

    if (storageClient.mode === "unconfigured") {
      const errorMessage =
        "Cloud Storage is not configured for uploads in this environment";
      await markFileFailed(uploadRecord.fileId, errorMessage, database);
      initialResults.push({
        fileId: uploadRecord.fileId,
        filename: file.filename,
        status: "failed",
        errorMessage,
        uploadUrl: null,
      });
      continue;
    }

    try {
      const uploadUrl = await storageClient.generateSignedUploadUrl(
        uploadRecord.storagePath,
        file.mimeType,
        file.sizeBytes
      );
      initialResults.push({
        fileId: uploadRecord.fileId,
        filename: file.filename,
        status: "pending",
        errorMessage: null,
        uploadUrl,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to prepare upload";

      await markFileFailed(uploadRecord.fileId, errorMessage, database);
      structuredLog("upload.prepare_error", {
        userId: scope.userId,
        fileId: uploadRecord.fileId,
        filename: file.filename,
        error: errorMessage,
      });

      initialResults.push({
        fileId: uploadRecord.fileId,
        filename: file.filename,
        status: "failed",
        errorMessage,
        uploadUrl: null,
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
        uploadUrl: result.uploadUrl,
      };
    }),
    topicMappings: [],
    warnings: buildUploadWarnings(storageClient.mode),
  };
}

export async function reportUploadFailure(
  input: z.infer<typeof uploadFailureReportSchema>,
  database: Database = db
): Promise<{ success: boolean; error?: string }> {
  const parsed = uploadFailureReportSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message };
  }

  const scope = await getLearnerScope(database);
  const [file] = await listFilesByIds(scope.learnerId, [parsed.data.fileId], database);

  if (!file) {
    return { success: false, error: "File not found" };
  }

  if (file.status === "failed") {
    return { success: true };
  }

  if (file.status !== "pending") {
    return { success: true };
  }

  const failed = await markPendingFileFailed(
    file.id,
    parsed.data.errorMessage,
    database
  );

  if (!failed) {
    return { success: true };
  }

  structuredLog("upload.client_failure", {
    userId: scope.userId,
    fileId: file.id,
    filename: file.filename,
    error: parsed.data.errorMessage,
  });
  revalidateSourcesViews();

  return { success: true };
}

export async function reportUploadSuccess(
  input: z.infer<typeof uploadSuccessReportSchema>,
  database: Database = db
): Promise<{ success: boolean; error?: string }> {
  const parsed = uploadSuccessReportSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message };
  }

  const scope = await getLearnerScope(database);
  const [file] = await listFilesByIds(scope.learnerId, [parsed.data.fileId], database);

  if (!file) {
    return { success: false, error: "File not found" };
  }

  if (
    file.status === "ready"
    || file.status === "processing"
  ) {
    return { success: true };
  }

  if (file.status === "failed") {
    return {
      success: false,
      error: file.errorMessage ?? "This file can no longer be processed",
    };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const currentFile =
      attempt === 0
        ? file
        : (await listFilesByIds(scope.learnerId, [parsed.data.fileId], database))[0];

    if (!currentFile) {
      return { success: false, error: "File not found" };
    }

    if (
      currentFile.status === "ready"
      || currentFile.status === "processing"
    ) {
      return { success: true };
    }

    if (currentFile.status === "failed") {
      return {
        success: false,
        error: currentFile.errorMessage ?? "This file can no longer be processed",
      };
    }

    if (currentFile.status === "queueing") {
      const resolvedFile = await waitForUploadQueueingResolution(
        scope.learnerId,
        currentFile.id,
        database
      );

      if (!resolvedFile) {
        return { success: false, error: "File not found" };
      }

      if (
        resolvedFile.status === "ready"
        || resolvedFile.status === "processing"
      ) {
        return { success: true };
      }

      if (resolvedFile.status === "failed") {
        return {
          success: false,
          error:
            resolvedFile.errorMessage ?? "This file can no longer be processed",
        };
      }

      continue;
    }

    const claimed = await claimPendingFileForQueueing(currentFile.id, database);
    if (!claimed) {
      continue;
    }

    try {
      await queueSourceFileUploaded(
        currentFile.id,
        parsed.data.qualificationVersionId
      );
    } catch (error) {
      await markQueueingFilePending(currentFile.id, database);

      const errorMessage =
        error instanceof Error
          ? error.message
          : "Upload completed, but processing could not be queued";

      structuredLog("upload.queue_error", {
        userId: scope.userId,
        fileId: currentFile.id,
        filename: currentFile.filename,
        error: errorMessage,
      });

      return {
        success: false,
        error: "Upload completed, but processing could not be queued",
      };
    }

    const markedProcessing = await markQueuedFileProcessing(
      currentFile.id,
      database
    );

    if (!markedProcessing) {
      const [latestFile] = await listFilesByIds(
        scope.learnerId,
        [currentFile.id],
        database
      );

      if (
        latestFile?.status !== "ready"
        && latestFile?.status !== "processing"
      ) {
        return {
          success: false,
          error: "Upload completed, but processing state could not be confirmed",
        };
      }
    }

    structuredLog("upload.queued", {
      userId: scope.userId,
      fileId: currentFile.id,
      filename: currentFile.filename,
    });
    revalidateSourcesViews();

    return { success: true };
  }

  return {
    success: false,
    error: "Upload completed, but processing state could not be confirmed",
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

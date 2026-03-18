import { eq, sql, and, inArray } from "drizzle-orm";
import {
  sourceFiles,
  sourceCollections,
  sourceChunks,
  chunkEmbeddings,
  sourceMappings,
} from "@/db/schema/sources";
import { topics } from "@/db/schema/curriculum";
import { learners, enrollments, classes, learnerQualifications } from "@/db/schema/identity";
import { db as defaultDbInstance, type Database } from "@/lib/db";
import type { LearnerId, TopicId, QualificationVersionId, ChunkId, ScopeType, RetrievalResult } from "@/lib/types";
import { classifyChunks, type TopicInfo } from "@/ai/analysis";
import { structuredLog } from "@/lib/logger";
import { getEnv } from "@/lib/env";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export class IngestionError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "IngestionError";
  }
}

export interface ProcessFileResult {
  chunksCreated: number;
  embeddingsCreated: number;
  mappingsCreated: number;
  topicsCovered: TopicId[];
}

export interface TextChunk {
  content: string;
  index: number;
  tokenCount: number;
  startPage?: number;
  endPage?: number;
}

export interface IngestionDeps {
  db: Database;
  extractText: (storagePath: string, mimeType: string) => Promise<string>;
  generateEmbeddings: (texts: string[]) => Promise<number[][]>;
  generateEmbedding: (text: string) => Promise<number[]>;
  classifyChunks: typeof classifyChunks;
}

// ---------------------------------------------------------------------------
// Text Chunking (pure function)
// ---------------------------------------------------------------------------

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function chunkText(text: string, targetTokens = 500): TextChunk[] {
  const targetChars = targetTokens * CHARS_PER_TOKEN;
  const trimmed = text.trim();
  if (!trimmed) return [];

  const paragraphs = trimmed.split(/\n\n+/);
  const chunks: TextChunk[] = [];
  let current = "";
  let chunkIndex = 0;

  function pushChunk(content: string) {
    const c = content.trim();
    if (c) {
      chunks.push({
        content: c,
        index: chunkIndex++,
        tokenCount: estimateTokens(c),
      });
    }
  }

  for (const para of paragraphs) {
    const trimPara = para.trim();
    if (!trimPara) continue;

    if (trimPara.length > targetChars) {
      if (current) {
        pushChunk(current);
        current = "";
      }
      // Split long paragraph on sentence boundaries
      const sentences = trimPara.match(/[^.!?]+[.!?]+[\s]*/g);
      if (sentences) {
        for (const sentence of sentences) {
          if (current.length + sentence.length > targetChars && current) {
            pushChunk(current);
            current = "";
          }
          current += sentence;
        }
        // Handle trailing text without sentence-ending punctuation
        const covered = (sentences || []).join("").length;
        if (covered < trimPara.length) {
          const remainder = trimPara.slice(covered).trim();
          if (remainder) {
            if (current.length + remainder.length > targetChars && current) {
              pushChunk(current);
              current = remainder;
            } else {
              current += (current ? " " : "") + remainder;
            }
          }
        }
      } else {
        // No sentence boundaries - force split by character limit
        for (let i = 0; i < trimPara.length; i += targetChars) {
          pushChunk(trimPara.slice(i, i + targetChars));
        }
      }
      continue;
    }

    if (current.length + trimPara.length + 2 > targetChars && current) {
      pushChunk(current);
      current = "";
    }
    current += (current ? "\n\n" : "") + trimPara;
  }

  if (current) pushChunk(current);

  return chunks;
}

// ---------------------------------------------------------------------------
// Default external service implementations
// ---------------------------------------------------------------------------

async function defaultExtractText(
  storagePath: string,
  mimeType: string
): Promise<string> {
  // Dynamic import of GCS - only used in production, mocked in tests
  const gcs = await import("@google-cloud/storage" as string) as {
    Storage: new () => {
      bucket: (name: string) => {
        file: (path: string) => {
          download: () => Promise<[Buffer]>;
        };
      };
    };
  };
  const storage = new gcs.Storage();
  const bucketName = getEnv().GCS_BUCKET_NAME;
  const [buffer] = await storage.bucket(bucketName).file(storagePath).download();

  if (mimeType === "application/pdf") {
    const pdfModule = await import("pdf-parse");
    const pdfParse = (pdfModule as unknown as { default?: (buf: Buffer) => Promise<{ text: string }> }).default
      ?? (pdfModule as unknown as (buf: Buffer) => Promise<{ text: string }>);
    const result = await pdfParse(Buffer.from(buffer));
    return result.text;
  }

  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    return result.value;
  }

  throw new IngestionError(
    "UNSUPPORTED_FORMAT",
    `Unsupported mime type: ${mimeType}`
  );
}

const EMBEDDING_BATCH_SIZE = 64;

async function callVoyageApi(
  texts: string[],
  apiKey: string
): Promise<number[][]> {
  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: texts, model: "voyage-3" }),
  });
  if (!response.ok) {
    throw new IngestionError(
      "EMBEDDING_ERROR",
      `Voyage AI error: ${response.status} ${response.statusText}`
    );
  }
  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  return data.data.map((d) => d.embedding);
}

async function defaultGenerateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  const apiKey = getEnv().VOYAGE_API_KEY;
  if (texts.length <= EMBEDDING_BATCH_SIZE) {
    return callVoyageApi(texts, apiKey);
  }
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const batchResults = await callVoyageApi(batch, apiKey);
    results.push(...batchResults);
  }
  return results;
}

async function defaultGenerateEmbedding(text: string): Promise<number[]> {
  const results = await defaultGenerateEmbeddings([text]);
  return results[0];
}

function resolveDeps(partial?: Partial<IngestionDeps>): IngestionDeps {
  return {
    db: partial?.db ?? defaultDbInstance,
    extractText: partial?.extractText ?? defaultExtractText,
    generateEmbeddings: partial?.generateEmbeddings ?? defaultGenerateEmbeddings,
    generateEmbedding: partial?.generateEmbedding ?? defaultGenerateEmbedding,
    classifyChunks: partial?.classifyChunks ?? classifyChunks,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// pgvector expects string format '[0.1,0.2,...]' but Drizzle's custom type
// doesn't serialize number[] arrays. This helper converts for DB inserts.
// The return type is number[] to satisfy Drizzle's type system, but the
// runtime value is a string that postgres.js passes to pgvector.
export function vectorToString(embedding: number[]): number[] {
  return `[${embedding.join(",")}]` as unknown as number[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidArrayLiteral(ids: string[]) {
  for (const id of ids) {
    if (!UUID_RE.test(id)) {
      throw new IngestionError("INVALID_ID", `Invalid UUID: ${id}`);
    }
  }
  return sql.raw(`ARRAY[${ids.map((id) => `'${id}'`).join(",")}]::uuid[]`);
}


async function getTopicsForFile(
  db: Database,
  fileId: string,
  qualificationVersionId?: string
): Promise<TopicInfo[]> {
  let qualVersionIds: string[] = [];

  // If an explicit qualification version was provided, use it directly
  if (qualificationVersionId) {
    qualVersionIds = [qualificationVersionId];
  } else {
    const fileRow = await db
      .select({
        learnerId: sourceCollections.learnerId,
        classId: sourceCollections.classId,
        orgId: sourceCollections.orgId,
        scope: sourceCollections.scope,
      })
      .from(sourceFiles)
      .innerJoin(
        sourceCollections,
        eq(sourceFiles.collectionId, sourceCollections.id)
      )
      .where(eq(sourceFiles.id, fileId))
      .limit(1);

    if (!fileRow[0]) return [];

    const { learnerId, classId, orgId, scope } = fileRow[0];

    if (learnerId) {
      const rows = await db
        .select({ qvId: learnerQualifications.qualificationVersionId })
        .from(learnerQualifications)
        .where(eq(learnerQualifications.learnerId, learnerId));
      qualVersionIds = rows.map((r) => r.qvId);
    } else if (classId) {
      const rows = await db
        .select({ qvId: classes.qualificationVersionId })
        .from(classes)
        .where(eq(classes.id, classId))
        .limit(1);
      if (rows[0]?.qvId) qualVersionIds = [rows[0].qvId];
    } else if (orgId && (scope === "household" || scope === "org")) {
      // For org-scoped collections, find qualification versions via classes in this org
      const rows = await db
        .select({ qvId: classes.qualificationVersionId })
        .from(classes)
        .where(eq(classes.orgId, orgId));
      qualVersionIds = rows
        .map((r) => r.qvId)
        .filter((id): id is string => id !== null);
    }
    // system-scoped collections require an explicit qualificationVersionId
  }

  if (qualVersionIds.length === 0) return [];

  const topicRows = await db
    .select({
      id: topics.id,
      name: topics.name,
      code: topics.code,
    })
    .from(topics)
    .where(inArray(topics.qualificationVersionId, qualVersionIds));

  return topicRows.map((t) => ({
    id: t.id as TopicId,
    name: t.name,
    code: t.code,
  }));
}

async function resolveAccessibleCollections(
  db: Database,
  learnerId: LearnerId,
  scopes?: ScopeType[]
): Promise<string[]> {
  // Single query: get learner's orgId and all enrolled classIds
  const learnerWithEnrollments = await db
    .select({
      orgId: learners.orgId,
      classId: enrollments.classId,
    })
    .from(learners)
    .leftJoin(enrollments, eq(learners.id, enrollments.learnerId))
    .where(eq(learners.id, learnerId));

  if (learnerWithEnrollments.length === 0) return [];
  const orgId = learnerWithEnrollments[0].orgId;
  const classIds = learnerWithEnrollments
    .map((r) => r.classId)
    .filter((id): id is string => id !== null);

  const allowedScopes = scopes ?? [
    "private",
    "household",
    "class",
    "org",
    "system",
  ];

  const conditions = [];

  if (allowedScopes.includes("private")) {
    conditions.push(
      and(
        eq(sourceCollections.scope, "private"),
        eq(sourceCollections.learnerId, learnerId)
      )
    );
  }
  if (allowedScopes.includes("household") || allowedScopes.includes("org")) {
    const orgScopes = allowedScopes.filter(
      (s) => s === "household" || s === "org"
    );
    conditions.push(
      and(
        inArray(sourceCollections.scope, orgScopes),
        eq(sourceCollections.orgId, orgId)
      )
    );
  }
  if (allowedScopes.includes("class") && classIds.length > 0) {
    conditions.push(
      and(
        eq(sourceCollections.scope, "class"),
        inArray(sourceCollections.classId, classIds)
      )
    );
  }
  if (allowedScopes.includes("system")) {
    conditions.push(eq(sourceCollections.scope, "system"));
  }

  if (conditions.length === 0) return [];

  const rows = await db
    .select({ id: sourceCollections.id })
    .from(sourceCollections)
    .where(sql`(${sql.join(conditions, sql` OR `)})`);

  return rows.map((r) => r.id);
}

// ---------------------------------------------------------------------------
// processFile
// ---------------------------------------------------------------------------

export async function processFile(
  fileId: string,
  deps?: Partial<IngestionDeps>,
  options?: { qualificationVersionId?: string }
): Promise<ProcessFileResult> {
  const d = resolveDeps(deps);

  const fileRows = await d.db
    .select()
    .from(sourceFiles)
    .where(eq(sourceFiles.id, fileId))
    .limit(1);

  if (!fileRows[0]) {
    throw new IngestionError("FILE_NOT_FOUND", `File ${fileId} not found`);
  }
  const fileRecord = fileRows[0];

  await d.db
    .update(sourceFiles)
    .set({ status: "processing" })
    .where(eq(sourceFiles.id, fileId));

  try {
    // Step 1: Extract text
    const text = await d.extractText(
      fileRecord.storagePath,
      fileRecord.mimeType
    );
    if (!text.trim()) {
      throw new IngestionError("EMPTY_CONTENT", "No text content extracted");
    }

    // Step 2: Chunk text
    const textChunks = chunkText(text);
    if (textChunks.length === 0) {
      throw new IngestionError("NO_CHUNKS", "No chunks produced from text");
    }

    // Step 3: Store chunks (single transaction)
    const insertedChunks = await d.db
      .insert(sourceChunks)
      .values(
        textChunks.map((c) => ({
          fileId,
          content: c.content,
          chunkIndex: c.index,
          tokenCount: c.tokenCount,
          startPage: c.startPage ?? null,
          endPage: c.endPage ?? null,
        }))
      )
      .returning();

    // Step 4: Generate embeddings
    const embeddings = await d.generateEmbeddings(
      textChunks.map((c) => c.content)
    );

    // Step 5: Store embeddings (single transaction)
    // pgvector requires string format '[0.1,0.2,...]' - the custom type doesn't serialize arrays
    await d.db.insert(chunkEmbeddings).values(
      insertedChunks.map((chunk, i) => ({
        chunkId: chunk.id,
        embedding: vectorToString(embeddings[i]),
        model: "voyage-3",
      }))
    );

    // Step 6: Get topics for classification
    const fileTopics = await getTopicsForFile(
      d.db,
      fileId,
      options?.qualificationVersionId
    );

    // Step 7: Classify chunks and store mappings
    let mappingsCreated = 0;
    const topicsCoveredSet = new Set<string>();

    if (fileTopics.length > 0) {
      const classifications = await d.classifyChunks(
        textChunks.map((c) => ({ index: c.index, content: c.content })),
        fileTopics
      );

      const mappingValues: Array<{
        chunkId: string;
        topicId: string;
        confidence: string;
        mappingMethod: "auto";
      }> = [];

      for (const classification of classifications) {
        const chunk = insertedChunks[classification.chunkIndex];
        if (!chunk) continue;
        for (const mapping of classification.mappings) {
          mappingValues.push({
            chunkId: chunk.id,
            topicId: mapping.topicId,
            confidence: mapping.confidence.toFixed(2),
            mappingMethod: "auto" as const,
          });
          topicsCoveredSet.add(mapping.topicId);
        }
      }

      if (mappingValues.length > 0) {
        await d.db.insert(sourceMappings).values(mappingValues);
        mappingsCreated = mappingValues.length;
      }
    }

    // Step 8: Update file status to ready
    await d.db
      .update(sourceFiles)
      .set({ status: "ready", processedAt: new Date() })
      .where(eq(sourceFiles.id, fileId));

    structuredLog("file_processed", {
      fileId,
      chunksCreated: insertedChunks.length,
      embeddingsCreated: insertedChunks.length,
      mappingsCreated,
    });

    return {
      chunksCreated: insertedChunks.length,
      embeddingsCreated: insertedChunks.length,
      mappingsCreated,
      topicsCovered: [...topicsCoveredSet] as TopicId[],
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown processing error";
    try {
      await d.db
        .update(sourceFiles)
        .set({ status: "failed", errorMessage })
        .where(eq(sourceFiles.id, fileId));
    } catch (dbError: unknown) {
      const dbMessage =
        dbError instanceof Error ? dbError.message : "Unknown DB error";
      structuredLog("file_status_update_failed", {
        fileId,
        originalError: errorMessage,
        dbError: dbMessage,
      });
    }

    structuredLog("file_processing_failed", { fileId, error: errorMessage });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// retrieveChunks
// ---------------------------------------------------------------------------

export async function retrieveChunks(
  learnerId: LearnerId,
  query: string,
  options?: {
    topicIds?: TopicId[];
    limit?: number;
    minConfidence?: number;
    scopes?: ScopeType[];
  },
  deps?: Partial<Pick<IngestionDeps, "db" | "generateEmbedding">>
): Promise<RetrievalResult[]> {
  const d = resolveDeps(deps);
  const limit = options?.limit ?? 5;
  const minConfidence = options?.minConfidence ?? 0.5;

  const queryEmbedding = await d.generateEmbedding(query);
  const collectionIds = await resolveAccessibleCollections(
    d.db,
    learnerId,
    options?.scopes
  );

  if (collectionIds.length === 0) return [];

  // Build the vector literal as raw SQL (values are safe - all floats from our own function)
  const vecLiteral = sql.raw(`'[${queryEmbedding.join(",")}]'::vector`);

  const collectionArray = uuidArrayLiteral(collectionIds);

  let topicJoin = sql``;
  let topicFilter = sql``;

  if (options?.topicIds && options.topicIds.length > 0) {
    const topicArray = uuidArrayLiteral(options.topicIds as string[]);
    topicJoin = sql`JOIN source_mappings sm ON sc.id = sm.chunk_id`;
    topicFilter = sql`AND sm.topic_id = ANY(${topicArray}) AND CAST(sm.confidence AS numeric) >= ${minConfidence}`;
  }

  const results = await d.db.execute(sql`
    WITH ranked AS (
      SELECT DISTINCT ON (sc.id)
        sc.id as chunk_id,
        sc.content,
        sf.filename as source_file_name,
        sf.id as source_file_id,
        1 - (ce.embedding <=> ${vecLiteral}) as similarity
      FROM chunk_embeddings ce
      JOIN source_chunks sc ON ce.chunk_id = sc.id
      JOIN source_files sf ON sc.file_id = sf.id
      ${topicJoin}
      WHERE sf.collection_id = ANY(${collectionArray})
        AND sf.status = 'ready'
        ${topicFilter}
      ORDER BY sc.id, ce.embedding <=> ${vecLiteral}
    )
    SELECT r.*,
      (SELECT sm2.topic_id FROM source_mappings sm2
       WHERE sm2.chunk_id = r.chunk_id
       ORDER BY CAST(sm2.confidence AS numeric) DESC LIMIT 1) as topic_id
    FROM ranked r
    ORDER BY r.similarity DESC
    LIMIT ${limit}
  `);

  const resultRows = results as unknown as Array<Record<string, unknown>>;
  return resultRows.map((row) => ({
    chunkId: row.chunk_id as ChunkId,
    content: row.content as string,
    score: Number(row.similarity),
    topicId: (row.topic_id as TopicId) ?? null,
    sourceFileName: row.source_file_name as string,
    sourceFileId: row.source_file_id as string,
  }));
}

// ---------------------------------------------------------------------------
// getCoverageReport
// ---------------------------------------------------------------------------

export async function getCoverageReport(
  learnerId: LearnerId,
  qualificationVersionId: QualificationVersionId,
  deps?: Partial<Pick<IngestionDeps, "db">>
): Promise<
  Array<{
    topicId: TopicId;
    topicName: string;
    chunkCount: number;
    avgConfidence: number;
    hasSources: boolean;
  }>
> {
  const d = resolveDeps(deps);

  const collectionIds = await resolveAccessibleCollections(d.db, learnerId);
  if (collectionIds.length === 0) {
    const allTopics = await d.db
      .select({ id: topics.id, name: topics.name })
      .from(topics)
      .where(eq(topics.qualificationVersionId, qualificationVersionId));

    return allTopics.map((t) => ({
      topicId: t.id as TopicId,
      topicName: t.name,
      chunkCount: 0,
      avgConfidence: 0,
      hasSources: false,
    }));
  }

  const collectionArray = uuidArrayLiteral(collectionIds);

  // Use a CTE to pre-filter accessible chunks, then left join topics against it.
  // This prevents counting chunks from inaccessible collections.
  const rows = await d.db.execute(sql`
    WITH accessible_chunks AS (
      SELECT sm.topic_id, sm.chunk_id, sm.confidence
      FROM source_mappings sm
      JOIN source_chunks sc ON sm.chunk_id = sc.id
      JOIN source_files sf ON sc.file_id = sf.id
      WHERE sf.collection_id = ANY(${collectionArray})
        AND sf.status = 'ready'
    )
    SELECT
      t.id as topic_id,
      t.name as topic_name,
      COUNT(DISTINCT ac.chunk_id) as chunk_count,
      COALESCE(AVG(CAST(ac.confidence AS numeric)), 0) as avg_confidence
    FROM topics t
    LEFT JOIN accessible_chunks ac ON t.id = ac.topic_id
    WHERE t.qualification_version_id = ${qualificationVersionId}
    GROUP BY t.id, t.name
    ORDER BY t.name
  `);

  const resultRows = rows as unknown as Array<Record<string, unknown>>;
  return resultRows.map((row) => ({
    topicId: row.topic_id as TopicId,
    topicName: row.topic_name as string,
    chunkCount: Number(row.chunk_count),
    avgConfidence: Number(row.avg_confidence),
    hasSources: Number(row.chunk_count) > 0,
  }));
}

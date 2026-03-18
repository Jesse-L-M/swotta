import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  decimal,
  timestamp,
  index,
  check,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  scopeTypeEnum,
  fileStatusEnum,
  mappingMethodEnum,
} from "./enums";
import { learners } from "./identity";
import { organizations } from "./identity";
import { classes } from "./identity";
import { topics, assessmentComponents } from "./curriculum";
import { users } from "./identity";

const vector = customType<{ data: number[]; dpiType: string }>({
  dataType() {
    return "vector(1024)";
  },
});

// --- source_collections ---

export const sourceCollections = pgTable(
  "source_collections",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    scope: scopeTypeEnum("scope").notNull(),
    learnerId: uuid("learner_id").references(() => learners.id),
    orgId: uuid("org_id").references(() => organizations.id),
    classId: uuid("class_id").references(() => classes.id),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("source_collections_learner_id_idx")
      .on(table.learnerId)
      .where(sql`${table.learnerId} IS NOT NULL`),
    index("source_collections_org_id_idx")
      .on(table.orgId)
      .where(sql`${table.orgId} IS NOT NULL`),
    index("source_collections_class_id_idx")
      .on(table.classId)
      .where(sql`${table.classId} IS NOT NULL`),
    check(
      "source_collections_scope_check",
      sql`(${table.scope} = 'system' AND ${table.learnerId} IS NULL AND ${table.orgId} IS NULL AND ${table.classId} IS NULL) OR (${table.scope} = 'private' AND ${table.learnerId} IS NOT NULL) OR (${table.scope} IN ('household', 'org') AND ${table.orgId} IS NOT NULL) OR (${table.scope} = 'class' AND ${table.classId} IS NOT NULL)`
    ),
  ]
);

// --- source_files ---

export const sourceFiles = pgTable(
  "source_files",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => sourceCollections.id),
    uploadedByUserId: uuid("uploaded_by_user_id")
      .notNull()
      .references(() => users.id),
    filename: varchar("filename", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    storagePath: text("storage_path").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    status: fileStatusEnum("status").notNull().default("pending"),
    pageCount: integer("page_count"),
    errorMessage: text("error_message"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("source_files_collection_id_idx").on(table.collectionId),
    index("source_files_status_idx").on(table.status),
  ]
);

// --- source_chunks ---

export const sourceChunks = pgTable(
  "source_chunks",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    fileId: uuid("file_id")
      .notNull()
      .references(() => sourceFiles.id),
    content: text("content").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    tokenCount: integer("token_count").notNull(),
    startPage: integer("start_page"),
    endPage: integer("end_page"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("source_chunks_file_id_idx").on(table.fileId)]
);

// --- chunk_embeddings ---

export const chunkEmbeddings = pgTable(
  "chunk_embeddings",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    chunkId: uuid("chunk_id")
      .unique()
      .notNull()
      .references(() => sourceChunks.id),
    embedding: vector("embedding").notNull(),
    model: varchar("model", { length: 50 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("chunk_embeddings_embedding_idx")
      .using(
        "hnsw",
        sql`${table.embedding} vector_cosine_ops`
      ),
  ]
);

// --- source_mappings ---

export const sourceMappings = pgTable(
  "source_mappings",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    chunkId: uuid("chunk_id")
      .notNull()
      .references(() => sourceChunks.id),
    topicId: uuid("topic_id").references(() => topics.id),
    componentId: uuid("component_id").references(
      () => assessmentComponents.id
    ),
    confidence: decimal("confidence", { precision: 3, scale: 2 }).notNull(),
    mappingMethod: mappingMethodEnum("mapping_method").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "source_mappings_has_target",
      sql`${table.topicId} IS NOT NULL OR ${table.componentId} IS NOT NULL`
    ),
    index("source_mappings_chunk_id_idx").on(table.chunkId),
    index("source_mappings_topic_id_idx").on(table.topicId),
  ]
);

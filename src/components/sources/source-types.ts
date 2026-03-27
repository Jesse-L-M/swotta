import type { TopicId } from "@/lib/types";

export type FileStatus =
  | "pending"
  | "queueing"
  | "processing"
  | "ready"
  | "failed";

export interface SourceFileInfo {
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
}

export interface SourceCollectionInfo {
  id: string;
  name: string;
  description: string | null;
  scope: "private" | "household" | "class" | "org" | "system";
  fileCount: number;
  createdAt: Date;
}

export interface TopicMapping {
  topicId: TopicId;
  topicName: string;
  chunkCount: number;
  avgConfidence: number;
}

export interface UploadProgress {
  fileId: string;
  filename: string;
  progress: number | null; // 0-100, null for indeterminate upload state
  status: "uploading" | "processing" | "complete" | "error";
  errorMessage?: string;
}

import { structuredLog } from "@/lib/logger";

export interface StorageClient {
  generateSignedUploadUrl(
    path: string,
    contentType: string,
    maxSizeBytes: number
  ): Promise<string>;
  generateSignedDownloadUrl(path: string): Promise<string>;
  deleteFile(path: string): Promise<void>;
}

export function buildStoragePath(
  orgId: string,
  collectionId: string,
  fileId: string,
  filename: string
): string {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `sources/${orgId}/${collectionId}/${fileId}/${safeFilename}`;
}

export function createGCSClient(
  bucketName: string,
  projectId: string
): StorageClient {
  return {
    async generateSignedUploadUrl(
      path: string,
      contentType: string,
      maxSizeBytes: number
    ): Promise<string> {
      structuredLog("gcs.generate_signed_upload_url", {
        bucket: bucketName,
        path,
        contentType,
        maxSizeBytes,
        projectId,
      });
      // In production, this would use @google-cloud/storage SDK
      // to generate a V4 signed URL for resumable upload.
      // For now, return a placeholder URL pattern.
      return `https://storage.googleapis.com/upload/storage/v1/b/${bucketName}/o?uploadType=resumable&name=${encodeURIComponent(path)}`;
    },

    async generateSignedDownloadUrl(path: string): Promise<string> {
      structuredLog("gcs.generate_signed_download_url", {
        bucket: bucketName,
        path,
        projectId,
      });
      return `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(path)}`;
    },

    async deleteFile(path: string): Promise<void> {
      structuredLog("gcs.delete_file", {
        bucket: bucketName,
        path,
        projectId,
      });
    },
  };
}

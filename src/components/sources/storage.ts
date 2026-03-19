import { structuredLog } from "@/lib/logger";

export interface StorageClient {
  mode: "gcs" | "unconfigured";
  bucketName: string | null;
  generateSignedUploadUrl(
    path: string,
    contentType: string,
    maxSizeBytes: number
  ): Promise<string>;
  generateSignedDownloadUrl(path: string): Promise<string>;
  uploadFile(
    path: string,
    contents: Uint8Array,
    contentType: string
  ): Promise<void>;
  deleteFile(path: string): Promise<void>;
}

interface GcsFileLike {
  getSignedUrl(options: {
    version: "v4";
    action: "read" | "write";
    expires: number;
    contentType?: string;
  }): Promise<[string]>;
  save(
    contents: Uint8Array,
    options: {
      contentType: string;
      resumable: boolean;
      metadata: { contentType: string };
    }
  ): Promise<void>;
  delete(): Promise<unknown>;
}

interface GcsBucketLike {
  file(path: string): GcsFileLike;
}

interface GcsStorageLike {
  bucket(name: string): GcsBucketLike;
}

interface CreateGCSClientOptions {
  clientEmail?: string;
  privateKey?: string;
  storageFactory?: () => Promise<GcsStorageLike>;
}

const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

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
  projectId: string,
  options: CreateGCSClientOptions = {}
): StorageClient {
  const clientEmail = options.clientEmail ?? process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey =
    options.privateKey ?? process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const storageFactory =
    options.storageFactory
    ?? (clientEmail && privateKey
      ? async (): Promise<GcsStorageLike> => {
          const gcs = await import("@google-cloud/storage" as string) as {
            Storage: new (config: {
              projectId: string;
              credentials: {
                client_email: string;
                private_key: string;
              };
            }) => GcsStorageLike;
          };

          return new gcs.Storage({
            projectId,
            credentials: {
              client_email: clientEmail,
              private_key: privateKey,
            },
          });
        }
      : null);

  async function getFile(path: string): Promise<GcsFileLike> {
    if (!storageFactory) {
      throw new StorageConfigurationError(
        "Cloud Storage credentials are not configured for uploads"
      );
    }

    const storage = await storageFactory();
    return storage.bucket(bucketName).file(path);
  }

  return {
    mode: storageFactory ? "gcs" : "unconfigured",
    bucketName: bucketName || null,
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
      const file = await getFile(path);
      const [url] = await file.getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + SIGNED_URL_TTL_MS,
        contentType,
      });
      return url;
    },

    async generateSignedDownloadUrl(path: string): Promise<string> {
      structuredLog("gcs.generate_signed_download_url", {
        bucket: bucketName,
        path,
        projectId,
      });
      const file = await getFile(path);
      const [url] = await file.getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + SIGNED_URL_TTL_MS,
      });
      return url;
    },

    async uploadFile(
      path: string,
      contents: Uint8Array,
      contentType: string
    ): Promise<void> {
      structuredLog("gcs.upload_file", {
        bucket: bucketName,
        path,
        contentType,
        projectId,
      });
      const file = await getFile(path);
      await file.save(contents, {
        contentType,
        resumable: false,
        metadata: { contentType },
      });
    },

    async deleteFile(path: string): Promise<void> {
      structuredLog("gcs.delete_file", {
        bucket: bucketName,
        path,
        projectId,
      });
      if (!storageFactory) return;
      const file = await getFile(path);
      await file.delete();
    },
  };
}

export class StorageConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageConfigurationError";
  }
}

export function createConfiguredStorageClient(): StorageClient {
  const bucketName = process.env.GCS_BUCKET_NAME;
  const projectId = process.env.GCS_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID;

  if (!bucketName || !projectId) {
    return createUnconfiguredStorageClient();
  }

  return createGCSClient(bucketName, projectId);
}

function createUnconfiguredStorageClient(): StorageClient {
  return {
    mode: "unconfigured",
    bucketName: null,
    async generateSignedUploadUrl(): Promise<string> {
      throw new StorageConfigurationError(
        "Cloud Storage is not configured for signed uploads"
      );
    },
    async generateSignedDownloadUrl(): Promise<string> {
      throw new StorageConfigurationError(
        "Cloud Storage is not configured for signed downloads"
      );
    },
    async uploadFile(): Promise<void> {
      throw new StorageConfigurationError(
        "Cloud Storage is not configured for uploads"
      );
    },
    async deleteFile(): Promise<void> {
      return Promise.resolve();
    },
  };
}

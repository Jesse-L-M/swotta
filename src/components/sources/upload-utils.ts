import { z } from "zod";

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const ACCEPTED_EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    ".docx",
};

export const MIME_TYPE_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "Word Document",
};

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
export const MAX_FILE_SIZE_LABEL = "50MB";
export const MAX_FILES_PER_UPLOAD = 10;

export interface FileValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateFile(file: {
  name: string;
  size: number;
  type: string;
}): FileValidationResult {
  const errors: string[] = [];

  if (!file.name || file.name.trim().length === 0) {
    errors.push("File name is required");
  }

  if (file.size <= 0) {
    errors.push("File is empty");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    errors.push(`File exceeds maximum size of ${MAX_FILE_SIZE_LABEL}`);
  }

  if (!isAcceptedMimeType(file.type)) {
    errors.push(
      `File type "${file.type || "unknown"}" is not supported. Accepted types: PDF, DOCX`
    );
  }

  return { valid: errors.length === 0, errors };
}

export function validateFilesBatch(
  files: Array<{ name: string; size: number; type: string }>
): FileValidationResult {
  const errors: string[] = [];

  if (files.length === 0) {
    errors.push("No files selected");
    return { valid: false, errors };
  }

  if (files.length > MAX_FILES_PER_UPLOAD) {
    errors.push(
      `Too many files. Maximum ${MAX_FILES_PER_UPLOAD} files per upload`
    );
  }

  for (const file of files) {
    const result = validateFile(file);
    if (!result.valid) {
      for (const error of result.errors) {
        errors.push(`${file.name}: ${error}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function isAcceptedMimeType(mimeType: string): boolean {
  return (ACCEPTED_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 0) return "0 B";
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.slice(lastDot).toLowerCase();
}

export function getMimeTypeLabel(mimeType: string): string {
  return MIME_TYPE_LABELS[mimeType] ?? "Unknown";
}

export function getAcceptString(): string {
  return ACCEPTED_MIME_TYPES.join(",");
}

export const uploadFileSchema = z.object({
  collectionId: z.string().uuid("Invalid collection ID"),
  filename: z.string().min(1, "Filename is required"),
  mimeType: z.string().refine(isAcceptedMimeType, {
    message: "Unsupported file type",
  }),
  sizeBytes: z
    .number()
    .positive("File must not be empty")
    .max(MAX_FILE_SIZE_BYTES, `File exceeds ${MAX_FILE_SIZE_LABEL}`),
});

export type UploadFileInput = z.infer<typeof uploadFileSchema>;

export const createCollectionSchema = z.object({
  name: z
    .string()
    .min(1, "Collection name is required")
    .max(255, "Collection name too long"),
  description: z
    .string()
    .max(1000, "Description too long")
    .optional(),
});

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;

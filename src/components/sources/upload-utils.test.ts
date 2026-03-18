import { describe, it, expect } from "vitest";
import {
  validateFile,
  validateFilesBatch,
  isAcceptedMimeType,
  formatFileSize,
  getFileExtension,
  getMimeTypeLabel,
  getAcceptString,
  uploadFileSchema,
  createCollectionSchema,
  ACCEPTED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_UPLOAD,
} from "./upload-utils";

describe("validateFile", () => {
  it("accepts a valid PDF file", () => {
    const result = validateFile({
      name: "notes.pdf",
      size: 1024,
      type: "application/pdf",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts a valid DOCX file", () => {
    const result = validateFile({
      name: "essay.docx",
      size: 2048,
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects empty file name", () => {
    const result = validateFile({
      name: "",
      size: 1024,
      type: "application/pdf",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("File name is required");
  });

  it("rejects whitespace-only file name", () => {
    const result = validateFile({
      name: "   ",
      size: 1024,
      type: "application/pdf",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("File name is required");
  });

  it("rejects empty file (zero bytes)", () => {
    const result = validateFile({
      name: "empty.pdf",
      size: 0,
      type: "application/pdf",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("File is empty");
  });

  it("rejects negative file size", () => {
    const result = validateFile({
      name: "test.pdf",
      size: -1,
      type: "application/pdf",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("File is empty");
  });

  it("rejects file exceeding max size", () => {
    const result = validateFile({
      name: "huge.pdf",
      size: MAX_FILE_SIZE_BYTES + 1,
      type: "application/pdf",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("exceeds maximum size"))).toBe(
      true
    );
  });

  it("accepts file exactly at max size", () => {
    const result = validateFile({
      name: "big.pdf",
      size: MAX_FILE_SIZE_BYTES,
      type: "application/pdf",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects unsupported file types", () => {
    const result = validateFile({
      name: "image.png",
      size: 1024,
      type: "image/png",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("not supported"))).toBe(true);
  });

  it("rejects empty mime type", () => {
    const result = validateFile({
      name: "unknown",
      size: 1024,
      type: "",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("not supported"))).toBe(true);
  });

  it("collects multiple errors", () => {
    const result = validateFile({
      name: "",
      size: MAX_FILE_SIZE_BYTES + 1,
      type: "text/plain",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("validateFilesBatch", () => {
  it("accepts a batch of valid files", () => {
    const result = validateFilesBatch([
      { name: "a.pdf", size: 1024, type: "application/pdf" },
      {
        name: "b.docx",
        size: 2048,
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects empty batch", () => {
    const result = validateFilesBatch([]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("No files selected");
  });

  it("rejects batch exceeding max count", () => {
    const files = Array.from({ length: MAX_FILES_PER_UPLOAD + 1 }, (_, i) => ({
      name: `file${i}.pdf`,
      size: 1024,
      type: "application/pdf" as string,
    }));
    const result = validateFilesBatch(files);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Too many files"))).toBe(true);
  });

  it("reports per-file errors with filenames", () => {
    const result = validateFilesBatch([
      { name: "good.pdf", size: 1024, type: "application/pdf" },
      { name: "bad.txt", size: 1024, type: "text/plain" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.startsWith("bad.txt:"))).toBe(true);
  });
});

describe("isAcceptedMimeType", () => {
  it("returns true for PDF", () => {
    expect(isAcceptedMimeType("application/pdf")).toBe(true);
  });

  it("returns true for DOCX", () => {
    expect(
      isAcceptedMimeType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe(true);
  });

  it("returns false for text/plain", () => {
    expect(isAcceptedMimeType("text/plain")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isAcceptedMimeType("")).toBe(false);
  });

  it("returns false for image/png", () => {
    expect(isAcceptedMimeType("image/png")).toBe(false);
  });
});

describe("formatFileSize", () => {
  it("formats bytes", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("formats gigabytes", () => {
    expect(formatFileSize(2 * 1024 * 1024 * 1024)).toBe("2.0 GB");
  });

  it("handles zero", () => {
    expect(formatFileSize(0)).toBe("0 B");
  });

  it("handles negative values", () => {
    expect(formatFileSize(-1)).toBe("0 B");
  });

  it("handles exactly 1024 bytes as KB", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
  });

  it("handles exactly 1MB", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
  });

  it("handles exactly 1GB", () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe("1.0 GB");
  });
});

describe("getFileExtension", () => {
  it("extracts .pdf", () => {
    expect(getFileExtension("document.pdf")).toBe(".pdf");
  });

  it("extracts .docx", () => {
    expect(getFileExtension("essay.docx")).toBe(".docx");
  });

  it("handles multiple dots", () => {
    expect(getFileExtension("my.file.name.pdf")).toBe(".pdf");
  });

  it("returns empty for no extension", () => {
    expect(getFileExtension("Makefile")).toBe("");
  });

  it("normalizes to lowercase", () => {
    expect(getFileExtension("NOTES.PDF")).toBe(".pdf");
  });
});

describe("getMimeTypeLabel", () => {
  it("returns PDF for application/pdf", () => {
    expect(getMimeTypeLabel("application/pdf")).toBe("PDF");
  });

  it("returns Word Document for DOCX mime type", () => {
    expect(
      getMimeTypeLabel(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe("Word Document");
  });

  it("returns Unknown for unrecognized type", () => {
    expect(getMimeTypeLabel("text/plain")).toBe("Unknown");
  });
});

describe("getAcceptString", () => {
  it("returns comma-separated accepted types", () => {
    const accept = getAcceptString();
    for (const type of ACCEPTED_MIME_TYPES) {
      expect(accept).toContain(type);
    }
  });
});

describe("uploadFileSchema", () => {
  it("validates correct input", () => {
    const result = uploadFileSchema.safeParse({
      collectionId: "550e8400-e29b-41d4-a716-446655440000",
      filename: "notes.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid collection ID", () => {
    const result = uploadFileSchema.safeParse({
      collectionId: "not-a-uuid",
      filename: "notes.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty filename", () => {
    const result = uploadFileSchema.safeParse({
      collectionId: "550e8400-e29b-41d4-a716-446655440000",
      filename: "",
      mimeType: "application/pdf",
      sizeBytes: 1024,
    });
    expect(result.success).toBe(false);
  });

  it("rejects unsupported mime type", () => {
    const result = uploadFileSchema.safeParse({
      collectionId: "550e8400-e29b-41d4-a716-446655440000",
      filename: "notes.txt",
      mimeType: "text/plain",
      sizeBytes: 1024,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero-byte file", () => {
    const result = uploadFileSchema.safeParse({
      collectionId: "550e8400-e29b-41d4-a716-446655440000",
      filename: "notes.pdf",
      mimeType: "application/pdf",
      sizeBytes: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects oversized file", () => {
    const result = uploadFileSchema.safeParse({
      collectionId: "550e8400-e29b-41d4-a716-446655440000",
      filename: "notes.pdf",
      mimeType: "application/pdf",
      sizeBytes: MAX_FILE_SIZE_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("createCollectionSchema", () => {
  it("validates correct input", () => {
    const result = createCollectionSchema.safeParse({
      name: "Biology Notes",
    });
    expect(result.success).toBe(true);
  });

  it("accepts input with description", () => {
    const result = createCollectionSchema.safeParse({
      name: "Biology Notes",
      description: "My revision notes for GCSE Biology",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createCollectionSchema.safeParse({
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects name exceeding 255 chars", () => {
    const result = createCollectionSchema.safeParse({
      name: "x".repeat(256),
    });
    expect(result.success).toBe(false);
  });

  it("rejects description exceeding 1000 chars", () => {
    const result = createCollectionSchema.safeParse({
      name: "Bio",
      description: "x".repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});

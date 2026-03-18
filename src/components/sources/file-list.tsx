"use client";

import type { SourceFileInfo } from "./source-types";
import { formatFileSize, getMimeTypeLabel } from "./upload-utils";
import { ProcessingStatus } from "./processing-status";

interface FileListProps {
  files: SourceFileInfo[];
  onFileClick?: (fileId: string) => void;
  emptyMessage?: string;
}

export function FileList({
  files,
  onFileClick,
  emptyMessage = "No files uploaded yet",
}: FileListProps) {
  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mb-3 text-muted-foreground"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border rounded-lg border">
      {files.map((file) => (
        <div
          key={file.id}
          className={`flex items-center gap-4 p-4 ${
            onFileClick ? "cursor-pointer hover:bg-muted/50" : ""
          }`}
          onClick={() => onFileClick?.(file.id)}
          onKeyDown={(e) => {
            if (onFileClick && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onFileClick(file.id);
            }
          }}
          role={onFileClick ? "button" : undefined}
          tabIndex={onFileClick ? 0 : undefined}
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <span className="text-xs font-medium text-muted-foreground">
              {getMimeTypeLabel(file.mimeType).slice(0, 3).toUpperCase()}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.filename}</p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(file.sizeBytes)}
              {file.pageCount !== null && ` \u00B7 ${file.pageCount} pages`}
              {" \u00B7 "}
              {new Date(file.createdAt).toLocaleDateString()}
            </p>
          </div>

          <ProcessingStatus
            status={file.status}
            errorMessage={file.errorMessage}
          />
        </div>
      ))}
    </div>
  );
}

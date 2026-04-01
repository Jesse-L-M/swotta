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
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#D9D2C5] bg-[#FCFAF6] p-8 text-center">
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
        <p className="text-sm text-[#5C5950]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-[#E5E0D6] rounded-xl border border-[#E5E0D6] bg-white">
      {files.map((file) => (
        <div
          key={file.id}
          className={`flex items-start gap-4 p-4 ${
            onFileClick ? "cursor-pointer hover:bg-[#F5F2EC]" : ""
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
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#F0ECE4]">
            <span className="text-xs font-medium text-[#5C5950]">
              {getMimeTypeLabel(file.mimeType).slice(0, 3).toUpperCase()}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[#1A1917]">
              {file.filename}
            </p>
            <p className="mt-1 text-xs text-[#5C5950]">
              {formatFileSize(file.sizeBytes)}
              {file.pageCount !== null && ` \u00B7 ${file.pageCount} pages`}
              {" \u00B7 "}
              Added {formatDate(file.createdAt)}
            </p>
          </div>

          <ProcessingStatus
            status={file.status}
            errorMessage={file.errorMessage}
            showDescription
            className="max-w-[16rem] shrink-0 items-start text-left"
          />
        </div>
      ))}
    </div>
  );
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

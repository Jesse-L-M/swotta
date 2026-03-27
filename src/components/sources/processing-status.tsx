"use client";

import type { FileStatus } from "./source-types";

interface ProcessingStatusProps {
  status: FileStatus;
  errorMessage?: string | null;
  className?: string;
}

const STATUS_CONFIG: Record<
  FileStatus,
  { label: string; color: string; icon: string }
> = {
  pending: {
    label: "Pending upload",
    color: "bg-[#F0ECE4] text-[#5C5950]",
    icon: "clock",
  },
  queueing: {
    label: "Queued",
    color: "bg-[#F0ECE4] text-[#5C5950]",
    icon: "clock",
  },
  processing: {
    label: "Processing",
    color: "bg-[#E4F0ED] text-[#2D7A6E]",
    icon: "loader",
  },
  ready: {
    label: "Ready",
    color: "bg-[#E4F0ED] text-[#2D7A6E]",
    icon: "check",
  },
  failed: {
    label: "Failed",
    color: "bg-[#FAEAE5] text-[#D4654A]",
    icon: "x",
  },
};

export function ProcessingStatus({
  status,
  errorMessage,
  className = "",
}: ProcessingStatusProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div className={`inline-flex flex-col ${className}`}>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.color}`}
      >
        {(status === "queueing" || status === "processing") && (
          <svg
            className="size-3 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        )}
        {config.label}
      </span>
      {status === "failed" && errorMessage && (
        <p className="mt-1 text-xs text-destructive">{errorMessage}</p>
      )}
    </div>
  );
}

interface UploadProgressBarProps {
  filename: string;
  progress: number | null;
  status: "uploading" | "processing" | "complete" | "error";
  errorMessage?: string;
}

export function UploadProgressBar({
  filename,
  progress,
  status,
  errorMessage,
}: UploadProgressBarProps) {
  const clampedProgress =
    progress === null ? null : Math.max(0, Math.min(100, progress));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="truncate font-medium" title={filename}>
          {filename}
        </span>
        <span className="ml-2 shrink-0 text-xs text-[#5C5950]">
          {status === "uploading"
            ? clampedProgress === null
              ? "Uploading..."
              : `${Math.round(clampedProgress)}%`
            : null}
          {status === "processing" && "Queued for processing"}
          {status === "complete" && "Uploaded"}
          {status === "error" && "Failed"}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#F0ECE4]">
        {clampedProgress === null && status === "uploading" ? (
          <div
            className="h-full w-1/2 animate-pulse rounded-full bg-[#2D7A6E]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Upload progress for ${filename}`}
          />
        ) : (
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              status === "error"
                ? "bg-[#D4654A]"
                : "bg-[#2D7A6E]"
            }`}
            style={{ width: `${clampedProgress ?? 100}%` }}
            role="progressbar"
            aria-valuenow={clampedProgress ?? 100}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Upload progress for ${filename}`}
          />
        )}
      </div>
      {status === "error" && errorMessage && (
        <p className="text-xs text-[#D4654A]">{errorMessage}</p>
      )}
    </div>
  );
}

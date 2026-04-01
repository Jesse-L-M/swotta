"use client";

import type { FileStatus, UploadProgress } from "./source-types";

interface ProcessingStatusProps {
  status: FileStatus;
  errorMessage?: string | null;
  className?: string;
  showDescription?: boolean;
}

interface UploadProgressBarProps {
  filename: string;
  progress: number | null;
  status: UploadProgress["status"];
  errorMessage?: string;
}

interface StatusConfig {
  label: string;
  color: string;
}

const FILE_STATUS_CONFIG: Record<FileStatus, StatusConfig> = {
  pending: {
    label: "Waiting for upload",
    color: "bg-[#F0ECE4] text-[#5C5950]",
  },
  queueing: {
    label: "Queued",
    color: "bg-[#F7F2E8] text-[#7A6F5A]",
  },
  processing: {
    label: "Processing",
    color: "bg-[#E4F0ED] text-[#2D7A6E]",
  },
  ready: {
    label: "Ready",
    color: "bg-[#E4F0ED] text-[#2D7A6E]",
  },
  failed: {
    label: "Needs another try",
    color: "bg-[#FAEAE5] text-[#D4654A]",
  },
};

const UPLOAD_STATUS_CONFIG: Record<UploadProgress["status"], StatusConfig> = {
  uploading: {
    label: "Uploading",
    color: "bg-[#F0ECE4] text-[#5C5950]",
  },
  uploaded: {
    label: "Uploaded",
    color: "bg-[#F7F2E8] text-[#7A6F5A]",
  },
  pending: FILE_STATUS_CONFIG.pending,
  queueing: FILE_STATUS_CONFIG.queueing,
  processing: FILE_STATUS_CONFIG.processing,
  ready: FILE_STATUS_CONFIG.ready,
  failed: FILE_STATUS_CONFIG.failed,
};

export function ProcessingStatus({
  status,
  errorMessage,
  className = "",
  showDescription = false,
}: ProcessingStatusProps) {
  const config = FILE_STATUS_CONFIG[status];
  const description = getFileStatusDescription(status, errorMessage);

  return (
    <div className={`inline-flex flex-col gap-1 ${className}`}>
      <span
        className={`inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-0.5 text-xs font-medium ${config.color}`}
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
        {status === "ready" && (
          <svg
            className="size-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m5 12 5 5L20 7" />
          </svg>
        )}
        {status === "failed" && (
          <svg
            className="size-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        )}
        {status === "pending" && (
          <svg
            className="size-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 6v6l4 2" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        )}
        {config.label}
      </span>
      {showDescription && (
        <p className="max-w-[16rem] text-xs leading-5 text-[#5C5950]">
          {description}
        </p>
      )}
      {status === "failed" && errorMessage && (
        <p className="max-w-[16rem] text-xs leading-5 text-[#D4654A]">
          Problem: {errorMessage}
        </p>
      )}
    </div>
  );
}

export function UploadProgressBar({
  filename,
  progress,
  status,
  errorMessage,
}: UploadProgressBarProps) {
  const clampedProgress =
    progress === null ? null : Math.max(0, Math.min(100, progress));
  const config = UPLOAD_STATUS_CONFIG[status];
  const detail = getUploadStatusDescription(status, errorMessage);

  return (
    <div className="space-y-2 rounded-xl border border-[#F0ECE4] bg-[#FCFAF6] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-medium text-[#1A1917]" title={filename}>
            {filename}
          </p>
          <p className="text-xs leading-5 text-[#5C5950]">{detail}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.color}`}
        >
          {(status === "uploading" || status === "queueing" || status === "processing") && (
            <svg
              className={`size-3 ${
                status === "uploading" && clampedProgress !== null
                  ? ""
                  : "animate-spin"
              }`}
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
            className={`h-full rounded-full transition-all duration-300 ${progressBarColor(status)}`}
            style={{ width: `${clampedProgress ?? 100}%` }}
            role="progressbar"
            aria-valuenow={clampedProgress ?? 100}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Upload progress for ${filename}`}
          />
        )}
      </div>
      {status === "uploading" && clampedProgress !== null && (
        <p className="text-xs text-[#5C5950]">{Math.round(clampedProgress)}% uploaded</p>
      )}
      {status === "failed" && errorMessage && (
        <p className="text-xs leading-5 text-[#D4654A]">
          To retry, upload this file again to create a fresh attempt.
        </p>
      )}
    </div>
  );
}

export function getFileStatusDescription(
  status: FileStatus,
  errorMessage?: string | null
): string {
  switch (status) {
    case "pending":
      return "We have created the file entry, but we are still waiting for the upload to finish.";
    case "queueing":
      return "The upload arrived. We are placing it into the processing queue now.";
    case "processing":
      return "We are extracting the content and matching it to your topics.";
    case "ready":
      return "This file is ready to use in your sources library and study sessions.";
    case "failed":
      return getRetryGuidance(errorMessage);
  }
}

export function getUploadStatusDescription(
  status: UploadProgress["status"],
  errorMessage?: string
): string {
  switch (status) {
    case "uploading":
      return "Moving the file into your sources library.";
    case "uploaded":
      return "The file upload finished. We are confirming the next processing step.";
    case "pending":
      return getFileStatusDescription("pending");
    case "queueing":
      return "Upload received. This file is queued and should start processing shortly.";
    case "processing":
      return getFileStatusDescription("processing");
    case "ready":
      return "Ready in your sources library. You can leave this page whenever you want.";
    case "failed":
      return errorMessage
        ? `${errorMessage} ${getRetryGuidance(errorMessage)}`
        : getRetryGuidance(errorMessage);
  }
}

function getRetryGuidance(errorMessage?: string | null): string {
  const normalized = errorMessage?.toLowerCase() ?? "";

  if (
    normalized.includes("not configured")
    || normalized.includes("misconfigured")
  ) {
    return "Uploads are unavailable in this environment right now.";
  }

  if (
    normalized.includes("queued")
    || normalized.includes("queue")
    || normalized.includes("processing state")
  ) {
    return "The file reached storage, but processing did not start cleanly. Upload it again to make a fresh attempt.";
  }

  if (normalized.includes("upload")) {
    return "The transfer did not finish cleanly. Upload the file again to retry.";
  }

  return "Upload the file again to start a fresh attempt.";
}

function progressBarColor(status: UploadProgress["status"]): string {
  switch (status) {
    case "failed":
      return "bg-[#D4654A]";
    case "ready":
      return "bg-[#2D7A6E]";
    case "processing":
      return "bg-[#2D7A6E]";
    case "queueing":
    case "uploaded":
      return "bg-[#B7A98A]";
    case "pending":
      return "bg-[#949085]";
    case "uploading":
      return "bg-[#2D7A6E]";
  }
}

"use client";

import { useCallback, useRef, useState } from "react";
import {
  validateFilesBatch,
  getAcceptString,
  MAX_FILE_SIZE_LABEL,
} from "./upload-utils";

interface UploadDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  maxFiles?: number;
}

export function UploadDropzone({
  onFilesSelected,
  disabled = false,
}: UploadDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;

      const files = Array.from(fileList);
      const batchResult = validateFilesBatch(
        files.map((f) => ({ name: f.name, size: f.size, type: f.type }))
      );

      if (!batchResult.valid) {
        setErrors(batchResult.errors);
        return;
      }

      setErrors([]);
      onFilesSelected(files);
    },
    [onFilesSelected]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) setIsDragOver(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (!disabled) handleFiles(e.dataTransfer.files);
    },
    [disabled, handleFiles]
  );

  const handleClick = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
      if (inputRef.current) inputRef.current.value = "";
    },
    [handleFiles]
  );

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload files"
        aria-disabled={disabled}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        className={`
          flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors
          ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
          ${
            isDragOver
              ? "border-[#2D7A6E] bg-[#E4F0ED]"
              : "border-[#D9D2C5] bg-white hover:border-[#2D7A6E]/60 hover:bg-[#F5F2EC]"
          }
        `}
      >
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <div className="text-center">
          <p className="text-sm font-medium text-[#1A1917]">
            {isDragOver ? "Drop files here" : "Drag and drop files here"}
          </p>
          <p className="mt-1 text-xs text-[#5C5950]">
            or click to browse. PDF and DOCX up to {MAX_FILE_SIZE_LABEL}, up
            to 10 files at once
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={getAcceptString()}
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled}
      />

      {errors.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border-l-[3px] border-[#D4654A] bg-[#FAEAE5] p-3"
        >
          <ul className="space-y-1">
            {errors.map((error, i) => (
              <li key={i} className="text-sm text-[#D4654A]">
                {error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

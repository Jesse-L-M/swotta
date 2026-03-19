"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { uploadSourceFiles } from "@/app/(student)/sources/actions";
import { UploadDropzone } from "@/components/sources/upload-dropzone";
import { UploadProgressBar } from "@/components/sources/processing-status";
import { TopicMappingPreview } from "@/components/sources/topic-mapping-preview";
import type {
  FileStatus,
  TopicMapping,
  UploadProgress,
} from "@/components/sources/source-types";

interface UploadCollectionOption {
  id: string;
  name: string;
  description: string | null;
  fileCount: number;
}

interface SourceUploadFlowProps {
  collections: UploadCollectionOption[];
}

interface UploadSummary {
  collectionName: string;
  uploadedCount: number;
  failedCount: number;
}

export function SourceUploadFlow({ collections }: SourceUploadFlowProps) {
  const [availableCollections, setAvailableCollections] =
    useState<UploadCollectionOption[]>(collections);
  const [collectionChoice, setCollectionChoice] = useState("new");
  const [collectionName, setCollectionName] = useState("");
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [step, setStep] = useState<"select" | "uploading" | "done">("select");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [topicMappings, setTopicMappings] = useState<TopicMapping[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleFilesSelected(files: File[]) {
    if (files.length === 0) return;

    const pendingUploads: UploadProgress[] = files.map((file) => ({
      fileId: crypto.randomUUID(),
      filename: file.name,
      progress: null,
      status: "uploading",
    }));

    setError(null);
    setWarnings([]);
    setSummary(null);
    setTopicMappings([]);
    setUploads(pendingUploads);
    setStep("uploading");

    startTransition(async () => {
      const formData = new FormData();

      if (collectionChoice !== "new") {
        formData.set("collectionId", collectionChoice);
      }

      if (collectionName.trim()) {
        formData.set("collectionName", collectionName.trim());
      }

      for (const file of files) {
        formData.append("files", file);
      }

      const result = await uploadSourceFiles(formData);

      if (!result.success) {
        setError(result.error);
        setUploads([]);
        setStep("select");
        return;
      }

      const persistedCount = result.files.filter((file) => file.fileId).length;
      const uploadedCount = result.files.filter(
        (file) => file.status !== "failed"
      ).length;
      const failedCount = result.files.filter(
        (file) => file.status === "failed"
      ).length;

      setWarnings(result.warnings);
      setTopicMappings(result.topicMappings);
      setSummary({
        collectionName: result.collection.name,
        uploadedCount,
        failedCount,
      });
      setUploads(
        result.files.map((file, index) => ({
          fileId:
            file.fileId
            ?? pendingUploads[index]?.fileId
            ?? crypto.randomUUID(),
          filename: file.filename,
          progress: 100,
          status: mapFileStatus(file.status),
          errorMessage: file.errorMessage ?? undefined,
        }))
      );
      setAvailableCollections((current) => {
        const existing = current.find(
          (collection) => collection.id === result.collection.id
        );

        if (existing) {
          return current.map((collection) =>
            collection.id === result.collection.id
              ? {
                  ...collection,
                  fileCount: collection.fileCount + persistedCount,
                }
              : collection
          );
        }

        return [
          {
            id: result.collection.id,
            name: result.collection.name,
            description: null,
            fileCount: persistedCount,
          },
          ...current,
        ];
      });
      setCollectionChoice(result.collection.id);
      if (!collectionName.trim()) {
        setCollectionName(result.collection.name);
      }
      setStep("done");
    });
  }

  function resetFlow() {
    setError(null);
    setWarnings([]);
    setSummary(null);
    setTopicMappings([]);
    setUploads([]);
    setStep("select");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/sources"
          className="text-sm text-[#5C5950] transition-colors hover:text-[#1A1917]"
        >
          &larr; Back to sources
        </Link>
        <h1 className="mt-2 font-[family-name:var(--font-serif)] text-3xl text-[#1A1917]">
          Upload Materials
        </h1>
        <p className="mt-1 text-sm text-[#5C5950]">
          Upload your revision notes, past papers, or textbook chapters. We
          will store them against your sources library and queue them for
          processing.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border-l-[3px] border-[#D4654A] bg-[#FAEAE5] px-4 py-3 text-sm text-[#1A1917]">
          {error}
        </div>
      )}

      {step === "select" && (
        <div className="space-y-4">
          {availableCollections.length > 0 && (
            <div className="space-y-2 rounded-xl border border-[#E5E0D6] bg-white p-4">
              <label
                htmlFor="collectionChoice"
                className="text-sm font-medium text-[#1A1917]"
              >
                Add to collection
              </label>
              <select
                id="collectionChoice"
                value={collectionChoice}
                onChange={(event) => setCollectionChoice(event.target.value)}
                disabled={isPending}
                className="w-full rounded-lg border border-[#D9D2C5] bg-white px-3 py-2 text-sm text-[#1A1917] outline-none transition-colors focus:border-[#2D7A6E]"
              >
                <option value="new">Create a new collection</option>
                {availableCollections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name} ({collection.fileCount} files)
                  </option>
                ))}
              </select>
              <p className="text-xs text-[#5C5950]">
                Choose an existing private collection or create a fresh one for
                this upload.
              </p>
            </div>
          )}

          {collectionChoice === "new" && (
            <div className="space-y-2 rounded-xl border border-[#E5E0D6] bg-white p-4">
              <label
                htmlFor="collectionName"
                className="text-sm font-medium text-[#1A1917]"
              >
                Collection name
              </label>
              <input
                id="collectionName"
                type="text"
                placeholder="e.g. Biology Revision Notes"
                value={collectionName}
                onChange={(event) => setCollectionName(event.target.value)}
                disabled={isPending}
                className="w-full rounded-lg border border-[#D9D2C5] bg-white px-3 py-2 text-sm text-[#1A1917] outline-none transition-colors placeholder:text-[#949085] focus:border-[#2D7A6E]"
              />
              <p className="text-xs text-[#5C5950]">
                Optional. If left blank, we will name the collection from your
                first file.
              </p>
            </div>
          )}

          <UploadDropzone
            onFilesSelected={handleFilesSelected}
            disabled={isPending}
          />
        </div>
      )}

      {(step === "uploading" || step === "done") && (
        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border border-[#E5E0D6] bg-white p-4">
            <h2 className="text-sm font-medium text-[#1A1917]">
              Upload Progress
            </h2>
            <div className="space-y-3">
              {uploads.map((upload) => (
                <UploadProgressBar
                  key={upload.fileId}
                  filename={upload.filename}
                  progress={upload.progress}
                  status={upload.status}
                  errorMessage={upload.errorMessage}
                />
              ))}
            </div>
          </div>

          {step === "done" && summary && (
            <>
              <div className="rounded-xl border border-[#E5E0D6] bg-white p-4">
                <p className="text-sm font-medium text-[#1A1917]">
                  Saved to {summary.collectionName}
                </p>
                <p className="mt-1 text-sm text-[#5C5950]">
                  {formatSummary(summary)}
                </p>
              </div>

              {warnings.map((warning) => (
                <div
                  key={warning}
                  className={`rounded-xl border-l-[3px] px-4 py-3 text-sm text-[#1A1917] ${
                    warning.includes("not configured")
                      ? "border-[#D4654A] bg-[#FAEAE5]"
                      : "border-[#949085] bg-[#F0ECE4]"
                  }`}
                >
                  {warning}
                </div>
              ))}

              <TopicMappingPreview
                mappings={topicMappings}
                emptyMessage="Files are uploaded and queued. Topic coverage will appear once processing completes."
              />

              <div className="flex gap-3">
                <Button onClick={resetFlow} variant="outline">
                  Upload more
                </Button>
                <Link href="/sources">
                  <Button>View sources</Button>
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function mapFileStatus(status: FileStatus): UploadProgress["status"] {
  if (status === "ready") return "complete";
  if (status === "failed") return "error";
  return "processing";
}

function formatSummary(summary: UploadSummary): string {
  if (summary.uploadedCount > 0 && summary.failedCount === 0) {
    return `${pluralise(summary.uploadedCount, "file")} uploaded and queued for processing.`;
  }

  if (summary.uploadedCount === 0 && summary.failedCount > 0) {
    return `${pluralise(summary.failedCount, "file")} failed during upload.`;
  }

  return `${pluralise(summary.uploadedCount, "file")} uploaded, ${pluralise(summary.failedCount, "file")} failed.`;
}

function pluralise(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  getUploadStatusSnapshot,
  prepareSourceUploads,
  reportUploadFailure,
  reportUploadSuccess,
} from "@/app/(student)/sources/actions";
import { UploadDropzone } from "@/components/sources/upload-dropzone";
import { UploadProgressBar } from "@/components/sources/processing-status";
import { TopicMappingPreview } from "@/components/sources/topic-mapping-preview";
import type {
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
}

interface FinalizedUpload {
  fileId: string;
  sourceFileId?: string;
  filename: string;
  progress: number;
  status: UploadProgress["status"];
  errorMessage?: string;
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

  const statusCounts = useMemo(() => buildUploadStatusCounts(uploads), [uploads]);

  useEffect(() => {
    if (step !== "done") return;

    const fileIds = uploads
      .map((upload) => upload.sourceFileId)
      .filter((fileId): fileId is string => Boolean(fileId));
    const hasPendingRefresh = uploads.some(
      (upload) =>
        upload.sourceFileId
        && (upload.status === "uploaded"
          || upload.status === "pending"
          || upload.status === "queueing"
          || upload.status === "processing")
    );

    if (fileIds.length === 0 || !hasPendingRefresh) {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const snapshot = await getUploadStatusSnapshot(fileIds);
        const snapshotById = new Map(snapshot.map((file) => [file.id, file]));

        setUploads((current) =>
          current.map((upload) => {
            const sourceFileId = upload.sourceFileId;

            if (!sourceFileId) {
              return upload;
            }

            const latest = snapshotById.get(sourceFileId);
            if (!latest) {
              return upload;
            }

            return {
              ...upload,
              progress: 100,
              status: latest.status,
              errorMessage: latest.errorMessage ?? undefined,
            };
          })
        );
      } catch {
        // Silent fallback: the learner can still open the sources page for a fresh server render.
      }
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [step, uploads]);

  function updateUpload(
    uploadId: string,
    patch: Partial<Pick<UploadProgress, "progress" | "status" | "errorMessage">>
  ) {
    setUploads((current) =>
      current.map((upload) =>
        upload.fileId === uploadId ? { ...upload, ...patch } : upload
      )
    );
  }

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
      try {
        const result = await prepareSourceUploads({
          collectionId:
            collectionChoice !== "new" ? collectionChoice : undefined,
          collectionName: collectionName.trim() || undefined,
          files: files.map((file) => ({
            filename: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          })),
        });

        if (!result.success) {
          setError(result.error);
          setUploads([]);
          setStep("select");
          return;
        }

        const preparedUploads = result.files.map((file, index) => ({
          fileId: pendingUploads[index]?.fileId ?? crypto.randomUUID(),
          sourceFileId: file.fileId ?? undefined,
          filename: file.filename,
          progress: file.status === "failed" ? 100 : null,
          status: file.status === "failed" ? "failed" : "uploading",
          errorMessage: file.errorMessage ?? undefined,
        })) satisfies UploadProgress[];

        setUploads(preparedUploads);

        const finalizedUploads = await Promise.all(
          result.files.map((file, index) =>
            uploadPreparedFile({
              file,
              localFile: files[index],
              uploadId: preparedUploads[index]?.fileId,
              onUpdate: updateUpload,
            })
          )
        );

        const persistedCount = result.files.filter((file) => file.fileId).length;

        setWarnings(result.warnings);
        setTopicMappings(result.topicMappings);
        setSummary({
          collectionName: result.collection.name,
        });
        setUploads(
          finalizedUploads.map((file) => ({
            fileId: file.fileId,
            sourceFileId: file.sourceFileId,
            filename: file.filename,
            progress: file.progress,
            status: file.status,
            errorMessage: file.errorMessage,
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
      } catch (uploadError) {
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : "Failed to prepare uploads"
        );
        setUploads([]);
        setStep("select");
      }
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
    <div className="mx-auto max-w-3xl space-y-6">
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
        <p className="mt-1 max-w-2xl text-sm text-[#5C5950]">
          Upload revision notes, past papers, or textbook chapters. We will
          store them in your sources library, queue them for processing, and
          keep their status clear while the background work finishes.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border-l-[3px] border-[#D4654A] bg-[#FAEAE5] px-4 py-3 text-sm text-[#1A1917]">
          <p className="font-medium">This upload could not be started.</p>
          <p className="mt-1 text-[#7B564D]">{error}</p>
        </div>
      )}

      {step === "select" && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
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
                    Choose an existing private collection or create a fresh one
                    for this upload.
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
                    Optional. If left blank, we will name the collection from
                    your first file.
                  </p>
                </div>
              )}

              <UploadDropzone
                onFilesSelected={handleFilesSelected}
                disabled={isPending}
              />
            </div>

            <div className="rounded-xl border border-[#E5E0D6] bg-[#FCFAF6] p-4">
              <h2 className="text-sm font-medium text-[#1A1917]">
                What happens next
              </h2>
              <div className="mt-3 space-y-3">
                <UploadStep
                  title="Uploaded"
                  description="Your file is stored in your sources library."
                />
                <UploadStep
                  title="Queued"
                  description="We place it into the processing queue."
                />
                <UploadStep
                  title="Processing"
                  description="We extract the content and review topic coverage."
                />
                <UploadStep
                  title="Ready"
                  description="The source can now support later study sessions."
                />
              </div>
              <p className="mt-4 text-xs leading-5 text-[#5C5950]">
                If anything fails, we will show the reason and tell you whether
                uploading the file again is the right next step.
              </p>
            </div>
          </div>
        </div>
      )}

      {(step === "uploading" || step === "done") && (
        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border border-[#E5E0D6] bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-[#1A1917]">
                Upload Progress
              </h2>
              {step === "done" && statusCounts.inProgress > 0 && (
                <span className="text-xs text-[#5C5950]">
                  We will keep checking while this page stays open.
                </span>
              )}
            </div>
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
                  {formatBatchSummary(statusCounts)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {statusCounts.uploaded > 0 && (
                    <StatusChip tone="neutral">
                      {pluralise(statusCounts.uploaded, "file")} uploaded
                    </StatusChip>
                  )}
                  {statusCounts.queueing > 0 && (
                    <StatusChip tone="neutral">
                      {pluralise(statusCounts.queueing, "file")} queued
                    </StatusChip>
                  )}
                  {statusCounts.processing > 0 && (
                    <StatusChip tone="ready">
                      {pluralise(statusCounts.processing, "file")} processing
                    </StatusChip>
                  )}
                  {statusCounts.ready > 0 && (
                    <StatusChip tone="ready">
                      {pluralise(statusCounts.ready, "file")} ready
                    </StatusChip>
                  )}
                  {statusCounts.failed > 0 && (
                    <StatusChip tone="failed">
                      {pluralise(statusCounts.failed, "file")} need another try
                    </StatusChip>
                  )}
                </div>
                <p className="mt-3 text-xs leading-5 text-[#5C5950]">
                  {formatBatchGuidance(statusCounts)}
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
                emptyMessage={buildTopicCoverageMessage(statusCounts)}
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

function UploadStep({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-[#E5E0D6] bg-white p-3">
      <p className="text-xs uppercase tracking-[0.08em] text-[#7A7468]">
        {title}
      </p>
      <p className="mt-1 text-sm leading-6 text-[#5C5950]">{description}</p>
    </div>
  );
}

function StatusChip({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "ready" | "neutral" | "failed";
}) {
  const className =
    tone === "ready"
      ? "bg-[#E4F0ED] text-[#2D7A6E]"
      : tone === "failed"
        ? "bg-[#FAEAE5] text-[#D4654A]"
        : "bg-[#F7F2E8] text-[#7A6F5A]";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

function buildUploadStatusCounts(uploads: UploadProgress[]) {
  return uploads.reduce(
    (counts, upload) => {
      counts[upload.status] += 1;
      counts.inProgress =
        counts.uploading
        + counts.uploaded
        + counts.pending
        + counts.queueing
        + counts.processing;
      return counts;
    },
    {
      uploading: 0,
      uploaded: 0,
      pending: 0,
      queueing: 0,
      processing: 0,
      ready: 0,
      failed: 0,
      inProgress: 0,
    }
  );
}

function formatBatchSummary(
  counts: ReturnType<typeof buildUploadStatusCounts>
): string {
  if (counts.ready > 0 && counts.inProgress === 0 && counts.failed === 0) {
    return `All ${pluralise(counts.ready, "file")} are ready in your sources library.`;
  }

  if (counts.failed > 0 && counts.inProgress === 0 && counts.ready === 0) {
    return `${pluralise(counts.failed, "file")} could not be prepared successfully.`;
  }

  if (counts.failed > 0) {
    return `${pluralise(counts.ready, "file")} ready, ${pluralise(counts.inProgress, "file")} still moving, ${pluralise(counts.failed, "file")} need another try.`;
  }

  return `${pluralise(counts.inProgress, "file")} are still moving through upload and processing.`;
}

function formatBatchGuidance(
  counts: ReturnType<typeof buildUploadStatusCounts>
): string {
  if (counts.failed > 0) {
    return "Failed files stay listed so you can review the error. To retry them, upload those files again to create a fresh attempt.";
  }

  if (counts.inProgress > 0) {
    return "You can leave this page at any point. Processing continues in the background, and the sources page will show the latest server state.";
  }

  return "Everything in this batch is ready to use.";
}

function buildTopicCoverageMessage(
  counts: ReturnType<typeof buildUploadStatusCounts>
): string {
  if (counts.ready > 0) {
    return "Ready files are in your library. Topic coverage will appear here once mapping results are available.";
  }

  if (counts.inProgress > 0) {
    return "Files are uploaded and moving through the queue. Topic coverage will appear once processing completes.";
  }

  return "Topic coverage is not available for failed files. Upload them again if you want another attempt.";
}

function pluralise(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

async function uploadPreparedFile({
  file,
  localFile,
  uploadId,
  onUpdate,
}: {
  file: {
    fileId: string | null;
    filename: string;
    status: "pending" | "failed";
    errorMessage: string | null;
    uploadUrl: string | null;
  };
  localFile: File | undefined;
  uploadId: string | undefined;
  onUpdate: (
    uploadId: string,
    patch: Partial<Pick<UploadProgress, "progress" | "status" | "errorMessage">>
  ) => void;
}): Promise<FinalizedUpload> {
  const clientFileId = uploadId ?? crypto.randomUUID();

  if (
    file.status === "failed"
    || !file.fileId
    || !file.uploadUrl
    || !localFile
  ) {
    return {
      fileId: clientFileId,
      sourceFileId: file.fileId ?? undefined,
      filename: file.filename,
      progress: 100,
      status: "failed",
      errorMessage: file.errorMessage ?? "Failed to prepare upload",
    };
  }

  try {
    await uploadFileToSignedUrl(file.uploadUrl, localFile, (progress) =>
      onUpdate(clientFileId, { progress })
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to upload file";

    onUpdate(clientFileId, {
      progress: 100,
      status: "failed",
      errorMessage,
    });
    await reportUploadFailure({
      fileId: file.fileId,
      errorMessage,
    }).catch(() => undefined);

    return {
      fileId: clientFileId,
      sourceFileId: file.fileId,
      filename: file.filename,
      progress: 100,
      status: "failed",
      errorMessage,
    };
  }

  onUpdate(clientFileId, {
    progress: 100,
    status: "uploaded",
    errorMessage: undefined,
  });

  try {
    const finalizeResult = await reportUploadSuccess({
      fileId: file.fileId,
    });

    if (!finalizeResult.success) {
      throw new Error(
        finalizeResult.error
          ?? "Upload completed, but processing could not be queued"
      );
    }

    onUpdate(clientFileId, {
      progress: 100,
      status: "queueing",
      errorMessage: undefined,
    });

    return {
      fileId: clientFileId,
      sourceFileId: file.fileId,
      filename: file.filename,
      progress: 100,
      status: "queueing",
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Upload completed, but processing could not be queued";

    onUpdate(clientFileId, {
      progress: 100,
      status: "failed",
      errorMessage,
    });

    return {
      fileId: clientFileId,
      sourceFileId: file.fileId,
      filename: file.filename,
      progress: 100,
      status: "failed",
      errorMessage,
    };
  }
}

function uploadFileToSignedUrl(
  uploadUrl: string,
  file: File,
  onProgress: (progress: number | null) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open("PUT", uploadUrl);
    request.setRequestHeader("Content-Type", file.type);

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total === 0) {
        onProgress(null);
        return;
      }

      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    request.onerror = () => {
      reject(new Error("Failed to upload file"));
    };

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
        return;
      }

      reject(
        new Error(
          request.status === 0
            ? "Failed to upload file"
            : `Upload failed with status ${request.status}`
        )
      );
    };

    request.send(file);
  });
}

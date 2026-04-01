import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AuthError } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { FileList } from "@/components/sources/file-list";
import type { SourceFileInfo } from "@/components/sources/source-types";
import { getSourcesPageData } from "./actions";
import { requireStudentPageAuth } from "../student-page-auth";

export default async function SourcesPage() {
  await requireStudentPageAuth("/sources");

  const { collections, filesByCollectionId, pendingFileCount, failedFileCount } =
    await loadSourcesPageData();
  const allFiles = Object.values(filesByCollectionId).flat();
  const overallSummary = summariseFiles(allFiles);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-serif)] text-3xl text-[#1A1917]">
            Sources
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[#5C5950]">
            Keep track of what has uploaded, what is still processing, and
            which files need another try before they can help with revision.
          </p>
        </div>
        <Link href="/sources/upload">
          <Button>Upload files</Button>
        </Link>
      </div>

      {pendingFileCount > 0 && (
        <div className="rounded-xl border-l-[3px] border-[#949085] bg-[#F0ECE4] px-4 py-3 text-sm text-[#1A1917]">
          <p className="font-medium">
            {pluralise(pendingFileCount, "file")} still moving through upload
            or processing.
          </p>
          <p className="mt-1 text-[#5C5950]">
            Queued and processing files update in the background. Open a
            collection below to see each file&apos;s current step.
          </p>
        </div>
      )}

      {failedFileCount > 0 && (
        <div className="rounded-xl border-l-[3px] border-[#D4654A] bg-[#FAEAE5] px-4 py-3 text-sm text-[#1A1917]">
          <p className="font-medium">
            {pluralise(failedFileCount, "file")} need another try.
          </p>
          <p className="mt-1 text-[#7B564D]">
            Review the error details below, then upload the file again to
            create a fresh attempt if needed.
          </p>
        </div>
      )}

      {collections.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-[#D9D2C5] bg-white px-6 py-12 text-center shadow-sm">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mb-4 text-[#949085]"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <h2 className="font-[family-name:var(--font-serif)] text-2xl text-[#1A1917]">
            Build your sources library
          </h2>
          <p className="mt-2 max-w-md text-sm text-[#5C5950]">
            Upload revision notes, past papers, or textbook extracts. We will
            store them, queue them for processing, and then map them to your
            topics once they are ready.
          </p>
          <div className="mt-6 grid w-full max-w-2xl gap-3 text-left sm:grid-cols-3">
            <EmptyStateStep
              title="Uploaded"
              description="The file has reached your library."
            />
            <EmptyStateStep
              title="Processing"
              description="We extract the content and review topic coverage."
            />
            <EmptyStateStep
              title="Ready"
              description="The source is ready to support future study sessions."
            />
          </div>
          <Link href="/sources/upload" className="mt-5">
            <Button>Upload your first file</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard
              label="Ready to use"
              value={overallSummary.ready}
              tone="ready"
              detail={
                overallSummary.ready > 0
                  ? `${pluralise(overallSummary.ready, "file")} can already support revision.`
                  : "Your ready files will appear here once processing completes."
              }
            />
            <SummaryCard
              label="In progress"
              value={overallSummary.inProgress}
              tone="neutral"
              detail={
                overallSummary.inProgress > 0
                  ? `${pluralise(overallSummary.inProgress, "file")} are uploaded, queued, or processing.`
                  : "Nothing is currently waiting in the queue."
              }
            />
            <SummaryCard
              label="Need attention"
              value={overallSummary.failed}
              tone="failed"
              detail={
                overallSummary.failed > 0
                  ? "Review the failed rows below and upload those files again if needed."
                  : "No failed uploads or processing errors right now."
              }
            />
          </div>

          {collections.map((collection) => (
            <section
              key={collection.id}
              className="space-y-4 rounded-[20px] border border-[#E5E0D6] bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <h2 className="font-[family-name:var(--font-serif)] text-2xl text-[#1A1917]">
                    {collection.name}
                  </h2>
                  {collection.description && (
                    <p className="text-sm text-[#5C5950]">
                      {collection.description}
                    </p>
                  )}
                  <p className="text-sm text-[#5C5950]">
                    {formatCollectionMessage(
                      summariseFiles(filesByCollectionId[collection.id] ?? [])
                    )}
                  </p>
                </div>
                <CollectionSummary
                  fileCount={collection.fileCount}
                  summary={summariseFiles(filesByCollectionId[collection.id] ?? [])}
                />
              </div>
              <FileList
                files={filesByCollectionId[collection.id] ?? []}
                emptyMessage="This collection is ready for its first file."
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

async function loadSourcesPageData() {
  try {
    return await getSourcesPageData();
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.code === "UNAUTHENTICATED") {
        redirect("/login");
      }

      redirect("/onboarding");
    }

    throw error;
  }
}

function pluralise(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function summariseFiles(files: SourceFileInfo[]) {
  const summary = {
    total: files.length,
    ready: 0,
    pending: 0,
    queueing: 0,
    processing: 0,
    failed: 0,
  };

  for (const file of files) {
    summary[file.status] += 1;
  }

  return {
    ...summary,
    inProgress: summary.pending + summary.queueing + summary.processing,
  };
}

function formatCollectionMessage(summary: ReturnType<typeof summariseFiles>) {
  if (summary.total === 0) {
    return "Add a file to start building this collection.";
  }

  if (summary.ready === summary.total) {
    return "Everything in this collection is ready to use.";
  }

  if (summary.ready === 0 && summary.inProgress > 0) {
    return "This collection is still being prepared.";
  }

  if (summary.failed === summary.total) {
    return "Nothing in this collection is usable yet. Upload the failed files again to retry.";
  }

  if (summary.failed > 0 && summary.inProgress > 0) {
    return "Some files are still processing and some need another try.";
  }

  if (summary.failed > 0) {
    return "Most files are ready, but some need another try.";
  }

  return "Some files are still moving through the queue.";
}

function SummaryCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone: "ready" | "neutral" | "failed";
}) {
  const toneClass =
    tone === "ready"
      ? "border-[#D7E8E3] bg-[#F5FBF9]"
      : tone === "failed"
        ? "border-[#F1D2C8] bg-[#FFF8F5]"
        : "border-[#E5E0D6] bg-[#FCFAF6]";

  return (
    <div className={`rounded-[18px] border p-4 ${toneClass}`}>
      <p className="text-xs uppercase tracking-[0.08em] text-[#7A7468]">
        {label}
      </p>
      <p className="mt-2 font-[family-name:var(--font-serif)] text-3xl text-[#1A1917]">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-[#5C5950]">{detail}</p>
    </div>
  );
}

function CollectionSummary({
  fileCount,
  summary,
}: {
  fileCount: number;
  summary: ReturnType<typeof summariseFiles>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
      <span className="rounded-full bg-[#F0ECE4] px-3 py-1 text-xs font-medium text-[#5C5950]">
        {pluralise(fileCount, "file")}
      </span>
      {summary.ready > 0 && (
        <StatusPill tone="ready">{pluralise(summary.ready, "ready file")}</StatusPill>
      )}
      {summary.inProgress > 0 && (
        <StatusPill tone="neutral">
          {pluralise(summary.inProgress, "file")} in progress
        </StatusPill>
      )}
      {summary.failed > 0 && (
        <StatusPill tone="failed">
          {pluralise(summary.failed, "file")} need attention
        </StatusPill>
      )}
    </div>
  );
}

function StatusPill({
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

function EmptyStateStep({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-[#E5E0D6] bg-[#FCFAF6] p-4">
      <p className="text-xs uppercase tracking-[0.08em] text-[#7A7468]">
        {title}
      </p>
      <p className="mt-2 text-sm leading-6 text-[#5C5950]">{description}</p>
    </div>
  );
}

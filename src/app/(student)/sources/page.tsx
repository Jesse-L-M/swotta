import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { FileList } from "@/components/sources/file-list";
import { getSourcesPageData } from "./actions";

export default async function SourcesPage() {
  const { collections, filesByCollectionId, pendingFileCount, failedFileCount } =
    await loadSourcesPageData();

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-serif)] text-3xl text-[#1A1917]">
            Sources
          </h1>
          <p className="mt-1 text-sm text-[#5C5950]">
            Manage your study materials and revision notes.
          </p>
        </div>
        <Link href="/sources/upload">
          <Button>Upload files</Button>
        </Link>
      </div>

      {pendingFileCount > 0 && (
        <div className="rounded-xl border-l-[3px] border-[#949085] bg-[#F0ECE4] px-4 py-3 text-sm text-[#1A1917]">
          {pluralise(pendingFileCount, "file")} queued for processing.
        </div>
      )}

      {failedFileCount > 0 && (
        <div className="rounded-xl border-l-[3px] border-[#D4654A] bg-[#FAEAE5] px-4 py-3 text-sm text-[#1A1917]">
          {pluralise(failedFileCount, "file")} failed to upload or process.
          Open the collection below to review the error details.
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
            No collections yet
          </h2>
          <p className="mt-2 max-w-md text-sm text-[#5C5950]">
            Upload your study materials to get started. We will analyse them
            and map them to your qualification topics.
          </p>
          <Link href="/sources/upload" className="mt-5">
            <Button>Upload your first file</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {collections.map((collection) => (
            <section key={collection.id} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-[family-name:var(--font-serif)] text-2xl text-[#1A1917]">
                    {collection.name}
                  </h2>
                  {collection.description && (
                    <p className="text-sm text-[#5C5950]">
                      {collection.description}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs uppercase tracking-[0.08em] text-[#949085]">
                  {pluralise(collection.fileCount, "file")}
                </span>
              </div>
              <FileList files={filesByCollectionId[collection.id] ?? []} />
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

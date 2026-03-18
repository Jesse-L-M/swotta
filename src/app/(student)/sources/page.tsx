import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileList } from "@/components/sources/file-list";
import type { SourceFileInfo, SourceCollectionInfo } from "@/components/sources/source-types";

// TODO: Get learnerId from auth context (Task 2.1)
// For now, renders empty state. When auth is wired up,
// call getCollections(learnerId) and getFiles(collectionId).

export default function SourcesPage() {
  // Placeholder data — will be fetched from server actions once auth is wired
  const collections: SourceCollectionInfo[] = [];
  const files: SourceFileInfo[] = [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sources</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your study materials and revision notes.
          </p>
        </div>
        <Link href="/sources/upload">
          <Button>Upload files</Button>
        </Link>
      </div>

      {collections.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mb-4 text-muted-foreground"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <h2 className="text-lg font-medium">No collections yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Upload your study materials to get started. We will analyse them and
            map them to your qualification topics.
          </p>
          <Link href="/sources/upload" className="mt-4">
            <Button>Upload your first file</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {collections.map((col) => (
            <section key={col.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-medium">{col.name}</h2>
                  {col.description && (
                    <p className="text-sm text-muted-foreground">
                      {col.description}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {col.fileCount} files
                </span>
              </div>
              <FileList
                files={files.filter((f) => f.collectionId === col.id)}
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UploadDropzone } from "@/components/sources/upload-dropzone";
import { UploadProgressBar } from "@/components/sources/processing-status";
import { TopicMappingPreview } from "@/components/sources/topic-mapping-preview";
import type { UploadProgress, TopicMapping } from "@/components/sources/source-types";

// TODO: Wire to real server actions + Cloud Storage signed URLs once auth (Task 2.1) and
// GCP infra (Task 3.1) are available. For now, simulates upload flow.

export default function UploadPage() {
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [collectionName, setCollectionName] = useState("");
  const [step, setStep] = useState<"select" | "uploading" | "done">("select");
  const [topicMappings, setTopicMappings] = useState<TopicMapping[]>([]);
  const [mappingsLoading, setMappingsLoading] = useState(false);

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      const newUploads: UploadProgress[] = files.map((f) => ({
        fileId: crypto.randomUUID(),
        filename: f.name,
        progress: 0,
        status: "uploading" as const,
      }));

      setUploads(newUploads);
      setStep("uploading");

      // Simulate upload progress — in production, this would use
      // signed URLs from Cloud Storage with XMLHttpRequest progress events.
      for (const upload of newUploads) {
        simulateUpload(upload.fileId);
      }
    },
    []
  );

  const simulateUpload = (fileId: string) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 20 + 10;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setUploads((prev) =>
          prev.map((u) =>
            u.fileId === fileId
              ? { ...u, progress: 100, status: "processing" as const }
              : u
          )
        );

        // Simulate processing
        setTimeout(() => {
          setUploads((prev) =>
            prev.map((u) =>
              u.fileId === fileId
                ? { ...u, status: "complete" as const }
                : u
            )
          );
          checkAllComplete();
        }, 2000);
      } else {
        setUploads((prev) =>
          prev.map((u) =>
            u.fileId === fileId ? { ...u, progress } : u
          )
        );
      }
    }, 300);
  };

  const checkAllComplete = () => {
    setUploads((prev) => {
      const allDone = prev.every(
        (u) => u.status === "complete" || u.status === "error"
      );
      if (allDone) {
        setStep("done");
        setMappingsLoading(true);
        // Simulate topic mapping loading
        setTimeout(() => {
          setMappingsLoading(false);
        }, 1500);
      }
      return prev;
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <Link
          href="/sources"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to sources
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Upload Materials</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload your revision notes, past papers, or textbook chapters.
          We will analyse and map them to your qualification topics.
        </p>
      </div>

      {step === "select" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="collectionName" className="text-sm font-medium">
              Collection name
            </label>
            <input
              id="collectionName"
              type="text"
              placeholder="e.g. Biology Revision Notes"
              value={collectionName}
              onChange={(e) => setCollectionName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <UploadDropzone onFilesSelected={handleFilesSelected} />
        </div>
      )}

      {(step === "uploading" || step === "done") && (
        <div className="space-y-4">
          <div className="space-y-3 rounded-lg border p-4">
            <h2 className="text-sm font-medium">Upload Progress</h2>
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

          {step === "done" && (
            <>
              <TopicMappingPreview
                mappings={topicMappings}
                loading={mappingsLoading}
              />
              <div className="flex gap-3">
                <Button
                  onClick={() => {
                    setUploads([]);
                    setStep("select");
                    setTopicMappings([]);
                  }}
                  variant="outline"
                >
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

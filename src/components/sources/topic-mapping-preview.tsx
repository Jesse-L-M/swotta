"use client";

import type { TopicMapping } from "./source-types";

interface TopicMappingPreviewProps {
  mappings: TopicMapping[];
  loading?: boolean;
  emptyMessage?: string;
}

export function TopicMappingPreview({
  mappings,
  loading = false,
  emptyMessage = "No topic mappings available yet. Uploaded files will appear here once processing completes.",
}: TopicMappingPreviewProps) {
  if (loading) {
    return (
      <div className="space-y-3 rounded-xl border border-[#E5E0D6] bg-white p-4">
        <h3 className="text-sm font-medium text-[#1A1917]">Topic Coverage</h3>
        <div className="flex items-center gap-2 text-sm text-[#5C5950]">
          <svg
            className="size-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          Analysing topic coverage...
        </div>
      </div>
    );
  }

  if (mappings.length === 0) {
    return (
      <div className="space-y-3 rounded-xl border border-[#E5E0D6] bg-white p-4">
        <h3 className="text-sm font-medium text-[#1A1917]">Topic Coverage</h3>
        <p className="text-sm text-[#5C5950]">{emptyMessage}</p>
      </div>
    );
  }

  const sorted = [...mappings].sort((a, b) => b.chunkCount - a.chunkCount);
  const maxChunks = Math.max(...sorted.map((m) => m.chunkCount));

  return (
    <div className="space-y-3 rounded-xl border border-[#E5E0D6] bg-white p-4">
      <h3 className="text-sm font-medium text-[#1A1917]">
        Topic Coverage ({mappings.length} topics)
      </h3>
      <div className="space-y-2">
        {sorted.map((mapping) => (
          <div key={mapping.topicId} className="space-y-1">
            <div className="flex items-center justify-between text-sm text-[#1A1917]">
              <span className="truncate" title={mapping.topicName}>
                {mapping.topicName}
              </span>
              <span className="ml-2 shrink-0 text-xs text-[#5C5950]">
                {mapping.chunkCount} chunks
                {" \u00B7 "}
                {Math.round(mapping.avgConfidence * 100)}% confidence
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#F0ECE4]">
              <div
                className={`h-full rounded-full transition-all ${confidenceColor(mapping.avgConfidence)}`}
                style={{
                  width: `${maxChunks > 0 ? (mapping.chunkCount / maxChunks) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return "bg-[#2D7A6E]";
  if (confidence >= 0.5) return "bg-[#949085]";
  return "bg-[#D4654A]";
}

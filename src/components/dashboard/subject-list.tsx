import type { DashboardQualification, MasteryTopic } from "./types";
import {
  getMasteryState,
  MASTERY_STYLES,
  MASTERY_STATE_LABEL,
  masteryPercent,
  formatExamCountdown,
  groupMasteryByState,
} from "./utils";
import { cn } from "@/lib/utils";

interface SubjectListProps {
  qualifications: DashboardQualification[];
  masteryTopics: MasteryTopic[];
}

export function SubjectList({
  qualifications,
  masteryTopics,
}: SubjectListProps) {
  if (qualifications.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {qualifications.map((qual) => {
        const topics = masteryTopics.filter(
          (t) => t.qualificationVersionId === qual.qualificationVersionId
        );
        const grouped = groupMasteryByState(topics);
        const avgMastery =
          topics.length > 0
            ? topics.reduce((s, t) => s + t.masteryLevel, 0) / topics.length
            : 0;
        const state = getMasteryState(avgMastery);
        const styles = MASTERY_STYLES[state];
        const countdown = formatExamCountdown(qual.examDate);
        const focusMessage =
          grouped["needs-work"] > 0
            ? `${grouped["needs-work"]} topic${grouped["needs-work"] === 1 ? "" : "s"} still need a solid first pass.`
            : grouped.developing > 0
              ? `${grouped.developing} topic${grouped.developing === 1 ? " is" : "s are"} close to sticking with one more push.`
              : topics.length > 0
                ? "This subject is in a steady place. Keep it warm with regular review."
                : "You have not built enough evidence here yet for a strong read on progress.";

        return (
          <div
            key={qual.id}
            className="rounded-xl border border-[#E8E4DB] bg-white px-5 py-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="font-medium text-[#1A1A2E]">
                  {qual.subjectName}
                </h3>
                <p className="text-sm text-[#6B7280]">
                  {qual.qualificationName} &middot; {qual.examBoardCode}
                  {qual.targetGrade && (
                    <> &middot; Target: {qual.targetGrade}</>
                  )}
                </p>
              </div>
              <div className="text-right">
                <span
                  className={cn(
                    "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
                    styles.bg,
                    styles.text
                  )}
                >
                  {masteryPercent(avgMastery)}% &middot;{" "}
                  {MASTERY_STATE_LABEL[state]}
                </span>
              </div>
            </div>

            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-[#F0EDE6]">
                <div
                  className={cn("h-full rounded-full transition-all", {
                    "bg-teal-500": state === "strong",
                    "bg-amber-500": state === "developing",
                    "bg-[#F97066]": state === "needs-work",
                  })}
                  style={{ width: `${masteryPercent(avgMastery)}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-[#6B7280]">
                <span>{topics.length} topics</span>
                {countdown && <span>{countdown}</span>}
              </div>
            </div>

            <p className="mt-3 text-sm text-[#5C5950]">{focusMessage}</p>
          </div>
        );
      })}
    </div>
  );
}

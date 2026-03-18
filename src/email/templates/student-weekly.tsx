import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ExamPhaseName } from "@/engine/proximity";

export type { ExamPhaseName } from "@/engine/proximity";

// --- Types ---

export interface WeekPlanBlock {
  topicName: string;
  blockTypeLabel: string;
  durationMinutes: number;
}

export interface WeekPlanDay {
  day: string;
  blocks: WeekPlanBlock[];
}

export interface ExamCountdownEntry {
  qualificationName: string;
  daysRemaining: number;
}

export interface StudentWeeklyEmailProps {
  firstName: string;
  weekPlan: WeekPlanDay[];
  totalTimeEstimate: number;
  streakCount: number;
  examCountdown: ExamCountdownEntry[];
  phaseName: ExamPhaseName;
}

// --- Design tokens (DESIGN.md) ---

const colors = {
  canvas: "#FAF6F0",
  paper: "#FFFFFF",
  ink: "#1A1917",
  graphite: "#5C5950",
  pencil: "#949085",
  teal: "#2D7A6E",
  tealLight: "#E4F0ED",
  coral: "#D4654A",
  borderSubtle: "#EFEBE4",
};

const serifFont =
  "'Instrument Serif', Georgia, 'Times New Roman', serif";
const sansFont =
  "'Instrument Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const monoFont =
  "'JetBrains Mono', 'Fira Code', Consolas, monospace";

// --- Pure helpers ---

export function getPhaseGreeting(
  firstName: string,
  phase: ExamPhaseName,
): string {
  switch (phase) {
    case "exploration":
      return `Good morning, ${firstName}`;
    case "consolidation":
      return `Focused week ahead, ${firstName}`;
    case "revision":
      return `Every session counts, ${firstName}`;
    case "confidence":
      return `You've got this, ${firstName}`;
  }
}

export function getPhaseMessage(phase: ExamPhaseName): string {
  switch (phase) {
    case "exploration":
      return "There's plenty of time to build strong foundations. Take each session at your own pace \u2014 understanding deeply now will pay off later.";
    case "consolidation":
      return "Let's strengthen what you know and close the gaps that matter most. Focus on your weaker areas this week.";
    case "revision":
      return "You've put in the work. Now it's about locking in what you know. Short, focused sessions will keep everything sharp.";
    case "confidence":
      return "Trust what you know. Light revision only this week. You're more prepared than you think.";
  }
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (remaining === 0) return `${hours}h`;
  return `${hours}h ${remaining}m`;
}

export function computeStudyStreak(
  sessionDates: Date[],
  now?: Date,
): number {
  if (sessionDates.length === 0) return 0;

  const today = now ?? new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const dateSet = new Set(
    sessionDates.map((d) => d.toISOString().slice(0, 10)),
  );

  let streak = 0;
  const checkDate = new Date(today);

  if (dateSet.has(todayStr)) {
    streak = 1;
    checkDate.setDate(checkDate.getDate() - 1);
  } else {
    checkDate.setDate(checkDate.getDate() - 1);
    if (!dateSet.has(checkDate.toISOString().slice(0, 10))) return 0;
    streak = 1;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (dateSet.has(checkDate.toISOString().slice(0, 10))) {
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  return streak;
}

function examDaysColor(days: number): string {
  if (days <= 7) return colors.coral;
  if (days <= 28) return colors.graphite;
  return colors.teal;
}

// --- Email Component ---

export function StudentWeeklyEmail(
  props: StudentWeeklyEmailProps,
): React.ReactElement {
  const {
    firstName,
    weekPlan,
    totalTimeEstimate,
    streakCount,
    examCountdown,
    phaseName,
  } = props;

  const greeting = getPhaseGreeting(firstName, phaseName);
  const message = getPhaseMessage(phaseName);
  const closestExam =
    examCountdown.length > 0
      ? examCountdown.reduce((a, b) =>
          a.daysRemaining < b.daysRemaining ? a : b,
        )
      : null;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Your week ahead &mdash; Swotta</title>
      </head>
      <body
        style={{
          margin: 0,
          padding: "24px 16px",
          backgroundColor: colors.canvas,
          fontFamily: sansFont,
          fontSize: "16px",
          lineHeight: "1.6",
          color: colors.ink,
        }}
      >
        <table
          role="presentation"
          style={{ maxWidth: "560px", margin: "0 auto", width: "100%" }}
        >
          <tbody>
            {/* Header */}
            <tr>
              <td
                style={{
                  backgroundColor: colors.teal,
                  color: "#ffffff",
                  padding: "32px 24px 24px",
                  borderRadius: "12px 12px 0 0",
                }}
              >
                <div
                  style={{
                    fontFamily: serifFont,
                    fontSize: "20px",
                    fontStyle: "italic",
                    opacity: 0.85,
                    marginBottom: "16px",
                  }}
                >
                  Swotta
                </div>
                <h1
                  style={{
                    margin: 0,
                    fontFamily: serifFont,
                    fontSize: "28px",
                    fontWeight: 400,
                    lineHeight: "1.2",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {greeting}
                </h1>
              </td>
            </tr>

            {/* Phase message */}
            <tr>
              <td
                style={{
                  backgroundColor: colors.paper,
                  padding: "24px",
                  borderBottom: `1px solid ${colors.borderSubtle}`,
                }}
              >
                <div
                  style={{
                    padding: "16px",
                    backgroundColor: colors.tealLight,
                    borderLeft: `3px solid ${colors.teal}`,
                    borderRadius: "0 8px 8px 0",
                    fontSize: "15px",
                    lineHeight: "1.6",
                    color: colors.graphite,
                  }}
                >
                  {message}
                </div>
              </td>
            </tr>

            {/* Stats row */}
            <tr>
              <td
                style={{
                  backgroundColor: colors.paper,
                  padding: "20px 24px",
                  borderBottom: `1px solid ${colors.borderSubtle}`,
                }}
              >
                <table role="presentation" style={{ width: "100%" }}>
                  <tbody>
                    <tr>
                      <td
                        style={{
                          textAlign: "center" as const,
                          padding: "8px",
                          width: "33.33%",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "24px",
                            fontWeight: 700,
                            fontFamily: monoFont,
                            color: colors.teal,
                          }}
                        >
                          {formatMinutes(totalTimeEstimate)}
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: colors.pencil,
                            textTransform: "uppercase" as const,
                            letterSpacing: "0.06em",
                            fontWeight: 600,
                            marginTop: "4px",
                          }}
                        >
                          This week
                        </div>
                      </td>
                      <td
                        style={{
                          textAlign: "center" as const,
                          padding: "8px",
                          width: "33.33%",
                          borderLeft: `1px solid ${colors.borderSubtle}`,
                          borderRight: `1px solid ${colors.borderSubtle}`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: "24px",
                            fontWeight: 700,
                            fontFamily: monoFont,
                            color:
                              streakCount > 0 ? colors.teal : colors.pencil,
                          }}
                        >
                          {streakCount}
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: colors.pencil,
                            textTransform: "uppercase" as const,
                            letterSpacing: "0.06em",
                            fontWeight: 600,
                            marginTop: "4px",
                          }}
                        >
                          Day streak
                        </div>
                      </td>
                      <td
                        style={{
                          textAlign: "center" as const,
                          padding: "8px",
                          width: "33.33%",
                        }}
                      >
                        {closestExam ? (
                          <>
                            <div
                              style={{
                                fontSize: "24px",
                                fontWeight: 700,
                                fontFamily: monoFont,
                                color: examDaysColor(
                                  closestExam.daysRemaining,
                                ),
                              }}
                            >
                              {closestExam.daysRemaining}
                            </div>
                            <div
                              style={{
                                fontSize: "12px",
                                color: colors.pencil,
                                textTransform: "uppercase" as const,
                                letterSpacing: "0.06em",
                                fontWeight: 600,
                                marginTop: "4px",
                              }}
                            >
                              Days to exam
                            </div>
                          </>
                        ) : (
                          <>
                            <div
                              style={{
                                fontSize: "24px",
                                fontWeight: 700,
                                fontFamily: monoFont,
                                color: colors.pencil,
                              }}
                            >
                              &mdash;
                            </div>
                            <div
                              style={{
                                fontSize: "12px",
                                color: colors.pencil,
                                textTransform: "uppercase" as const,
                                letterSpacing: "0.06em",
                                fontWeight: 600,
                                marginTop: "4px",
                              }}
                            >
                              No exam set
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>

            {/* Week plan */}
            <tr>
              <td
                style={{
                  backgroundColor: colors.paper,
                  padding: "24px",
                  borderBottom: `1px solid ${colors.borderSubtle}`,
                }}
              >
                <h2
                  style={{
                    margin: "0 0 16px",
                    fontFamily: serifFont,
                    fontSize: "20px",
                    fontWeight: 400,
                    color: colors.ink,
                  }}
                >
                  Your week ahead
                </h2>
                {weekPlan.length === 0 ? (
                  <p
                    style={{
                      margin: 0,
                      color: colors.pencil,
                      fontSize: "14px",
                    }}
                  >
                    No sessions planned yet. Open Swotta to get started.
                  </p>
                ) : (
                  weekPlan.map((day, dayIndex) => (
                    <div
                      key={dayIndex}
                      style={{
                        marginBottom:
                          dayIndex < weekPlan.length - 1 ? "16px" : 0,
                      }}
                    >
                      <div
                        style={{
                          fontSize: "13px",
                          fontWeight: 600,
                          textTransform: "uppercase" as const,
                          letterSpacing: "0.06em",
                          color: colors.pencil,
                          marginBottom: "8px",
                        }}
                      >
                        {day.day}
                      </div>
                      {day.blocks.map((block, blockIndex) => (
                        <div
                          key={blockIndex}
                          style={{
                            padding: "10px 12px",
                            backgroundColor: colors.canvas,
                            borderRadius: "8px",
                            marginBottom:
                              blockIndex < day.blocks.length - 1 ? "6px" : 0,
                            fontSize: "14px",
                          }}
                        >
                          <span
                            style={{ color: colors.ink, fontWeight: 500 }}
                          >
                            {block.topicName}
                          </span>
                          <span style={{ color: colors.pencil }}>
                            {" \u00B7 "}
                          </span>
                          <span
                            style={{
                              color: colors.teal,
                              fontSize: "13px",
                            }}
                          >
                            {block.blockTypeLabel}
                          </span>
                          <span
                            style={{
                              color: colors.pencil,
                              fontSize: "13px",
                              float: "right" as const,
                              fontFamily: monoFont,
                            }}
                          >
                            {block.durationMinutes}m
                          </span>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </td>
            </tr>

            {/* Exam countdown */}
            {examCountdown.length > 0 && (
              <tr>
                <td
                  style={{
                    backgroundColor: colors.paper,
                    padding: "24px",
                    borderBottom: `1px solid ${colors.borderSubtle}`,
                  }}
                >
                  <h2
                    style={{
                      margin: "0 0 12px",
                      fontFamily: serifFont,
                      fontSize: "20px",
                      fontWeight: 400,
                      color: colors.ink,
                    }}
                  >
                    Exam countdown
                  </h2>
                  <table role="presentation" style={{ width: "100%" }}>
                    <tbody>
                      {examCountdown.map((exam, i) => (
                        <tr key={i}>
                          <td
                            style={{
                              padding: "6px 0",
                              fontSize: "14px",
                              color: colors.graphite,
                            }}
                          >
                            {exam.qualificationName}
                          </td>
                          <td
                            style={{
                              padding: "6px 0",
                              textAlign: "right" as const,
                              fontSize: "14px",
                              fontWeight: 700,
                              fontFamily: monoFont,
                              color: examDaysColor(exam.daysRemaining),
                            }}
                          >
                            {exam.daysRemaining === 0
                              ? "Today"
                              : exam.daysRemaining === 1
                                ? "Tomorrow"
                                : `${exam.daysRemaining} days`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </td>
              </tr>
            )}

            {/* Footer */}
            <tr>
              <td
                style={{
                  backgroundColor: colors.paper,
                  padding: "24px",
                  borderRadius: "0 0 12px 12px",
                  textAlign: "center" as const,
                  fontSize: "12px",
                  color: colors.pencil,
                }}
              >
                <p style={{ margin: 0 }}>
                  Your Monday study plan from Swotta
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

export function renderStudentWeeklyEmail(
  props: StudentWeeklyEmailProps,
): string {
  const markup = renderToStaticMarkup(
    React.createElement(StudentWeeklyEmail, props),
  );
  return `<!DOCTYPE html>${markup}`;
}

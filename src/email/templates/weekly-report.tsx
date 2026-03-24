import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WeeklyReportData } from "@/lib/types";

export interface WeeklyReportEmailProps {
  data: WeeklyReportData;
  learnerName: string;
  examCountdown?: Array<{
    qualificationName: string;
    daysRemaining: number;
    examDateFormatted: string;
  }>;
  studyPatterns?: {
    dailyBreakdown: Array<{
      dayLabel: string;
      minutes: number;
    }>;
    averageSessionMinutes: number;
    studyDays: number;
  };
  behaviourInsights?: {
    engagementDirection: "improving" | "stable" | "declining";
    avoidedTopics: Array<{ topicName: string; skippedCount: number }>;
  };
  calibrationInsight?: {
    overconfident: boolean;
    underconfident: boolean;
    calibrationScore: number;
    trend: string;
    message: string;
    topicHighlights: Array<{
      topicName: string;
      message: string;
      overconfident: boolean;
      underconfident: boolean;
    }>;
  };
  misconceptionNarratives?: Array<{
    narrative: string;
    resolved: boolean;
  }>;
  techniqueMastery?: Array<{
    commandWord: string;
    avgScore: number | null;
    trend: string;
  }>;
  examPhaseContext?: {
    phase: string;
    description: string;
    daysToExam: number;
  };
  suggestions?: Array<{
    message: string;
    priority: string;
  }>;
}

const colors = {
  bg: "#f9fafb",
  card: "#ffffff",
  primary: "#2563eb",
  text: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  green: "#059669",
  red: "#dc2626",
  yellow: "#d97706",
  greenBg: "#ecfdf5",
  yellowBg: "#fffbeb",
  redBg: "#fef2f2",
};

const serifFont = "Georgia, 'Times New Roman', serif";
const sansFont =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const baseStyle: React.CSSProperties = {
  fontFamily: sansFont,
  fontSize: "16px",
  lineHeight: "1.5",
  color: colors.text,
};

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function severityColor(severity: "low" | "medium" | "high"): string {
  if (severity === "high") return colors.red;
  if (severity === "medium") return colors.yellow;
  return colors.muted;
}

function severityBg(severity: "low" | "medium" | "high"): string {
  if (severity === "high") return colors.redBg;
  if (severity === "medium") return colors.yellowBg;
  return colors.bg;
}

export function WeeklyReportEmail({
  data,
  learnerName,
  examCountdown,
  studyPatterns,
  behaviourInsights,
  calibrationInsight,
  misconceptionNarratives,
  techniqueMastery,
  examPhaseContext,
  suggestions,
}: WeeklyReportEmailProps): React.ReactElement {
  const strengths = data.masteryChanges
    .filter((c) => c.delta > 0)
    .sort((a, b) => b.delta - a.delta);
  const areasToWatch = data.masteryChanges
    .filter((c) => c.delta < 0 || c.after < 0.4)
    .sort((a, b) => a.delta - b.delta);

  return (
    <html lang="en">
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`Weekly Study Report - ${learnerName}`}</title>
      </head>
      <body
        style={{
          ...baseStyle,
          backgroundColor: colors.bg,
          margin: 0,
          padding: "24px 16px",
        }}
      >
        <table
          role="presentation"
          style={{
            maxWidth: "600px",
            margin: "0 auto",
            width: "100%",
          }}
        >
          <tbody>
            {/* Header */}
            <tr>
              <td
                style={{
                  backgroundColor: colors.primary,
                  color: "#ffffff",
                  padding: "24px",
                  borderRadius: "8px 8px 0 0",
                  textAlign: "center" as const,
                }}
              >
                <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 600 }}>
                  Weekly Study Report
                </h1>
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: "14px",
                    opacity: 0.9,
                  }}
                >
                  {learnerName} &middot; {formatDate(data.periodStart)}{" "}
                  &ndash; {formatDate(data.periodEnd)}
                </p>
              </td>
            </tr>

            {/* Key Metrics */}
            <tr>
              <td
                style={{
                  backgroundColor: colors.card,
                  padding: "24px",
                  borderBottom: `1px solid ${colors.border}`,
                }}
              >
                <table role="presentation" style={{ width: "100%" }}>
                  <tbody>
                    <tr>
                      <td
                        style={{
                          textAlign: "center" as const,
                          padding: "8px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "28px",
                            fontWeight: 700,
                            fontFamily: serifFont,
                            color: colors.primary,
                          }}
                        >
                          {data.sessionsCompleted}
                        </div>
                        <div
                          style={{ fontSize: "12px", color: colors.muted }}
                        >
                          Sessions
                        </div>
                      </td>
                      <td
                        style={{
                          textAlign: "center" as const,
                          padding: "8px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "28px",
                            fontWeight: 700,
                            fontFamily: serifFont,
                            color: colors.primary,
                          }}
                        >
                          {data.totalStudyMinutes}
                        </div>
                        <div
                          style={{ fontSize: "12px", color: colors.muted }}
                        >
                          Minutes Studied
                        </div>
                      </td>
                      <td
                        style={{
                          textAlign: "center" as const,
                          padding: "8px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "28px",
                            fontWeight: 700,
                            fontFamily: serifFont,
                            color: colors.primary,
                          }}
                        >
                          {data.topicsReviewed}
                        </div>
                        <div
                          style={{ fontSize: "12px", color: colors.muted }}
                        >
                          Topics Reviewed
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>

            {/* Study Patterns */}
            {studyPatterns && (
              <tr>
                <td
                  style={{
                    backgroundColor: colors.card,
                    padding: "24px",
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  <h2
                    style={{
                      margin: "0 0 12px",
                      fontSize: "16px",
                      fontWeight: 600,
                    }}
                  >
                    Study Patterns
                  </h2>
                  <table role="presentation" style={{ width: "100%" }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: "4px 0", fontSize: "14px" }}>
                          <span style={{ color: colors.muted }}>
                            Study days this week
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "4px 0",
                            textAlign: "right" as const,
                            fontSize: "14px",
                            fontWeight: 600,
                            fontFamily: serifFont,
                          }}
                        >
                          {studyPatterns.studyDays}/7
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: "4px 0", fontSize: "14px" }}>
                          <span style={{ color: colors.muted }}>
                            Average session
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "4px 0",
                            textAlign: "right" as const,
                            fontSize: "14px",
                            fontWeight: 600,
                            fontFamily: serifFont,
                          }}
                        >
                          {studyPatterns.averageSessionMinutes}m
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  {studyPatterns.dailyBreakdown.length > 0 && (
                    <table
                      role="presentation"
                      style={{
                        width: "100%",
                        marginTop: "12px",
                        borderSpacing: "2px",
                      }}
                    >
                      <tbody>
                        <tr>
                          {studyPatterns.dailyBreakdown.map((day, i) => (
                            <td
                              key={i}
                              style={{
                                textAlign: "center" as const,
                                fontSize: "11px",
                                color: colors.muted,
                                verticalAlign: "bottom" as const,
                                padding: "0 2px",
                              }}
                            >
                              <div
                                style={{
                                  backgroundColor:
                                    day.minutes > 0
                                      ? colors.primary
                                      : colors.border,
                                  height: `${Math.max(day.minutes > 0 ? 8 : 4, 4)}px`,
                                  borderRadius: "2px",
                                  marginBottom: "4px",
                                  opacity: day.minutes > 0 ? 1 : 0.4,
                                }}
                              />
                              {day.dayLabel}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  )}
                </td>
              </tr>
            )}

            {/* Summary */}
            <tr>
              <td
                style={{
                  backgroundColor: colors.card,
                  padding: "24px",
                  borderBottom: `1px solid ${colors.border}`,
                }}
              >
                <h2
                  style={{
                    margin: "0 0 12px",
                    fontSize: "16px",
                    fontWeight: 600,
                  }}
                >
                  Summary
                </h2>
                <p
                  style={{
                    margin: 0,
                    color: colors.muted,
                    fontSize: "14px",
                  }}
                >
                  {data.summary}
                </p>
              </td>
            </tr>

            {/* Strengths */}
            {strengths.length > 0 && (
              <tr>
                <td
                  style={{
                    backgroundColor: colors.card,
                    padding: "24px",
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  <h2
                    style={{
                      margin: "0 0 12px",
                      fontSize: "16px",
                      fontWeight: 600,
                    }}
                  >
                    Strengths
                  </h2>
                  {strengths.map((s, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "8px 12px",
                        marginBottom:
                          i < strengths.length - 1 ? "8px" : 0,
                        backgroundColor: colors.greenBg,
                        borderLeft: `3px solid ${colors.green}`,
                        borderRadius: "0 4px 4px 0",
                        fontSize: "14px",
                      }}
                    >
                      <strong style={{ color: colors.green }}>
                        {s.topicName}
                      </strong>
                      <span style={{ color: colors.muted }}>
                        {" "}
                        &mdash; +{Math.round(s.delta * 100)}% mastery
                      </span>
                    </div>
                  ))}
                </td>
              </tr>
            )}

            {/* Areas to Watch */}
            {areasToWatch.length > 0 && (
              <tr>
                <td
                  style={{
                    backgroundColor: colors.card,
                    padding: "24px",
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  <h2
                    style={{
                      margin: "0 0 12px",
                      fontSize: "16px",
                      fontWeight: 600,
                    }}
                  >
                    Areas to Watch
                  </h2>
                  {areasToWatch.map((a, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "8px 12px",
                        marginBottom:
                          i < areasToWatch.length - 1 ? "8px" : 0,
                        backgroundColor:
                          a.delta < 0 ? colors.yellowBg : colors.redBg,
                        borderLeft: `3px solid ${a.delta < 0 ? colors.yellow : colors.red}`,
                        borderRadius: "0 4px 4px 0",
                        fontSize: "14px",
                      }}
                    >
                      <strong
                        style={{
                          color:
                            a.delta < 0 ? colors.yellow : colors.red,
                        }}
                      >
                        {a.topicName}
                      </strong>
                      <span style={{ color: colors.muted }}>
                        {" "}
                        &mdash;{" "}
                        {a.delta < 0
                          ? `${Math.round(a.delta * 100)}% mastery`
                          : `at ${Math.round(a.after * 100)}% — needs attention`}
                      </span>
                    </div>
                  ))}
                </td>
              </tr>
            )}

            {/* Mastery Changes */}
            {data.masteryChanges.length > 0 && (
              <tr>
                <td
                  style={{
                    backgroundColor: colors.card,
                    padding: "24px",
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  <h2
                    style={{
                      margin: "0 0 12px",
                      fontSize: "16px",
                      fontWeight: 600,
                    }}
                  >
                    Mastery Progress
                  </h2>
                  <table role="presentation" style={{ width: "100%" }}>
                    <tbody>
                      {data.masteryChanges.map((change) => (
                        <tr key={change.topicId}>
                          <td
                            style={{
                              padding: "6px 0",
                              fontSize: "14px",
                            }}
                          >
                            {change.topicName}
                          </td>
                          <td
                            style={{
                              padding: "6px 0",
                              textAlign: "right" as const,
                              fontSize: "14px",
                              fontWeight: 600,
                              fontFamily: serifFont,
                              color:
                                change.delta > 0
                                  ? colors.green
                                  : change.delta < 0
                                    ? colors.red
                                    : colors.muted,
                            }}
                          >
                            {change.delta > 0 ? "+" : ""}
                            {Math.round(change.delta * 100)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </td>
              </tr>
            )}

            {/* Exam Countdown */}
            {examCountdown && examCountdown.length > 0 && (
              <tr>
                <td
                  style={{
                    backgroundColor: colors.card,
                    padding: "24px",
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  <h2
                    style={{
                      margin: "0 0 12px",
                      fontSize: "16px",
                      fontWeight: 600,
                    }}
                  >
                    Exam Countdown
                  </h2>
                  <table role="presentation" style={{ width: "100%" }}>
                    <tbody>
                      {examCountdown.map((exam, i) => (
                        <tr key={i}>
                          <td
                            style={{
                              padding: "6px 0",
                              fontSize: "14px",
                              color: colors.muted,
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
                              fontFamily: serifFont,
                              color:
                                exam.daysRemaining <= 14
                                  ? colors.red
                                  : exam.daysRemaining <= 30
                                    ? colors.yellow
                                    : colors.text,
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

            {/* Exam Phase Context */}
            {examPhaseContext && (
              <tr>
                <td
                  style={{
                    backgroundColor: colors.card,
                    padding: "24px",
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  <h2
                    style={{
                      margin: "0 0 12px",
                      fontSize: "16px",
                      fontWeight: 600,
                    }}
                  >
                    Exam Phase
                  </h2>
                  <div
                    style={{
                      padding: "12px 16px",
                      backgroundColor: examPhaseContext.daysToExam <= 14 ? colors.yellowBg : colors.greenBg,
                      borderLeft: `3px solid ${examPhaseContext.daysToExam <= 14 ? colors.yellow : colors.green}`,
                      borderRadius: "0 4px 4px 0",
                      fontSize: "14px",
                    }}
                  >
                    <strong style={{ textTransform: "capitalize" as const }}>
                      {examPhaseContext.phase}
                    </strong>
                    <span style={{ color: colors.muted }}>
                      {" "}&mdash; {examPhaseContext.daysToExam} days to exam
                    </span>
                    <p
                      style={{
                        margin: "8px 0 0",
                        fontSize: "13px",
                        color: colors.muted,
                      }}
                    >
                      {examPhaseContext.description}
                    </p>
                  </div>
                </td>
              </tr>
            )}

            {/* Behaviour Insights */}
            {behaviourInsights && (behaviourInsights.avoidedTopics.length > 0 || behaviourInsights.engagementDirection !== "stable") && (
              <tr>
                <td
                  style={{
                    backgroundColor: colors.card,
                    padding: "24px",
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  <h2
                    style={{
                      margin: "0 0 12px",
                      fontSize: "16px",
                      fontWeight: 600,
                    }}
                  >
                    Behaviour Patterns
                  </h2>
                  {behaviourInsights.engagementDirection !== "stable" && (
                    <div
                      style={{
                        padding: "8px 12px",
                        marginBottom: behaviourInsights.avoidedTopics.length > 0 ? "8px" : 0,
                        backgroundColor: behaviourInsights.engagementDirection === "improving" ? colors.greenBg : colors.yellowBg,
                        borderLeft: `3px solid ${behaviourInsights.engagementDirection === "improving" ? colors.green : colors.yellow}`,
                        borderRadius: "0 4px 4px 0",
                        fontSize: "14px",
                      }}
                    >
                      <strong style={{ color: behaviourInsights.engagementDirection === "improving" ? colors.green : colors.yellow }}>
                        Engagement {behaviourInsights.engagementDirection}
                      </strong>
                    </div>
                  )}
                  {behaviourInsights.avoidedTopics.map((topic, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "8px 12px",
                        marginBottom: i < behaviourInsights.avoidedTopics.length - 1 ? "8px" : 0,
                        backgroundColor: colors.yellowBg,
                        borderLeft: `3px solid ${colors.yellow}`,
                        borderRadius: "0 4px 4px 0",
                        fontSize: "14px",
                      }}
                    >
                      <strong style={{ color: colors.yellow }}>
                        {topic.topicName}
                      </strong>
                      <span style={{ color: colors.muted }}>
                        {" "}&mdash; skipped {topic.skippedCount} times
                      </span>
                    </div>
                  ))}
                </td>
              </tr>
            )}

            {/* Confidence Calibration */}
            {calibrationInsight && (
              <tr>
                <td
                  style={{
                    backgroundColor: colors.card,
                    padding: "24px",
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  <h2
                    style={{
                      margin: "0 0 12px",
                      fontSize: "16px",
                      fontWeight: 600,
                    }}
                  >
                    Confidence Calibration
                  </h2>
                  <p
                    style={{
                      margin: "0 0 12px",
                      fontSize: "14px",
                      color: colors.muted,
                    }}
                  >
                    {calibrationInsight.message}
                  </p>
                  {calibrationInsight.topicHighlights.map((topic, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "8px 12px",
                        marginBottom: i < calibrationInsight.topicHighlights.length - 1 ? "8px" : 0,
                        backgroundColor: topic.underconfident ? colors.greenBg : colors.yellowBg,
                        borderLeft: `3px solid ${topic.underconfident ? colors.green : colors.yellow}`,
                        borderRadius: "0 4px 4px 0",
                        fontSize: "14px",
                      }}
                    >
                      <span style={{ color: colors.muted }}>
                        {topic.message}
                      </span>
                    </div>
                  ))}
                </td>
              </tr>
            )}

            {/* Misconception Tracker */}
            {misconceptionNarratives && misconceptionNarratives.length > 0 && (
              <tr>
                <td
                  style={{
                    backgroundColor: colors.card,
                    padding: "24px",
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  <h2
                    style={{
                      margin: "0 0 12px",
                      fontSize: "16px",
                      fontWeight: 600,
                    }}
                  >
                    Misconception Tracker
                  </h2>
                  {misconceptionNarratives.map((m, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "8px 12px",
                        marginBottom: i < misconceptionNarratives.length - 1 ? "8px" : 0,
                        backgroundColor: m.resolved ? colors.greenBg : colors.yellowBg,
                        borderLeft: `3px solid ${m.resolved ? colors.green : colors.yellow}`,
                        borderRadius: "0 4px 4px 0",
                        fontSize: "14px",
                      }}
                    >
                      <span style={{ color: colors.muted }}>
                        {m.narrative}
                      </span>
                      {m.resolved && (
                        <strong style={{ color: colors.green, marginLeft: "8px" }}>
                          Resolved
                        </strong>
                      )}
                    </div>
                  ))}
                </td>
              </tr>
            )}

            {/* Technique Mastery */}
            {techniqueMastery && techniqueMastery.length > 0 && (
              <tr>
                <td
                  style={{
                    backgroundColor: colors.card,
                    padding: "24px",
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  <h2
                    style={{
                      margin: "0 0 12px",
                      fontSize: "16px",
                      fontWeight: 600,
                    }}
                  >
                    Exam Technique
                  </h2>
                  <table role="presentation" style={{ width: "100%" }}>
                    <tbody>
                      {techniqueMastery.map((t, i) => (
                        <tr key={i}>
                          <td
                            style={{
                              padding: "6px 0",
                              fontSize: "14px",
                              textTransform: "capitalize" as const,
                            }}
                          >
                            {t.commandWord}
                          </td>
                          <td
                            style={{
                              padding: "6px 0",
                              textAlign: "right" as const,
                              fontSize: "14px",
                              fontWeight: 600,
                              fontFamily: serifFont,
                              color:
                                t.avgScore !== null && t.avgScore >= 60
                                  ? colors.green
                                  : t.avgScore !== null && t.avgScore < 40
                                    ? colors.red
                                    : colors.muted,
                            }}
                          >
                            {t.avgScore !== null ? `${Math.round(t.avgScore)}%` : "—"}
                          </td>
                          <td
                            style={{
                              padding: "6px 0 6px 8px",
                              textAlign: "right" as const,
                              fontSize: "12px",
                              color: colors.muted,
                            }}
                          >
                            {t.trend}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </td>
              </tr>
            )}

            {/* Suggestions for You */}
            {suggestions && suggestions.length > 0 && (
              <tr>
                <td
                  style={{
                    backgroundColor: colors.card,
                    padding: "24px",
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  <h2
                    style={{
                      margin: "0 0 12px",
                      fontSize: "16px",
                      fontWeight: 600,
                    }}
                  >
                    Suggestions for You
                  </h2>
                  {suggestions.map((s, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "8px 12px",
                        marginBottom: i < suggestions.length - 1 ? "8px" : 0,
                        backgroundColor: s.priority === "high" ? colors.yellowBg : colors.bg,
                        borderLeft: `3px solid ${s.priority === "high" ? colors.yellow : colors.muted}`,
                        borderRadius: "0 4px 4px 0",
                        fontSize: "14px",
                      }}
                    >
                      <span style={{ color: colors.text }}>
                        {s.message}
                      </span>
                    </div>
                  ))}
                </td>
              </tr>
            )}

            {/* Flags */}
            {data.flags.length > 0 && (
              <tr>
                <td
                  style={{
                    backgroundColor: colors.card,
                    padding: "24px",
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  <h2
                    style={{
                      margin: "0 0 12px",
                      fontSize: "16px",
                      fontWeight: 600,
                    }}
                  >
                    Attention Needed
                  </h2>
                  {data.flags.map((flag, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "8px 12px",
                        marginBottom:
                          i < data.flags.length - 1 ? "8px" : 0,
                        backgroundColor: severityBg(flag.severity),
                        borderLeft: `3px solid ${severityColor(flag.severity)}`,
                        borderRadius: "0 4px 4px 0",
                        fontSize: "14px",
                      }}
                    >
                      <strong
                        style={{
                          color: severityColor(flag.severity),
                          textTransform: "capitalize" as const,
                        }}
                      >
                        {flag.type}
                      </strong>
                      <span style={{ color: colors.muted }}>
                        {" "}
                        &mdash; {flag.description}
                      </span>
                    </div>
                  ))}
                </td>
              </tr>
            )}

            {/* Footer */}
            <tr>
              <td
                style={{
                  backgroundColor: colors.card,
                  padding: "24px",
                  borderRadius: "0 0 8px 8px",
                  textAlign: "center" as const,
                  fontSize: "12px",
                  color: colors.muted,
                }}
              >
                <p style={{ margin: 0 }}>
                  This report was generated by Swotta. If you have questions,
                  reply to this email.
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

export function renderWeeklyReportEmail(
  props: WeeklyReportEmailProps,
): string {
  const markup = renderToStaticMarkup(
    React.createElement(WeeklyReportEmail, props),
  );
  return `<!DOCTYPE html>${markup}`;
}

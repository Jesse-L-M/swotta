import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WeeklyReportData } from "@/lib/types";

export interface WeeklyReportEmailProps {
  data: WeeklyReportData;
  learnerName: string;
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
};

const baseStyle: React.CSSProperties = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
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

export function WeeklyReportEmail({
  data,
  learnerName,
}: WeeklyReportEmailProps): React.ReactElement {
  return (
    <html lang="en">
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
                <p style={{ margin: "8px 0 0", fontSize: "14px", opacity: 0.9 }}>
                  {learnerName} &middot; {formatDate(data.periodStart)} &ndash;{" "}
                  {formatDate(data.periodEnd)}
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
                      <td style={{ textAlign: "center" as const, padding: "8px" }}>
                        <div
                          style={{
                            fontSize: "28px",
                            fontWeight: 700,
                            color: colors.primary,
                          }}
                        >
                          {data.sessionsCompleted}
                        </div>
                        <div style={{ fontSize: "12px", color: colors.muted }}>
                          Sessions
                        </div>
                      </td>
                      <td style={{ textAlign: "center" as const, padding: "8px" }}>
                        <div
                          style={{
                            fontSize: "28px",
                            fontWeight: 700,
                            color: colors.primary,
                          }}
                        >
                          {data.totalStudyMinutes}
                        </div>
                        <div style={{ fontSize: "12px", color: colors.muted }}>
                          Minutes Studied
                        </div>
                      </td>
                      <td style={{ textAlign: "center" as const, padding: "8px" }}>
                        <div
                          style={{
                            fontSize: "28px",
                            fontWeight: 700,
                            color: colors.primary,
                          }}
                        >
                          {data.topicsReviewed}
                        </div>
                        <div style={{ fontSize: "12px", color: colors.muted }}>
                          Topics Reviewed
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>

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
                <p style={{ margin: 0, color: colors.muted, fontSize: "14px" }}>
                  {data.summary}
                </p>
              </td>
            </tr>

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
                        marginBottom: i < data.flags.length - 1 ? "8px" : 0,
                        backgroundColor: colors.bg,
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
                      <span style={{ color: colors.muted }}> &mdash; {flag.description}</span>
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
                  This report was generated by Swotta. If you have questions, reply to
                  this email.
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
  props: WeeklyReportEmailProps
): string {
  const markup = renderToStaticMarkup(
    React.createElement(WeeklyReportEmail, props)
  );
  return `<!DOCTYPE html>${markup}`;
}

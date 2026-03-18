import React from "react";
import { cn } from "@/lib/utils";

export type AlertVariant = "success" | "warning" | "danger";

export interface FlagAlertProps {
  variant: AlertVariant;
  title: string;
  description: string;
  className?: string;
}

const variantStyles: Record<AlertVariant, { border: string; title: string; bg: string }> = {
  success: {
    border: "border-l-emerald-500",
    title: "text-emerald-700",
    bg: "bg-emerald-50",
  },
  warning: {
    border: "border-l-amber-500",
    title: "text-amber-700",
    bg: "bg-amber-50",
  },
  danger: {
    border: "border-l-red-500",
    title: "text-red-700",
    bg: "bg-red-50",
  },
};

export function FlagAlert({ variant, title, description, className }: FlagAlertProps) {
  const styles = variantStyles[variant];
  return (
    <div
      data-testid="flag-alert"
      data-variant={variant}
      className={cn(
        "rounded-r-md border-l-4 px-4 py-3",
        styles.border,
        styles.bg,
        className,
      )}
    >
      <p className={cn("text-sm font-semibold", styles.title)}>{title}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export interface FlagAlertListProps {
  flags: Array<{
    type: string;
    description: string;
    severity: "low" | "medium" | "high";
  }>;
  className?: string;
}

function severityToVariant(severity: "low" | "medium" | "high"): AlertVariant {
  if (severity === "high") return "danger";
  if (severity === "medium") return "warning";
  return "success";
}

function formatFlagType(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function FlagAlertList({ flags, className }: FlagAlertListProps) {
  if (flags.length === 0) return null;
  return (
    <div data-testid="flag-alert-list" className={cn("space-y-2", className)}>
      {flags.map((flag, i) => (
        <FlagAlert
          key={i}
          variant={severityToVariant(flag.severity)}
          title={formatFlagType(flag.type)}
          description={flag.description}
        />
      ))}
    </div>
  );
}

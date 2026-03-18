import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  detail?: string;
  accent?: "teal" | "coral" | "amber" | "neutral";
}

const accentStyles: Record<
  NonNullable<StatCardProps["accent"]>,
  { border: string; icon: string }
> = {
  teal: { border: "border-teal-200", icon: "text-teal-600" },
  coral: { border: "border-red-200", icon: "text-[#F97066]" },
  amber: { border: "border-amber-200", icon: "text-amber-600" },
  neutral: { border: "border-[#E8E4DB]", icon: "text-[#6B7280]" },
};

export function StatCard({
  label,
  value,
  detail,
  accent = "neutral",
}: StatCardProps) {
  const style = accentStyles[accent];

  return (
    <div
      className={cn(
        "rounded-xl border bg-white px-5 py-4 shadow-sm",
        style.border
      )}
    >
      <p className="text-sm font-medium text-[#6B7280]">{label}</p>
      <p
        className={cn(
          "mt-1 font-[family-name:var(--font-serif)] text-2xl",
          style.icon
        )}
      >
        {value}
      </p>
      {detail && (
        <p className="mt-0.5 text-xs text-[#6B7280]">{detail}</p>
      )}
    </div>
  );
}

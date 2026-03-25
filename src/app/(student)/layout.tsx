import { Instrument_Serif } from "next/font/google";
import { StudentShell } from "@/components/student/student-shell";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-serif",
  display: "swap",
});

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${instrumentSerif.variable} min-h-screen bg-[#FFFBF5]`}>
      <StudentShell>{children}</StudentShell>
    </div>
  );
}

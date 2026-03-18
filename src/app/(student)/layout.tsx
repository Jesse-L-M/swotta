import { Instrument_Serif } from "next/font/google";

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
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}

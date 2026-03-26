"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/journey", label: "Journey" },
  { href: "/sources", label: "Sources" },
  { href: "/settings", label: "Settings" },
];

function isImmersiveRoute(pathname: string): boolean {
  return pathname === "/onboarding"
    || pathname === "/diagnostic"
    || pathname.startsWith("/session/");
}

function isSessionRoute(pathname: string): boolean {
  return pathname.startsWith("/session/");
}

function isActiveRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function StudentShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const immersiveRoute = isImmersiveRoute(pathname);

  if (immersiveRoute) {
    if (isSessionRoute(pathname)) {
      return <main>{children}</main>;
    }

    return <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>;
  }

  return (
    <div>
      <header className="sticky top-0 z-40 border-b border-[#E5E0D6] bg-[#FFFBF5]/90 backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/dashboard"
              className="font-[family-name:var(--font-serif)] text-xl text-[#1A1917]"
            >
              Swotta
            </Link>
            <p className="hidden text-xs font-medium uppercase tracking-[0.12em] text-[#6B7280] sm:block">
              Student workspace
            </p>
          </div>

          <nav
            aria-label="Student navigation"
            className="mt-4 flex gap-2 overflow-x-auto pb-1"
          >
            {navItems.map((item) => {
              const active = isActiveRoute(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-[#1A1917] text-white shadow-[0_4px_12px_rgba(26,25,23,0.12)]"
                      : "bg-white text-[#5C5950] hover:bg-[#F0ECE4] hover:text-[#1A1917]"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}

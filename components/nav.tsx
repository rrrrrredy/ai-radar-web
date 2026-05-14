import Link from "next/link";

import { LanguageToggle } from "@/components/language-toggle";

const navItems = [
  { href: "/", label: "Today" },
  { href: "/radar", label: "Radar" },
  { href: "/clusters", label: "Clusters" },
  { href: "/entities", label: "Entities" },
  { href: "/reports", label: "Reports" },
  { href: "/ask", label: "Ask" },
  { href: "/write", label: "Write" },
  { href: "/admin", label: "Admin" }
];

export function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-radar-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link className="text-base font-semibold text-radar-ink" href="/">
            AI Industry Radar
          </Link>
          <div className="flex items-center gap-3">
            <LanguageToggle />
            <Link
              className="rounded-md border border-radar-line px-3 py-2 text-sm font-medium text-radar-ink hover:border-radar-cyan hover:text-radar-cyan"
              href="/auth/login"
            >
              Sign in
            </Link>
          </div>
        </div>
        <nav aria-label="Main navigation" className="flex flex-wrap gap-2">
          {navItems.map((item) => (
            <Link
              className="rounded-md px-3 py-2 text-sm font-medium text-radar-muted hover:bg-radar-panel hover:text-radar-ink"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

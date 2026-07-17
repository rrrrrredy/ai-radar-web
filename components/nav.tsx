"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LanguageToggle } from "@/components/language-toggle";

const publicNavItems = [
  { href: "/", label: "今日" },
  { href: "/radar", label: "雷达" },
  { href: "/entities", label: "实体" },
  { href: "/reports", label: "报告" },
  { href: "/ask", label: "提问" }
];

const adminNavItem = { href: "/admin", label: "运维" };

export function Nav({ isSignedIn = false }: { isSignedIn?: boolean }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-radar-line bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link className="group" href="/">
            <span className="block text-base font-semibold text-radar-ink group-hover:text-radar-evidence">
              AI 行业雷达
            </span>
            <span className="block text-xs font-medium text-radar-muted">
              AI 行业情报台
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <LanguageToggle />
            {isSignedIn ? (
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-radar-evidence/30 bg-radar-evidence/10 px-3 py-2 text-sm font-medium text-radar-evidence">
                  已登录
                </span>
                <a
                  className="rounded-md border border-radar-line px-3 py-2 text-sm font-medium text-radar-ink hover:border-radar-evidence hover:text-radar-evidence"
                  href="/auth/logout"
                >
                  退出
                </a>
              </div>
            ) : null}
          </div>
        </div>
        <nav
          aria-label="主导航"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex flex-wrap gap-2">
            {publicNavItems.map((item) => (
              <NavLink
                href={item.href}
                isActive={isActivePath(pathname, item.href)}
                key={item.href}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
          {isSignedIn ? (
            <div className="flex flex-wrap items-center gap-2 border-l border-radar-line pl-3 max-sm:border-l-0 max-sm:pl-0">
              <span className="text-xs font-semibold uppercase tracking-normal text-radar-muted">
                运维
              </span>
              <NavLink
                href={adminNavItem.href}
                isActive={isActivePath(pathname, adminNavItem.href)}
                variant="admin"
              >
                {adminNavItem.label}
              </NavLink>
            </div>
          ) : null}
        </nav>
      </div>
    </header>
  );
}

function NavLink({
  children,
  href,
  isActive,
  variant = "public"
}: {
  children: React.ReactNode;
  href: string;
  isActive: boolean;
  variant?: "public" | "admin";
}) {
  const activeClass =
    variant === "admin"
      ? "border-radar-admin/30 bg-radar-admin/10 text-radar-admin"
      : "border-radar-evidence/30 bg-radar-evidence/10 text-radar-evidence";
  const inactiveClass =
    variant === "admin"
      ? "border-radar-admin/20 text-radar-admin hover:bg-radar-panel"
      : "border-transparent text-radar-muted hover:bg-radar-panel hover:text-radar-ink";

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={`rounded-md border px-3 py-2 text-sm font-medium ${isActive ? activeClass : inactiveClass}`}
      href={href}
    >
      {children}
    </Link>
  );
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

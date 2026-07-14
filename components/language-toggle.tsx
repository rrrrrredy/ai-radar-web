"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const primaryPublicSite = "https://ai-industry-radar.pages.dev";

export function LanguageToggle() {
  const pathname = usePathname();
  const englishPath = englishPublicPath(pathname);

  return (
    <div
      aria-label="语言版本"
      className="inline-flex rounded-md border border-radar-line bg-white p-1 text-xs font-semibold text-radar-muted"
    >
      <Link
        aria-current="page"
        className="rounded bg-radar-ink px-2 py-1 text-white"
        href={pathname}
        hrefLang="zh-CN"
      >
        中文
      </Link>
      <a
        className="rounded px-2 py-1 hover:bg-radar-panel hover:text-radar-ink"
        href={`${primaryPublicSite}${englishPath}`}
        hrefLang="en"
      >
        EN
      </a>
    </div>
  );
}

function englishPublicPath(pathname: string) {
  const supported = ["/radar", "/entities", "/reports", "/ask", "/write"];
  const route = supported.find((candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`));
  return route ? `/en${route}/` : "/en/";
}

"use client";

import { useState } from "react";

import { StatusChip } from "@/components/status-chip";

export function ReportMarkdownExport({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-radar-ink">Markdown export</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-radar-muted">
            Draft markdown keeps status, evidence limits, caveats, gaps, and citations visible for review.
          </p>
        </div>
        <button
          className="rounded-md border border-radar-evidence/30 bg-radar-evidence px-3 py-2 text-xs font-semibold text-white hover:bg-radar-admin"
          onClick={copyMarkdown}
          type="button"
        >
          {copied ? "Copied" : "Copy Markdown"}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <StatusChip label="Review before publishing" tone="caution" />
        <StatusChip label="No unsupported coverage claims" tone="success" />
      </div>
      <textarea
        className="mt-4 h-80 w-full resize-y rounded-md border border-radar-line bg-radar-panel p-3 font-mono text-xs leading-5 text-radar-code outline-none focus:border-radar-evidence"
        readOnly
        value={markdown}
      />
    </section>
  );
}

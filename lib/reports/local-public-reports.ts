import fs from "node:fs/promises";
import path from "node:path";

const localPublicReportsDir = path.join(process.cwd(), "data", "public-reports");

export type LocalPublicReportSnapshotRecords = {
  records: unknown[];
  warnings: string[];
};

export async function loadLocalPublicReportSnapshotRecords(): Promise<LocalPublicReportSnapshotRecords> {
  let entries: string[];

  try {
    entries = await fs.readdir(localPublicReportsDir);
  } catch {
    return {
      records: [],
      warnings: []
    };
  }

  const records: unknown[] = [];
  const warnings: string[] = [];

  for (const entry of entries.filter((fileName) => fileName.endsWith(".json")).sort()) {
    const filePath = path.join(localPublicReportsDir, entry);

    try {
      const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
      records.push(...reportRecordsFromParsedJson(parsed));
    } catch {
      warnings.push(`Local public report snapshot was skipped because it is not valid JSON: ${entry}`);
    }
  }

  return {
    records,
    warnings
  };
}

function reportRecordsFromParsedJson(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (isRecord(value) && Array.isArray(value.reports)) {
    return value.reports;
  }

  return isRecord(value) ? [value] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

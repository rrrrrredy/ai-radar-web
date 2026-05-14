export type IngestionLogLevel = "info" | "warn" | "error";

export type IngestionLogEntry = {
  level: IngestionLogLevel;
  message: string;
  sourceId?: string;
  metadata?: Record<string, unknown>;
};

export class IngestionLogger {
  private readonly entries: IngestionLogEntry[] = [];

  info(message: string, sourceId?: string, metadata?: Record<string, unknown>) {
    this.write("info", message, sourceId, metadata);
  }

  warn(message: string, sourceId?: string, metadata?: Record<string, unknown>) {
    this.write("warn", message, sourceId, metadata);
  }

  error(message: string, sourceId?: string, metadata?: Record<string, unknown>) {
    this.write("error", message, sourceId, metadata);
  }

  all() {
    return [...this.entries];
  }

  warnings() {
    return this.entries.filter((entry) => entry.level === "warn").map((entry) => entry.message);
  }

  private write(level: IngestionLogLevel, message: string, sourceId?: string, metadata?: Record<string, unknown>) {
    this.entries.push({ level, message, sourceId, metadata });
    const prefix = sourceId ? `[ingestion] ${level} ${sourceId}:` : `[ingestion] ${level}:`;
    const writer = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    writer(prefix, message);
  }
}

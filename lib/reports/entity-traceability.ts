import {
  buildEntityEvidenceGraph,
  buildEntitySummaries,
  entityHref,
  entityTrackingInsight,
  type EntitySummary,
  type EntityTrackingInsight
} from "@/lib/radar/entity-insights";
import type { RetrievalRadarItem } from "@/lib/retrieval/types";

export type ReportTraceCitation = {
  id: string;
  source_name: string;
  title: string;
  url: string;
};

export type ReportTraceSection = {
  citations: string[];
  id: string;
  missing_evidence?: string[];
  title: string;
};

export type ReportTraceDocument = {
  citations: ReportTraceCitation[];
  missing_evidence: string[];
  sections: ReportTraceSection[];
  source_item_ids: string[];
};

export type ReportEntityTrace = {
  entity: EntitySummary;
  evidenceItemCount: number;
  href: string;
  insight: EntityTrackingInsight;
  needsReviewCount: number;
  sourceCount: number;
};

export type ReportSectionTraceability = {
  entityTraces: ReportEntityTrace[];
  evidenceItems: RetrievalRadarItem[];
  missingEvidenceCount: number;
  needsReviewCount: number;
  section: ReportTraceSection;
  sourceCount: number;
};

export type ReportEntityTraceability = {
  evidenceItems: RetrievalRadarItem[];
  entityTraces: ReportEntityTrace[];
  missingEvidenceCount: number;
  needsReviewCount: number;
  sourceCount: number;
};

export function reportEntityTraceability(
  report: ReportTraceDocument,
  items: RetrievalRadarItem[],
  limit = 8
): ReportEntityTraceability {
  const evidenceItems = reportEvidenceItems(report, items);
  const entityTraces = entityTracesForEvidence(evidenceItems, limit);

  return {
    evidenceItems,
    entityTraces,
    missingEvidenceCount: report.missing_evidence.length,
    needsReviewCount: evidenceItems.filter((item) => item.status === "needs_review").length,
    sourceCount: new Set(evidenceItems.map((item) => item.source_name)).size
  };
}

export function reportSectionTraceability(
  report: ReportTraceDocument,
  items: RetrievalRadarItem[],
  limit = 4
): ReportSectionTraceability[] {
  const reportItems = reportEvidenceItems(report, items);
  const reportCitationsById = new Map(report.citations.map((citation) => [normalizeIdentity(citation.id), citation]));
  const titleCounts = countNormalizedTitles(reportItems);
  const titleSourceCounts = countNormalizedTitleSources(reportItems);

  return report.sections.map((section) => {
    const sectionCitationIds = new Set(section.citations.map(normalizeIdentity).filter(Boolean));
    const sectionCitations = section.citations
      .map((citationId) => reportCitationsById.get(normalizeIdentity(citationId)))
      .filter((citation): citation is ReportTraceCitation => Boolean(citation));
    const citationUrls = new Set(sectionCitations.map((citation) => normalizeUrl(citation.url)).filter(Boolean));
    const uniqueCitationTitles = new Set(
      sectionCitations
        .map((citation) => normalizeTitle(citation.title))
        .filter((title) => title && titleCounts.get(title) === 1)
    );
    const uniqueCitationTitleSources = new Set(
      sectionCitations
        .map((citation) => titleSourceKey(citation.source_name, citation.title))
        .filter((key) => key && titleSourceCounts.get(key) === 1)
    );
    const evidenceItems = reportItems.filter((item) => {
      if (itemIdentityValues(item).some((identity) => sectionCitationIds.has(identity))) {
        return true;
      }

      if (citationUrls.has(normalizeUrl(item.url))) {
        return true;
      }

      const title = normalizeTitle(item.title);
      if (uniqueCitationTitles.has(title)) {
        return true;
      }

      return uniqueCitationTitleSources.has(titleSourceKey(item.source_name, item.title));
    });
    const entityTraces = entityTracesForEvidence(evidenceItems, limit);

    return {
      entityTraces,
      evidenceItems,
      missingEvidenceCount: section.missing_evidence?.length ?? 0,
      needsReviewCount: evidenceItems.filter((item) => item.status === "needs_review").length,
      section,
      sourceCount: new Set(evidenceItems.map((item) => item.source_name)).size
    };
  });
}

export function reportEvidenceItems(report: ReportTraceDocument, items: RetrievalRadarItem[]) {
  const eligibleItems = items.filter((item) => item.status === "included" || item.status === "needs_review");
  const explicitIds = new Set(report.source_item_ids.map(normalizeIdentity).filter(Boolean));
  const citationIds = new Set(report.citations.map((citation) => normalizeIdentity(citation.id)).filter(Boolean));
  const citationUrls = new Set(report.citations.map((citation) => normalizeUrl(citation.url)).filter(Boolean));
  const titleCounts = countNormalizedTitles(eligibleItems);
  const titleSourceCounts = countNormalizedTitleSources(eligibleItems);
  const uniqueCitationTitles = new Set(
    report.citations
      .map((citation) => normalizeTitle(citation.title))
      .filter((title) => title && titleCounts.get(title) === 1)
  );
  const uniqueCitationTitleSources = new Set(
    report.citations
      .map((citation) => titleSourceKey(citation.source_name, citation.title))
      .filter((key) => key && titleSourceCounts.get(key) === 1)
  );

  return eligibleItems
    .filter((item) => {
      const ids = itemIdentityValues(item);

      if (ids.some((id) => explicitIds.has(id) || citationIds.has(id))) {
        return true;
      }

      if (citationUrls.has(normalizeUrl(item.url))) {
        return true;
      }

      const title = normalizeTitle(item.title);
      if (uniqueCitationTitles.has(title)) {
        return true;
      }

      return uniqueCitationTitleSources.has(titleSourceKey(item.source_name, item.title));
    })
    .toSorted((left, right) => right.overall_score - left.overall_score || left.title.localeCompare(right.title));
}

function entityTracesForEvidence(evidenceItems: RetrievalRadarItem[], limit: number) {
  return buildEntitySummaries(evidenceItems)
    .map((entity) => {
      const graph = buildEntityEvidenceGraph(evidenceItems, entity);

      return {
        entity,
        evidenceItemCount: graph.items.length,
        href: entityHref(entity),
        insight: entityTrackingInsight(entity),
        needsReviewCount: graph.statusCounts.needs_review,
        sourceCount: graph.sourceCounts.size
      };
    })
    .filter((trace) => trace.evidenceItemCount > 0)
    .slice(0, limit);
}

function itemIdentityValues(item: RetrievalRadarItem) {
  return [item.id, item.database_id, item.raw_item_id].map(normalizeIdentity).filter(Boolean);
}

function normalizeIdentity(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function countNormalizedTitles(items: RetrievalRadarItem[]) {
  const counts = new Map<string, number>();

  for (const item of items) {
    const title = normalizeTitle(item.title);
    if (title) {
      counts.set(title, (counts.get(title) ?? 0) + 1);
    }
  }

  return counts;
}

function countNormalizedTitleSources(items: RetrievalRadarItem[]) {
  const counts = new Map<string, number>();

  for (const item of items) {
    const key = titleSourceKey(item.source_name, item.title);
    if (key) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return counts;
}

function titleSourceKey(sourceName: string, title: string) {
  const source = normalizeTitle(sourceName);
  const normalizedTitle = normalizeTitle(title);

  return source && normalizedTitle ? `${source}:${normalizedTitle}` : "";
}

function normalizeUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    url.hash = "";
    const normalized = url.toString();
    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  } catch {
    return trimmed.replace(/#.*$/, "").replace(/\/$/, "");
  }
}

function normalizeTitle(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

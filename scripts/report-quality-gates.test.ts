import assert from "node:assert/strict";

import { buildDeterministicReportDraft } from "@/lib/reports/generate-live-report";
import {
  DAILY_REPORT_INSUFFICIENT_DATA_MESSAGE,
  evaluateReportQualityGate,
  normalizeReportQualityGate,
  qualityGateCaveats,
  reportQualityGateFromPreview,
  validateReportCandidateQualityGate
} from "@/lib/reports/quality-gates";
import type {
  ReportPreview,
  ReportPreviewItem,
  ReportPreviewType,
  ReportQualityGate
} from "@/lib/reports/types";

const evaluatedAt = new Date("2026-07-14T12:00:00.000Z");

function main() {
  testFreshDailyWindowPasses();
  testStaleDailyWindowFailsWithChineseReason();
  testStaleEvidenceCannotHideBehindFreshWindowMetadata();
  testWeeklyFreshnessBoundary();
  testMissingAndFutureEvidenceFail();
  testCountReasonsAreChinese();
  testDailyFailureCopyAndResponseShape();
  testNormalizedGateFailsClosed();
  testCandidateGateRequiresExplicitPassFlags();
  testCandidateGateEnforcesCurrentThresholds();
  testCandidateGateRejectsMalformedLegacyMetadata();
  testCandidateGateRejectsCollectionTimeAsPublication();

  console.log("Report quality gate regression tests passed.");
}

function testFreshDailyWindowPasses() {
  const gate = passingGate("daily", "2026-07-14T06:00:00.000Z");

  assert.equal(gate.passed, true);
  assert.deepEqual(gate.reasons, []);
}

function testStaleDailyWindowFailsWithChineseReason() {
  const gate = passingGate("daily", "2026-07-13T11:59:59.000Z");

  assert.equal(gate.passed, false);
  assert.equal(gate.reasons.length, 1);
  assert.match(gate.reasons[0], /日报最新可用证据截至/);
  assert.match(gate.reasons[0], /超过 24 小时的新鲜度上限/);
  assert.match(gate.reasons[0], /不能标记为“今日”/);
}

function testStaleEvidenceCannotHideBehindFreshWindowMetadata() {
  const gate = evaluateReportQualityGate({
    ...passingMetrics("daily"),
    evaluatedAt,
    evidenceTimestamps: ["2026-07-12T12:00:00.000Z"],
    evidenceWindowEnd: "2026-07-14T12:00:00.000Z",
    freshnessGateApplicable: true
  });

  assert.equal(gate.passed, false);
  assert.match(gate.reasons.join("\n"), /最新可用证据截至/);
  assert.match(gate.reasons.join("\n"), /不能标记为“今日”/);
}

function testWeeklyFreshnessBoundary() {
  const fresh = passingGate("weekly", "2026-07-07T12:00:00.000Z");
  const stale = passingGate("weekly", "2026-07-06T12:00:00.000Z");

  assert.equal(fresh.passed, true, "恰好 7 天的周报证据窗口应通过新鲜度门禁。");
  assert.equal(stale.passed, false);
  assert.match(stale.reasons.join("\n"), /超过 7 天的新鲜度上限/);
  assert.match(stale.reasons.join("\n"), /不能标记为“本周”/);
}

function testMissingAndFutureEvidenceFail() {
  const missing = evaluateReportQualityGate({
    ...passingMetrics("daily"),
    evaluatedAt,
    evidenceTimestamps: [],
    evidenceWindowEnd: null,
    freshnessGateApplicable: true
  });
  const future = evaluateReportQualityGate({
    ...passingMetrics("daily"),
    evaluatedAt,
    evidenceTimestamps: ["2026-07-14T12:06:00.000Z"],
    evidenceWindowEnd: "2026-07-14T12:06:00.000Z",
    freshnessGateApplicable: true
  });

  assert.equal(missing.passed, false);
  assert.match(missing.reasons.join("\n"), /缺少可验证的证据窗口结束时间/);
  assert.equal(future.passed, false);
  assert.match(future.reasons.join("\n"), /晚于门禁评估时间/);
}

function testCountReasonsAreChinese() {
  const gate = evaluateReportQualityGate({
    categoryCount: 1,
    categoryGateApplicable: true,
    citationCount: 1,
    distinctSourceCount: 1,
    freshnessGateApplicable: false,
    reportType: "daily",
    usableItemCount: 1
  });

  assert.equal(gate.passed, false);
  assert.deepEqual(gate.reasons, [
    "可用条目 1 条，低于日报最低要求 5 条。",
    "引用 1 条，低于日报最低要求 3 条。",
    "独立来源 1 个，低于日报最低要求 2 个。",
    "类别 1 个，低于日报最低要求 2 个。"
  ]);
}

function testDailyFailureCopyAndResponseShape() {
  const preview = staleDailyPreview();
  const gate = reportQualityGateFromPreview(preview, evaluatedAt);
  const publicGate: ReportQualityGate = gate;
  const draft = buildDeterministicReportDraft(preview);

  assert.equal(gate.passed, false);
  assert.ok(qualityGateCaveats(gate).includes(DAILY_REPORT_INSUFFICIENT_DATA_MESSAGE));
  assert.equal(draft.status, "needs_review");
  assert.ok(draft.caveats.includes(DAILY_REPORT_INSUFFICIENT_DATA_MESSAGE));
  assert.ok(draft.markdown.includes(DAILY_REPORT_INSUFFICIENT_DATA_MESSAGE));
  assert.ok(draft.markdown.includes("证据窗口新鲜度: 未通过"));
  assert.deepEqual(Object.keys(publicGate).sort(), [
    "category_count",
    "category_gate_applicable",
    "citation_count",
    "distinct_source_count",
    "passed",
    "reasons",
    "report_type",
    "thresholds",
    "usable_item_count"
  ]);
  assert.deepEqual(Object.keys(gate.thresholds).sort(), [
    "categories",
    "citations",
    "distinct_sources",
    "usable_items"
  ]);
  assert.equal("evidence_freshness" in draft, false);
  assert.equal("evidence_window_end" in gate, false);
}

function testNormalizedGateFailsClosed() {
  const storedPassingGate = passingGate("daily", "2026-07-14T12:00:00.000Z");
  const missingPassed: Record<string, unknown> = { ...storedPassingGate };
  delete missingPassed.passed;
  const fallback = {
    ...passingMetrics("daily"),
    freshnessGateApplicable: false
  };
  const missingFlag = normalizeReportQualityGate(missingPassed, fallback);
  const missingGate = normalizeReportQualityGate(null, fallback);
  const overstated = normalizeReportQualityGate(
    {
      ...storedPassingGate,
      passed: true,
      reasons: [],
      usable_item_count: 1
    },
    fallback
  );

  assert.equal(missingFlag.passed, false);
  assert.match(missingFlag.reasons.join("\n"), /passed=true/);
  assert.equal(missingGate.passed, false);
  assert.match(missingGate.reasons.join("\n"), /元数据缺失/);
  assert.equal(overstated.passed, false);
  assert.match(overstated.reasons.join("\n"), /低于日报最低要求 5 条/);
}

function testCandidateGateRequiresExplicitPassFlags() {
  for (const reportType of ["daily", "weekly"] as const) {
    const valid = passingCandidateDraft(reportType);
    assert.equal(validateReportCandidateQualityGate(reportType, valid, evaluatedAt).passed, true);

    const missingDraftFlag = passingCandidateDraft(reportType);
    delete missingDraftFlag.quality_gate_passed;
    const draftFlagValidation = validateReportCandidateQualityGate(reportType, missingDraftFlag, evaluatedAt);

    const missingNestedFlag = passingCandidateDraft(reportType);
    delete (missingNestedFlag.quality_gate as Record<string, unknown>).passed;
    const nestedFlagValidation = validateReportCandidateQualityGate(reportType, missingNestedFlag, evaluatedAt);

    const failedFlags = passingCandidateDraft(reportType);
    failedFlags.quality_gate_passed = false;
    (failedFlags.quality_gate as Record<string, unknown>).passed = false;
    const failedFlagValidation = validateReportCandidateQualityGate(reportType, failedFlags, evaluatedAt);

    assert.equal(draftFlagValidation.passed, false);
    assert.match(draftFlagValidation.reasons.join("\n"), /quality_gate_passed must be explicitly true/);
    assert.equal(nestedFlagValidation.passed, false);
    assert.match(nestedFlagValidation.reasons.join("\n"), /quality_gate\.passed must be explicitly true/);
    assert.equal(failedFlagValidation.passed, false);
    assert.match(failedFlagValidation.reasons.join("\n"), /quality_gate_passed must be explicitly true/);
    assert.match(failedFlagValidation.reasons.join("\n"), /quality_gate\.passed must be explicitly true/);
  }
}

function testCandidateGateEnforcesCurrentThresholds() {
  for (const reportType of ["daily", "weekly"] as const) {
    const draft = passingCandidateDraft(reportType);
    const qualityGate = draft.quality_gate as Record<string, unknown>;
    draft.usable_item_count = 1;
    draft.citation_count = 1;
    draft.distinct_source_count = 1;
    draft.category_count = 1;
    draft.citations = [candidateCitation("only-citation")];
    qualityGate.usable_item_count = 1;
    qualityGate.citation_count = 1;
    qualityGate.distinct_source_count = 1;
    qualityGate.category_count = 1;
    qualityGate.passed = true;
    qualityGate.reasons = [];

    const validation = validateReportCandidateQualityGate(reportType, draft, evaluatedAt);

    assert.equal(validation.passed, false, `${reportType} candidates must meet the configured thresholds.`);
    assert.match(validation.reasons.join("\n"), /低于.+最低要求/);
  }
}

function testCandidateGateRejectsMalformedLegacyMetadata() {
  const legacy = validateReportCandidateQualityGate("daily", {}, evaluatedAt);
  const malformed = passingCandidateDraft("daily");
  malformed.usable_item_count = "5";
  const malformedValidation = validateReportCandidateQualityGate("daily", malformed, evaluatedAt);

  assert.equal(legacy.passed, false);
  assert.match(legacy.reasons.join("\n"), /quality_gate_passed must be explicitly true/);
  assert.equal(malformedValidation.passed, false);
  assert.match(malformedValidation.reasons.join("\n"), /usable_item_count must be a non-negative integer/);
}

function testCandidateGateRejectsCollectionTimeAsPublication() {
  const draft = passingCandidateDraft("daily");
  draft.citations = (draft.citations as Array<Record<string, unknown>>).map((citation) => {
    const withoutPublicationTime = { ...citation };
    delete withoutPublicationTime.published_at;
    return withoutPublicationTime;
  });

  const validation = validateReportCandidateQualityGate("daily", draft, evaluatedAt);

  assert.equal(validation.passed, false);
  assert.match(validation.reasons.join("\n"), /发布时间|证据时间戳|publication|新鲜度|fresh/i);
}

function passingGate(reportType: ReportPreviewType, evidenceTimestamp: string) {
  return evaluateReportQualityGate({
    ...passingMetrics(reportType),
    evaluatedAt,
    evidenceTimestamps: [evidenceTimestamp],
    evidenceWindowEnd: evidenceTimestamp,
    freshnessGateApplicable: true
  });
}

function passingMetrics(reportType: ReportPreviewType) {
  return reportType === "daily"
    ? {
        categoryCount: 2,
        categoryGateApplicable: true,
        citationCount: 3,
        distinctSourceCount: 2,
        reportType,
        usableItemCount: 5
      }
    : {
        categoryCount: 3,
        categoryGateApplicable: true,
        citationCount: 8,
        distinctSourceCount: 5,
        reportType,
        usableItemCount: 20
      };
}

function passingCandidateDraft(reportType: ReportPreviewType): Record<string, unknown> {
  const metrics = passingMetrics(reportType);
  const timestamp = "2026-07-14T12:00:00.000Z";
  const gate = evaluateReportQualityGate({
    ...metrics,
    evaluatedAt,
    evidenceTimestamps: [timestamp],
    evidenceWindowEnd: timestamp,
    freshnessGateApplicable: true
  });

  assert.equal(gate.passed, true);

  return {
    category_count: metrics.categoryCount,
    citation_count: metrics.citationCount,
    citations: Array.from({ length: metrics.citationCount }, (_, index) => candidateCitation(`citation-${index}`)),
    distinct_source_count: metrics.distinctSourceCount,
    quality_gate: gate,
    quality_gate_passed: true,
    quality_gate_reasons: [],
    report_type: reportType,
    time_window: {
      end: timestamp,
      start: reportType === "daily" ? "2026-07-13T12:00:00.000Z" : "2026-07-07T12:00:00.000Z"
    },
    usable_item_count: metrics.usableItemCount
  };
}

function candidateCitation(id: string) {
  return {
    collected_at: "2026-07-14T12:00:00.000Z",
    id,
    published_at: "2026-07-14T12:00:00.000Z",
    source_name: "测试来源"
  };
}

function staleDailyPreview(): ReportPreview {
  const timestamp = "2000-01-02T00:00:00.000Z";
  const items = Array.from({ length: 5 }, (_, index) => previewItem(index, timestamp));

  return {
    caveats: [],
    citations: items.slice(0, 3).map((item) => ({
      collected_at: item.timestamp,
      confidence: item.confidence,
      id: item.id,
      published_at: item.timestamp,
      source_name: item.source_name,
      status: item.status,
      title: item.title,
      url: item.url
    })),
    data_source: "supabase_radar_items",
    generated_at: timestamp,
    missing_evidence: [],
    report_type: "daily",
    retrieved_item_count: items.length,
    sections: [],
    summary: "用于验证陈旧快照门禁的日报预览。",
    time_window: {
      end: timestamp,
      explanation: "测试证据窗口。",
      matched_phrase: "日报预览",
      start: "2000-01-01T00:00:00.000Z"
    },
    title: "陈旧日报预览",
    top_items: items,
    usable_item_count: items.length
  };
}

function previewItem(index: number, timestamp: string): ReportPreviewItem {
  return {
    categories: [index % 2 === 0 ? "model_release" : "research"],
    confidence: 0.9,
    evidence_notes: ["公开来源证据。"],
    id: `item-${index}`,
    overall_score: 0.8,
    source_name: index % 2 === 0 ? "来源甲" : "来源乙",
    source_tier: "tier_1",
    status: "included",
    summary: `测试摘要 ${index}`,
    tags: [],
    timestamp,
    title: `测试条目 ${index}`,
    url: `https://example.com/item-${index}`
  };
}

main();

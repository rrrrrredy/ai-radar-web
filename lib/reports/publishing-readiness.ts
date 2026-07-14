import type { ReportWorkflowDocument } from "@/lib/reports/types";

export type ReportPublishingStage =
  | "draft"
  | "needs_review"
  | "approved_candidate"
  | "reviewed_report"
  | "published_report"
  | "blocked";

export type ReportPublishingReadiness = {
  actionLabel: string;
  isFormalPublicReport: boolean;
  isPublishableCandidate: boolean;
  reasons: string[];
  stage: ReportPublishingStage;
};

export function reportPublishingReadiness(report: ReportWorkflowDocument): ReportPublishingReadiness {
  const reasons = [
    ...report.quality_gate_reasons,
    ...report.missing_evidence.map((item) => `Missing evidence: ${item}`)
  ].filter(Boolean);
  const hasRequiredEvidence =
    report.quality_gate_passed &&
    report.usable_item_count > 0 &&
    report.citation_count > 0 &&
    report.distinct_source_count > 0;

  if (report.mode === "saved_report" && report.status === "published") {
    return {
      actionLabel: "Published on public reports surface",
      isFormalPublicReport: true,
      isPublishableCandidate: false,
      reasons: [],
      stage: "published_report"
    };
  }

  if (report.mode === "saved_report" && report.status === "reviewed") {
    return {
      actionLabel: "Reviewed report can be promoted when ready",
      isFormalPublicReport: true,
      isPublishableCandidate: false,
      reasons: [],
      stage: "reviewed_report"
    };
  }

  if (report.mode === "saved_candidate" && report.status === "approved" && hasRequiredEvidence) {
    return {
      actionLabel: "Ready for Save report or Publish report",
      isFormalPublicReport: false,
      isPublishableCandidate: true,
      reasons: [],
      stage: "approved_candidate"
    };
  }

  if (report.status === "draft") {
    return {
      actionLabel: "Needs review before publication",
      isFormalPublicReport: false,
      isPublishableCandidate: false,
      reasons: reasons.length > 0 ? reasons : ["Draft reports need admin review before they can become public reports."],
      stage: "draft"
    };
  }

  if (report.status === "needs_review") {
    return {
      actionLabel: "Needs admin review",
      isFormalPublicReport: false,
      isPublishableCandidate: false,
      reasons: reasons.length > 0 ? reasons : ["Candidate is still marked needs_review."],
      stage: "needs_review"
    };
  }

  return {
    actionLabel: "Not ready for public report",
    isFormalPublicReport: false,
    isPublishableCandidate: false,
    reasons: reasons.length > 0 ? reasons : ["Status or evidence gate does not allow publication."],
    stage: "blocked"
  };
}

export function summarizePublishingReadiness(reports: ReportWorkflowDocument[]) {
  const readiness = reports.map(reportPublishingReadiness);
  return {
    approvedCandidates: reports.filter((report) => report.mode === "saved_candidate" && report.status === "approved").length,
    blocked: readiness.filter((item) => item.stage === "blocked").length,
    drafts: readiness.filter((item) => item.stage === "draft").length,
    formalReports: readiness.filter((item) => item.isFormalPublicReport).length,
    needsReview: readiness.filter((item) => item.stage === "needs_review").length,
    publishableCandidates: readiness.filter((item) => item.isPublishableCandidate).length,
    publishedReports: readiness.filter((item) => item.stage === "published_report").length,
    reviewedReports: readiness.filter((item) => item.stage === "reviewed_report").length,
    total: readiness.length
  };
}

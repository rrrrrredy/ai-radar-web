type SourceRepairSignalLike = {
  evidence_notes?: readonly string[];
  id?: string;
  tags?: readonly string[];
  why_it_matters?: string;
};

export function isExternalSourceRepairSignal(item: SourceRepairSignalLike) {
  const id = item.id?.trim().toLowerCase() ?? "";
  if (id.startsWith("external:learnprompt:")) {
    return true;
  }

  const tags = (item.tags ?? []).map((tag) => tag.trim().toLowerCase());
  const notes = [
    item.why_it_matters ?? "",
    ...(item.evidence_notes ?? [])
  ].join(" ").toLowerCase();

  if (notes.includes("source_repair_only") || notes.includes("external_unreviewed")) {
    return true;
  }

  return tags.includes("learnprompt") && notes.includes("external public 24h ai signal");
}

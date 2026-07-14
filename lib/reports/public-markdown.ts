const publicMetadataLinePatterns = [
  /^-\s*(model|api calls|provider|prompt version|token usage|tokens|model metadata)\s*:/i,
  /^-\s*(模型|api 调用|供应商|提示词版本|token 用量|模型元数据)\s*[:：]/i,
  /^\s*["']?(model_metadata|api_call_count|provider|model|prompt_version|token_usage)["']?\s*:/i
];

export function publicReportMarkdown(markdown: string, fallback: string) {
  const stripped = stripPublicReportMarkdownMetadata(markdown);
  return stripped || stripPublicReportMarkdownMetadata(fallback) || fallback;
}

export function stripPublicReportMarkdownMetadata(markdown: string) {
  return markdown
    .split(/\r?\n/)
    .filter((line) => !isPublicMetadataLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isPublicMetadataLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  return publicMetadataLinePatterns.some((pattern) => pattern.test(trimmed));
}

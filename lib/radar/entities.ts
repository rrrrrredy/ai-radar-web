import type { RetrievalRadarItem } from "@/lib/retrieval/types";
import type { UnderstandingEntity, UnderstandingEntityType } from "@/lib/understanding/types";

type EntityPattern = {
  name: string;
  type: UnderstandingEntityType;
  pattern: RegExp;
};

const entityPatterns: EntityPattern[] = [
  { name: "OpenAI", type: "company", pattern: /\bopenai\b|\bchatgpt\b|\bgpt[-\s]?\d/i },
  { name: "Anthropic", type: "company", pattern: /\banthropic\b|\bclaude\b/i },
  { name: "Google", type: "company", pattern: /\bgoogle\b|\bdeepmind\b|\bgemini\b/i },
  { name: "Meta", type: "company", pattern: /\bmeta\b|\bllama\b/i },
  { name: "Microsoft", type: "company", pattern: /\bmicrosoft\b|\bcopilot\b/i },
  { name: "GitHub", type: "company", pattern: /\bgithub\b/i },
  { name: "DeepSeek", type: "company", pattern: /\bdeepseek\b/i },
  { name: "Qwen", type: "model", pattern: /\bqwen\b|\b通义千问\b/i },
  { name: "xAI", type: "company", pattern: /\bxai\b|\bgrok\b/i },
  { name: "Mistral AI", type: "company", pattern: /\bmistral\b/i },
  { name: "Hugging Face", type: "company", pattern: /\bhugging\s*face\b|\btransformers\b/i },
  { name: "NVIDIA", type: "company", pattern: /\bnvidia\b|\bcuda\b|\bblackwell\b/i },
  { name: "Perplexity", type: "company", pattern: /\bperplexity\b/i },
  { name: "Cohere", type: "company", pattern: /\bcohere\b/i },
  { name: "Cursor", type: "product", pattern: /\bcursor\b/i },
  { name: "Replit", type: "company", pattern: /\breplit\b/i },
  { name: "Vercel", type: "company", pattern: /\bvercel\b|\bnext\.?js\b/i },
  { name: "LangChain", type: "project", pattern: /\blangchain\b|\blanggraph\b/i },
  { name: "LlamaIndex", type: "project", pattern: /\bllamaindex\b/i },
  { name: "OpenRouter", type: "product", pattern: /\bopenrouter\b/i },
  { name: "Runway", type: "company", pattern: /\brunway\b/i },
  { name: "Midjourney", type: "product", pattern: /\bmidjourney\b/i },
  { name: "ElevenLabs", type: "company", pattern: /\belevenlabs\b/i }
];

export function entityCandidatesForItem(item: RetrievalRadarItem): UnderstandingEntity[] {
  if (item.entities.length > 0) {
    return dedupeEntities(item.entities);
  }

  const text = searchableEntityText(item);
  const candidates = entityPatterns
    .filter((candidate) => candidate.pattern.test(text))
    .map((candidate) => ({
      confidence: Math.min(Math.max(item.confidence, 0.35), 0.65),
      evidence_text: "Derived from public title, summary, tags, source name, or URL; verify before treating as canonical.",
      name: candidate.name,
      type: candidate.type
    }));

  if (candidates.length > 0) {
    return dedupeEntities(candidates);
  }

  const sourceName = item.source_name.trim();
  if (!sourceName) {
    return [];
  }

  return [
    {
      confidence: 0.35,
      evidence_text: "Source-level entity derived from public source metadata.",
      name: sourceName.slice(0, 80),
      type: sourceTypeFromItem(item)
    }
  ];
}

export function matchesEntityCandidate(item: RetrievalRadarItem, entityQuery: string) {
  const needle = entityQuery.toLowerCase();
  return entityCandidatesForItem(item).some((entity) =>
    `${entity.name} ${entity.type} ${entity.evidence_text ?? ""}`.toLowerCase().includes(needle)
  );
}

function searchableEntityText(item: RetrievalRadarItem) {
  return [
    item.title,
    item.summary_en,
    item.summary_zh,
    item.source_name,
    item.url,
    item.why_it_matters,
    ...item.categories,
    ...item.tags
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sourceTypeFromItem(item: RetrievalRadarItem): UnderstandingEntityType {
  const text = `${item.source_name} ${item.url}`.toLowerCase();
  if (text.includes("github")) {
    return "repository";
  }
  if (text.includes("arxiv") || text.includes("paper")) {
    return "paper";
  }
  if (text.includes("openai") || text.includes("anthropic") || text.includes("google") || text.includes("meta")) {
    return "company";
  }
  return "other";
}

function dedupeEntities(entities: UnderstandingEntity[]) {
  const seen = new Set<string>();
  const output: UnderstandingEntity[] = [];

  for (const entity of entities) {
    const name = entity.name.trim();
    if (!name) {
      continue;
    }

    const key = `${entity.type}:${name.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push({ ...entity, name });
  }

  return output;
}

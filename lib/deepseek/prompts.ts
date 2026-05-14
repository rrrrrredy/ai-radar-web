export const deepSeekPromptVersions = {
  classifyRadarItem: "classify-radar-item-v0",
  summarizeRadarItem: "summarize-radar-item-v0",
  extractEntities: "extract-entities-v0",
  scoreRadarItem: "score-radar-item-v0",
  transformRawItemToRadarItem: "transform-raw-item-to-radar-item-v0",
  generateDailyBrief: "generate-daily-brief-v0",
  answerRadarQuestion: "answer-radar-question-v0"
} as const;

export const radarSystemPromptBoundary = [
  "Use public information only.",
  "Separate facts, evidence-backed inference, and speculation.",
  "Prefer primary sources and official artifacts.",
  "Cite source URLs and timestamps when available.",
  "State uncertainty instead of inventing missing evidence."
];

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type PromptInput = {
  rawItem: {
    id: string;
    source_id: string;
    source_name: string;
    source_type: string;
    source_tier: string;
    title: string;
    url: string;
    canonical_url: string;
    published_at?: string;
    collected_at: string;
    language: string;
  };
  text: string;
  truncated: boolean;
  promptVersion: string;
};

export function buildClassificationMessages(input: PromptInput): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        ...radarSystemPromptBoundary,
        "Return strict JSON with ai_relevance_score, language, categories, tags, and confidence.",
        "Allowed categories: model_release, product_update, agent, research, open_source, infrastructure, funding, business, regulation, safety, benchmark, media_interview, opinion, other."
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Classify one raw ingestion item for AI Radar understanding.",
        prompt_version: input.promptVersion,
        truncated: input.truncated,
        raw_item: input.rawItem,
        text: input.text
      })
    }
  ];
}

export function buildSummaryMessages(input: PromptInput): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        ...radarSystemPromptBoundary,
        "Return strict JSON with summary_zh, summary_en, and evidence_notes.",
        "Do not translate beyond the evidence. If only metadata is available, say so."
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Summarize one raw ingestion item for AI Radar.",
        prompt_version: input.promptVersion,
        truncated: input.truncated,
        raw_item: input.rawItem,
        text: input.text
      })
    }
  ];
}

export function buildEntityMessages(input: PromptInput): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        ...radarSystemPromptBoundary,
        "Return strict JSON with entities array only.",
        "Entity type must be company, model, product, person, paper, project, repository, investor, regulator, or other.",
        "Each entity needs name, type, confidence, and optional evidence_text."
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Extract named entities from one raw ingestion item.",
        prompt_version: input.promptVersion,
        truncated: input.truncated,
        raw_item: input.rawItem,
        text: input.text
      })
    }
  ];
}

export function buildScoreMessages(input: PromptInput & Record<string, unknown>): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        ...radarSystemPromptBoundary,
        "Return strict JSON with importance_score, credibility_score, novelty_score, why_it_matters, and evidence_notes.",
        "Scores are hints only; code will apply the final formula and inclusion thresholds."
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Explain scoring signals for one AI Radar item.",
        prompt_version: input.promptVersion,
        truncated: input.truncated,
        raw_item: input.rawItem,
        classification: input.classification,
        summary: input.summary,
        entities: input.entities,
        text: input.text
      })
    }
  ];
}

export function buildTransformMessages(input: PromptInput): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        ...radarSystemPromptBoundary,
        "Return strict JSON with classification, summaries, entities, and score hints.",
        "The caller will validate output and decide final status with deterministic rules."
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Draft a structured understanding object for one raw ingestion item.",
        prompt_version: input.promptVersion,
        truncated: input.truncated,
        raw_item: input.rawItem,
        text: input.text
      })
    }
  ];
}

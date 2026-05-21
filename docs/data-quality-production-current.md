# Production Data Quality - Current

Updated: 2026-05-21

## Current Production Surface

- Production radar data source: `supabase_radar_items`.
- Total visible Supabase radar rows after refresh: 51.
- `/radar` usable item count: 51 visible items, with 49 `included`, 2 `needs_review`, 0 `excluded`, and 0 `failed`.
- `/reports` mode: saved Supabase report candidates.
- Daily report preview: 12 usable items, 8 citations, 0 missing-evidence gaps, `needs_review` candidate.
- Weekly report preview: 48 usable items, 12 citations, 0 missing-evidence gaps, `needs_review` candidate.

## Refresh Batch

- Successful live activation size: `--limit 20 --max-items-per-source 3`.
- Selected sources: OpenAI News; arXiv cs.AI, cs.CL, cs.CV, cs.LG; OpenAI Cookbook; Anthropic SDK Python; Hugging Face Transformers; OpenAI Python; Meta Llama Stack; Qwen3; DeepSeek V3; Hugging Face PEFT; Microsoft AutoGen; Microsoft Semantic Kernel; Mistral Inference; PyTorch; vLLM; llama.cpp; Ollama.
- Raw items collected: 15.
- Radar items generated: 15, all `included`.
- DeepSeek understanding calls: 60.
- Main refresh sources: OpenAI News 3, arXiv cs.AI 3, arXiv cs.CL 3, arXiv cs.CV 3, arXiv cs.LG 3.
- Refresh categories: research 13, benchmark 3, product_update 2, agent 1.

## Production Mix

- Top visible categories: research 35, product_update 7, agent 7, other 5, benchmark 4, open_source 4, media_interview 3, safety 2.
- Source diversity is usable but uneven: arXiv and OpenAI dominate the current production set.
- Main visible sources: arXiv cs.CV 9, arXiv cs.CL 9, OpenAI News 8, arXiv cs.LG 7, arXiv cs.AI 6, Lex Fridman 3.
- Current daily and weekly previews are useful for internal review, especially for research, OpenAI, and benchmark signals. They are not yet complete market coverage.

## Failed Or Noisy Sources

- GitHub-backed source reads hit HTTP 403 rate limits during refresh, affecting OpenAI Cookbook, Anthropic SDK Python, Hugging Face Transformers, OpenAI Python, Meta Llama Stack, Qwen3, DeepSeek V3, Hugging Face PEFT, Microsoft AutoGen, Microsoft Semantic Kernel, Mistral Inference, PyTorch, vLLM, llama.cpp, and Ollama.
- arXiv cs.LG returned a feed truncated to the configured byte limit, but still produced usable items.

## Remaining Gaps

- Source diversity: add more non-arXiv, non-OpenAI official sources before relying on this for broad weekly coverage.
- Official model/product release coverage: current product coverage exists but is too concentrated; more official Anthropic, Google, Meta, DeepSeek, Qwen, Mistral, and ecosystem release feeds are needed.
- GitHub rate limits: repository-backed sources need authenticated or cached retrieval before they are dependable.
- `other` category: 5 visible rows still need better classification or source normalization.
- X and WeChat: keep them as future/manual paths only; no automatic crawl was run for this refresh.

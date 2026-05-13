# DeepSeek Integration

## Purpose

DeepSeek is planned for low-cost AI processing and higher-quality synthesis. The project should still keep business logic, source attribution, and safety rules outside the model.

## Model Split

- DeepSeek V4 Flash: filtering, summarization, tagging, language detection, classification, and duplicate hints.
- DeepSeek V4 Pro: scoring, report generation, Q&A, and writing assistant synthesis.

## Environment Variables

Use `.env.example` as the variable contract:

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_FAST_MODEL`
- `DEEPSEEK_SMART_MODEL`

## Safety Requirements

- Do not send private credentials, cookies, browser profiles, or internal URLs to model APIs.
- Log provider, model, purpose, token usage, status, and prompt version.
- Store source links and timestamps alongside generated text.


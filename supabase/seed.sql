insert into sources (
  id,
  slug,
  name,
  url,
  type,
  source_tier,
  language,
  region,
  topics,
  status,
  weight,
  risk_notes,
  last_checked_at
) values
(
  '00000000-0000-4000-8000-000000000001',
  'demo-official-lab',
  'Demo Official Lab',
  'https://example.com/ai-radar/demo-official-lab',
  'official_blog',
  1,
  'en',
  'global',
  array['models', 'research'],
  'active',
  0.920,
  'Synthetic Phase 2 source used only for UI and schema testing.',
  '2026-05-12T22:30:00Z'
),
(
  '00000000-0000-4000-8000-000000000002',
  'demo-builder-notes',
  'Demo Builder Notes',
  'https://example.com/ai-radar/demo-builder-notes',
  'product_builder',
  2,
  'en',
  'global',
  array['agents', 'products'],
  'monitor',
  0.640,
  'Synthetic non-primary source. Use for interface placeholders only.',
  '2026-05-12T20:15:00Z'
) on conflict (id) do nothing;

insert into raw_items (
  id,
  source_id,
  external_id,
  url,
  canonical_url,
  title,
  author,
  published_at,
  retrieved_at,
  raw_text,
  raw_metadata,
  hash,
  language
) values
(
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000001',
  'demo-model-release',
  'https://example.com/ai-radar/demo-official-lab/model-release',
  'https://example.com/ai-radar/demo-official-lab/model-release',
  'Example AI model release',
  'Demo Author',
  '2026-05-12T08:00:00Z',
  '2026-05-12T08:10:00Z',
  'Synthetic public demo text for Phase 2.',
  '{"demo": true}'::jsonb,
  'demo-hash-model-release',
  'en'
),
(
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000002',
  'demo-agent-product',
  'https://example.com/ai-radar/demo-builder-notes/agent-product',
  'https://example.com/ai-radar/demo-builder-notes/agent-product',
  'Example agent product update',
  'Demo Builder',
  '2026-05-12T09:30:00Z',
  '2026-05-12T09:45:00Z',
  'Synthetic public demo text for Phase 2.',
  '{"demo": true}'::jsonb,
  'demo-hash-agent-product',
  'en'
) on conflict (id) do nothing;

insert into radar_items (
  id,
  raw_item_id,
  title,
  summary_zh,
  summary_en,
  topics,
  status,
  credibility_score,
  novelty_score,
  importance_score
) values
(
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101',
  'Example AI model release',
  '合成示例：用于展示模型发布条目的双语摘要和评分字段。',
  'Synthetic example used to display bilingual summary and scoring fields for a model release.',
  array['models', 'research'],
  'published',
  0.9000,
  0.7200,
  0.7800
),
(
  '00000000-0000-4000-8000-000000000202',
  '00000000-0000-4000-8000-000000000102',
  'Example agent product update',
  '合成示例：用于展示代理产品更新和产品信号。',
  'Synthetic example used to display an agent product update and product signal.',
  array['agents', 'products'],
  'reviewed',
  0.6400,
  0.6800,
  0.6100
) on conflict (id) do nothing;

insert into event_clusters (
  id,
  title_zh,
  title_en,
  summary_zh,
  summary_en,
  status,
  confidence,
  importance_score,
  first_seen_at
) values
(
  '00000000-0000-4000-8000-000000000301',
  '示例模型发布事件',
  'Example model release event',
  '合成示例：按真实世界事件聚合证据。',
  'Synthetic example: group evidence by real-world event.',
  'published',
  'high',
  0.7900,
  '2026-05-12T08:00:00Z'
) on conflict (id) do nothing;

insert into event_cluster_items (
  event_cluster_id,
  radar_item_id,
  role
) values
(
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000201',
  'primary'
) on conflict (event_cluster_id, radar_item_id) do nothing;

insert into entities (
  id,
  type,
  name,
  aliases,
  description,
  homepage_url,
  metadata
) values
(
  '00000000-0000-4000-8000-000000000401',
  'company',
  'Example AI Lab',
  array['Demo Lab'],
  'Synthetic organization used to exercise entity UI states.',
  'https://example.com/ai-radar/entities/example-ai-lab',
  '{"demo": true}'::jsonb
),
(
  '00000000-0000-4000-8000-000000000402',
  'model',
  'Example Model V',
  array['Example V'],
  'Synthetic model entity for radar linking and report placeholders.',
  'https://example.com/ai-radar/entities/example-model-v',
  '{"demo": true}'::jsonb
) on conflict (id) do nothing;

insert into item_entities (
  radar_item_id,
  entity_id,
  relationship,
  confidence
) values
(
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000401',
  'announced_by',
  0.9500
),
(
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000402',
  'mentions_model',
  0.9200
) on conflict (radar_item_id, entity_id, relationship) do nothing;

insert into ingestion_runs (
  id,
  started_at,
  finished_at,
  status,
  trigger,
  source_count,
  raw_item_count,
  radar_item_count,
  error_count,
  metadata
) values
(
  '00000000-0000-4000-8000-000000000501',
  '2026-05-12T20:00:00Z',
  '2026-05-12T20:03:00Z',
  'succeeded',
  'scheduled',
  2,
  2,
  2,
  0,
  '{"demo": true}'::jsonb
) on conflict (id) do nothing;

insert into system_settings (
  key,
  value,
  description
) values
(
  'phase',
  '{"name": "phase-2-app-skeleton"}'::jsonb,
  'Current implementation phase marker.'
),
(
  'feature_flags',
  '{"ENABLE_X_API": false, "ENABLE_WECHAT_AUTH": false}'::jsonb,
  'Non-secret feature flag defaults.'
) on conflict (key) do nothing;

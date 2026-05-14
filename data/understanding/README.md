# Local Understanding Outputs

Phase 5 writes local DeepSeek understanding artifacts here.

- `latest/radar-items.json` contains the most recent structured radar items.
- `latest/understanding-run.json` contains the most recent understanding run summary.
- `runs/*.json` contains timestamped local snapshots for debugging.

Generated JSON files are ignored by git. Keep only this README and `.gitkeep` files tracked unless a future task intentionally adds tiny synthetic fixtures.

Default mock mode does not call DeepSeek and does not require Supabase credentials:

```bash
npm run understand:items:mock
npm run understand:items -- --input data/ingestion/latest/raw-items.json --limit 5 --mode mock
```

Live mode is opt-in and requires a local `DEEPSEEK_API_KEY`:

```bash
npm run understand:items:live -- --limit 3
```

The understanding layer validates raw items, truncates long text, classifies AI relevance and categories, builds bilingual summaries, extracts entities, computes rule-controlled scores, and writes failed records when validation cannot produce a safe radar item. It does not insert into Supabase and does not generate daily or weekly reports.

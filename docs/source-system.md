# Source System

The source system manages public information sources and their trust characteristics.

## Source Categories

Sources are categorized using `data/seed/source-taxonomy.json`. Categories include official company channels, research labs, arXiv, GitHub, Hugging Face, AI media, tech media, newsletters, podcasts, YouTube, X accounts, investors, researchers, builders, journalists, rumors or leaks, and manual imports.

## Source Fields

Each source should track name, URL, category, language, region, topics, status, weight, and risk notes.

## Source Rules

- Prefer official and primary sources.
- Keep rumor or leak sources low weight and clearly marked.
- Reject private intranet URLs and credentialed sources.
- Store only public URLs in seed data.
- Track source health separately from source trust.


export default function AskPage() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold text-radar-ink">Ask Radar</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Web Q&A will retrieve Radar database evidence first. DeepSeek V4 Pro will
          be used for answer generation in a future phase, with source citations and
          explicit uncertainty. No model calls are made in Phase 2.
        </p>
      </section>

      <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
        <label className="block">
          <span className="text-sm font-semibold text-radar-ink">Question</span>
          <textarea
            className="mt-3 min-h-36 w-full rounded-md border border-radar-line px-3 py-3 text-sm leading-6 text-radar-ink"
            placeholder="Example: Which demo AI model events look important today?"
          />
        </label>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-radar-muted">
            Future answers should cite sources, state time windows, and separate facts
            from inference.
          </p>
          <button
            className="rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white opacity-70"
            disabled
            type="button"
          >
            Phase 2 placeholder
          </button>
        </div>
      </section>
    </div>
  );
}

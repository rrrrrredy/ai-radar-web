import { mockEntities } from "@/lib/radar/mock-data";

export default function EntitiesPage() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold text-radar-ink">Entities</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Entity pages will track companies, people, models, products, papers, and
          projects with aliases, source links, related clusters, and score movement.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {mockEntities.map((entity) => (
          <article className="rounded-lg border border-radar-line bg-white p-5 shadow-soft" key={entity.id}>
            <span className="rounded-md bg-radar-panel px-2 py-1 text-xs font-medium text-radar-muted">
              {entity.type}
            </span>
            <h2 className="mt-4 text-lg font-semibold text-radar-ink">{entity.name}</h2>
            <p className="mt-3 text-sm leading-6 text-radar-muted">{entity.description}</p>
            <p className="mt-4 text-xs text-radar-muted">
              Aliases: {entity.aliases.length ? entity.aliases.join(", ") : "None"}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}

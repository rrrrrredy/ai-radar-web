export function EmptyState({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-radar-line bg-radar-panel p-8 text-center">
      <h2 className="text-lg font-semibold text-radar-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-radar-muted">
        {description}
      </p>
    </div>
  );
}

import Link from "next/link";

export function AdminSection({
  href,
  title,
  description,
  metric
}: {
  href: string;
  title: string;
  description: string;
  metric: string;
}) {
  return (
    <Link
      className="block rounded-lg border border-radar-line bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-radar-cyan"
      href={href}
    >
      <p className="text-sm font-medium text-radar-muted">{metric}</p>
      <h2 className="mt-3 text-xl font-semibold text-radar-ink">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-radar-muted">{description}</p>
    </Link>
  );
}

import type { ReactNode } from "react";

const toneClasses = {
  neutral: "border-radar-line bg-white",
  evidence: "border-radar-evidence/30 bg-white",
  inference: "border-radar-freshness/30 bg-white",
  caution: "border-radar-caution/30 bg-radar-caution/5"
};

export function AnswerSection({
  children,
  description,
  title,
  tone = "neutral"
}: {
  children: ReactNode;
  description?: string;
  title: string;
  tone?: keyof typeof toneClasses;
}) {
  return (
    <section className={`rounded-lg border p-5 shadow-soft ${toneClasses[tone]}`}>
      <div className="max-w-3xl">
        <h2 className="text-lg font-semibold text-radar-ink">{title}</h2>
        {description ? (
          <p className="mt-2 text-sm leading-6 text-radar-muted">{description}</p>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

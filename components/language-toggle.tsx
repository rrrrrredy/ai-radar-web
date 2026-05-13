const options = ["EN", "中", "Bi"];

export function LanguageToggle() {
  return (
    <div
      aria-label="Language display mode"
      className="inline-flex rounded-md border border-radar-line bg-white p-1 text-xs font-medium text-radar-muted"
    >
      {options.map((option) => (
        <span
          className="rounded px-2 py-1 first:bg-radar-ink first:text-white"
          key={option}
        >
          {option}
        </span>
      ))}
    </div>
  );
}

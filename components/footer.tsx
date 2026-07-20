export function Footer() {
  return (
    <footer className="border-t border-radar-line bg-radar-panel/70">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 text-sm text-radar-muted sm:px-6 lg:px-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p className="font-medium text-radar-ink">
            AI 行业雷达 <span className="text-radar-muted">·</span> Created by Song Luo
          </p>
          <p>© 2026 Song Luo</p>
        </div>
        <p className="max-w-4xl leading-6">
          仅基于公开信息。来源、引用、新鲜度和不确定性是产品界面的一部分。
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-4">
          <a
            className="font-medium text-radar-cyan hover:text-radar-ink"
            href="mailto:luosongred@gmail.com"
          >
            Email: luosongred@gmail.com
          </a>
          <a
            className="font-medium text-radar-cyan hover:text-radar-ink"
            href="https://github.com/rrrrrredy"
            rel="noreferrer"
            target="_blank"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}

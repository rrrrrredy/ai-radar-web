import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const textExtensions = new Set([
  ".css",
  ".env",
  ".example",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml"
]);

const textBasenames = new Set([".env", ".env.example", ".env.local.example", ".gitignore", "README", "LICENSE"]);
const ignoredTrackedFiles = new Set(["scripts/sensitive-scan.ts"]);

const forbiddenPatterns: Array<{ label: string; pattern: RegExp }> = [
  { label: "DeepSeek/OpenAI-style API key", pattern: /(^|[^A-Za-z0-9_-])sk-(?:proj-)?[A-Za-z0-9_-]{20,}/i },
  { label: "Anthropic API key", pattern: /(^|[^A-Za-z0-9_-])sk-ant-api\d{2}-[A-Za-z0-9_-]{20,}/i },
  { label: "GitHub token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/ },
  { label: "GitHub fine-grained token", pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/i },
  { label: "Bearer token", pattern: /(^|[^A-Za-z])Bearer\s+(?!<[^>\s]+>)(?!\$\{?[A-Z0-9_]+\}?)(?!redacted\b)(?!token\b)[A-Za-z0-9._~+/=-]{8,}/i },
  { label: "Cookie header", pattern: /\bCookie:\s*[^;\n]+=[^;\n]+/i },
  { label: "Set-Cookie header", pattern: /\bSet-Cookie:\s*[^;\n]+=[^;\n]+/i },
  { label: "document.cookie assignment", pattern: /document\.cookie\s*=/i },
  { label: "Forbidden internal domain", pattern: /km\.sankuai\.com/i },
  { label: "Forbidden internal keyword", pattern: /\bsankuai\b/i },
  { label: "Forbidden internal keyword", pattern: /\bmeituan\b/i },
  { label: "Forbidden internal URL", pattern: /https?:\/\/[^/\s]*meituan[^/\s]*/i },
  { label: "Forbidden content query", pattern: /contentType=1/i },
  { label: "Forbidden attachment URL", pattern: /api\/file\/cdn/i },
  { label: "Forbidden image artifact", pattern: /image\.jpeg/i },
  {
    label: "Private browser profile path",
    pattern: /(AppData\\Local\\(?:Google\\Chrome|Microsoft\\Edge)\\User Data|Library\/Application Support\/(?:Google\/Chrome|Microsoft Edge)|\.config\/(?:google-chrome|chromium))/i
  }
];

const secretEnvNames = new Set([
  "DEEPSEEK_API_KEY",
  "GITHUB_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "X_BEARER_TOKEN",
  "WECHAT_APP_SECRET"
]);

type Finding = {
  file: string;
  line: number;
  label: string;
};

function shouldScan(filePath: string) {
  const relativePath = repoPath(filePath);

  if (ignoredTrackedFiles.has(relativePath)) {
    return false;
  }

  const extension = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);

  return textExtensions.has(extension) || textBasenames.has(basename) || basename.startsWith(".env");
}

function trackedFiles() {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  return output
    .split("\0")
    .filter(Boolean)
    .map((file) => path.join(root, file))
    .filter((file) => fs.existsSync(file) && shouldScan(file));
}

function checkEnvLine(line: string) {
  const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);

  if (!match) {
    return null;
  }

  const [, name, rawValue] = match;
  const value = stripInlineComment(rawValue).trim();

  if (!value || isPlaceholderValue(value)) {
    return null;
  }

  if (secretEnvNames.has(name)) {
    return `${name} is filled`;
  }

  return null;
}

function scanFile(filePath: string): Finding[] {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const findings: Finding[] = [];
  const relative = repoPath(filePath);

  lines.forEach((line, index) => {
    const envFinding = checkEnvLine(line);

    if (envFinding) {
      findings.push({
        file: relative,
        line: index + 1,
        label: envFinding
      });
    }

    for (const forbidden of forbiddenPatterns) {
      if (forbidden.pattern.test(line)) {
        findings.push({
          file: relative,
          line: index + 1,
          label: forbidden.label
        });
      }
    }
  });

  return findings;
}

function main() {
  const files = trackedFiles();
  const findings = files.flatMap(scanFile);

  if (findings.length > 0) {
    console.error("Sensitive scan failed:");
    for (const finding of findings) {
      console.error(`- ${finding.file}:${finding.line} ${finding.label}`);
    }
    process.exit(1);
  }

  console.log(`Sensitive scan passed across ${files.length} text files.`);
}

function repoPath(filePath: string) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function stripInlineComment(value: string) {
  return value.replace(/\s+#.*$/, "");
}

function isPlaceholderValue(value: string) {
  const normalized = value.trim().replace(/^['"]|['"]$/g, "").trim();
  const lower = normalized.toLowerCase();

  return (
    !normalized ||
    lower === "redacted" ||
    lower === "placeholder" ||
    lower === "changeme" ||
    lower === "change-me" ||
    lower === "your-key-here" ||
    lower === "your_key_here" ||
    (lower.startsWith("<") && lower.endsWith(">")) ||
    (lower.startsWith("${") && lower.endsWith("}"))
  );
}

main();

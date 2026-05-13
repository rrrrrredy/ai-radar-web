import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const ignoredDirectories = new Set([
  ".git",
  ".next",
  "node_modules",
  "out",
  "dist",
  "build",
  "coverage",
  "cache",
  "exports"
]);

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

const forbiddenPatterns: Array<{ label: string; pattern: RegExp }> = [
  { label: "API key pattern", pattern: /(^|[^A-Za-z0-9_])(?:sk|pk|rk)-[A-Za-z0-9]{20,}/ },
  { label: "Bearer token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i },
  { label: "Cookie header", pattern: /\bCookie:\s*[^;\n]+=[^;\n]+/i },
  { label: "document.cookie assignment", pattern: /document\.cookie\s*=/i },
  { label: "Forbidden internal domain", pattern: /km\.sankuai\.com/i },
  { label: "Forbidden internal keyword", pattern: /\bsankuai\b/i },
  { label: "Forbidden internal URL", pattern: /https?:\/\/[^/\s]*meituan[^/\s]*/i },
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
  const relativePath = path.relative(root, filePath);

  if (relativePath === path.join("scripts", "sensitive-scan.ts")) {
    return false;
  }

  const extension = path.extname(filePath);
  const basename = path.basename(filePath);

  return textExtensions.has(extension) || basename === ".env.example" || basename.startsWith(".env");
}

function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (entry.isFile() && shouldScan(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

function checkEnvLine(line: string) {
  const match = line.match(/^([A-Z0-9_]+)=(.+)$/);

  if (!match) {
    return null;
  }

  const [, name, rawValue] = match;
  const value = rawValue.trim();

  if (!value || value.startsWith("#")) {
    return null;
  }

  if (secretEnvNames.has(name)) {
    return "Secret environment value is filled";
  }

  return null;
}

function scanFile(filePath: string): Finding[] {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const findings: Finding[] = [];
  const relative = path.relative(root, filePath);

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
  const files = walk(root);
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

main();

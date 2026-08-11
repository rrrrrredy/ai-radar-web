import fs from "node:fs";
import path from "node:path";

type ModelListResponse = {
  data?: Array<{ id?: unknown }>;
};

function localEnv() {
  const filePath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/u)
      .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/u))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => [match[1], match[2].trim()])
  );
}

async function main() {
  const env = { ...localEnv(), ...process.env };
  const apiKey = env.DEEPSEEK_API_KEY?.trim();
  const baseUrl = (env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com").replace(/\/+$/u, "");
  const requiredModels = [
    env.DEEPSEEK_FAST_MODEL?.trim() || "deepseek-v4-flash",
    env.DEEPSEEK_SMART_MODEL?.trim() || "deepseek-v4-pro"
  ];
  if (!apiKey) throw new Error("DeepSeek credential preflight failed: DEEPSEEK_API_KEY is missing.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/models`, {
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
      signal: controller.signal
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "request timed out" : "request failed";
    throw new Error(`DeepSeek credential preflight failed: ${reason}.`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`DeepSeek credential preflight failed: HTTP ${response.status}.`);
  }
  const payload = await response.json() as ModelListResponse;
  const availableModels = new Set(
    (payload.data ?? []).map((entry) => entry.id).filter((value): value is string => typeof value === "string")
  );
  const missingModels = requiredModels.filter((model) => !availableModels.has(model));
  if (missingModels.length > 0) {
    throw new Error(`DeepSeek credential preflight failed: configured model unavailable (${missingModels.join(", ")}).`);
  }
  console.log(JSON.stringify({
    ok: true,
    host: new URL(baseUrl).host,
    models: requiredModels
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "DeepSeek credential preflight failed.");
  process.exit(1);
});

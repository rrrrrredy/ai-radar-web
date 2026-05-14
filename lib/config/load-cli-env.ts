import { loadEnvConfig } from "@next/env";

const silentLog = {
  info: () => undefined,
  error: () => undefined
};

let loaded = false;

export function loadCliEnv(projectDir = process.cwd()) {
  if (loaded) {
    return;
  }

  loadEnvConfig(projectDir, process.env.NODE_ENV !== "production", silentLog);
  loaded = true;
}

loadCliEnv();

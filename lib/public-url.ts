const privateHostFragments = ["localhost", "intranet", "internal"];
const sensitiveQueryParamNames = new Set([
  "access_token",
  "apikey",
  "api_key",
  "auth",
  "awsaccesskeyid",
  "code",
  "credential",
  "credentials",
  "expires",
  "jwt",
  "key",
  "password",
  "secret",
  "session",
  "sig",
  "signature",
  "token"
]);
const sensitiveQueryParamFragments = [
  "credential",
  "secret",
  "session",
  "signature",
  "signed",
  "token"
];

export function publicInternetHttpUrl(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }

    if (parsed.username || parsed.password) {
      return "";
    }

    if (!isPublicInternetHostname(parsed.hostname)) {
      return "";
    }

    if (hasSensitiveQueryParameter(parsed)) {
      return "";
    }

    return parsed.toString();
  } catch {
    return "";
  }
}

export function isPublicInternetHttpUrl(value: unknown) {
  return publicInternetHttpUrl(value) !== "";
}

function isPublicInternetHostname(value: string) {
  const hostname = value.toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.+$/, "");

  if (!hostname) {
    return false;
  }

  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    return false;
  }

  if (privateHostFragments.some((fragment) => hostname.includes(fragment))) {
    return false;
  }

  if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) {
    return false;
  }

  return hostname.includes(".");
}

function hasSensitiveQueryParameter(url: URL) {
  for (const key of url.searchParams.keys()) {
    const normalizedKey = key.toLowerCase();
    if (
      sensitiveQueryParamNames.has(normalizedKey) ||
      normalizedKey.startsWith("x-amz-") ||
      sensitiveQueryParamFragments.some((fragment) => normalizedKey.includes(fragment))
    ) {
      return true;
    }
  }

  return false;
}

function isPrivateIpv4(hostname: string) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
    return false;
  }

  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (parts[2] === 0 || parts[2] === 2)) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && parts[2] === 100) ||
    (a === 203 && b === 0 && parts[2] === 113)
  );
}

function isPrivateIpv6(hostname: string) {
  const normalized = hostname.toLowerCase();
  if (!normalized.includes(":")) {
    return false;
  }

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

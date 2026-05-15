export function sanitizeNextPath(next: string | null | undefined, fallback = "/") {
  const safeFallback = isSafeRelativePath(fallback) ? fallback : "/";
  const candidate = next?.trim();

  if (!candidate || !isSafeRelativePath(candidate)) {
    return safeFallback;
  }

  try {
    const parsed = new URL(candidate, "https://ai-radar.local");

    if (parsed.origin !== "https://ai-radar.local") {
      return safeFallback;
    }

    const sanitized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return isSafeRelativePath(sanitized) ? sanitized : safeFallback;
  } catch {
    return safeFallback;
  }
}

export function loginPathForNext(next: string | null | undefined) {
  const params = new URLSearchParams({
    next: sanitizeNextPath(next)
  });

  return `/auth/login?${params.toString()}`;
}

function isSafeRelativePath(value: string) {
  return (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.includes("\n") &&
    !value.includes("\r")
  );
}

export function safeAuthReturnTo(value: unknown, origin: string): string | undefined {
  if (typeof value !== "string" || !value || value.length > 2048 || /[\\\u0000-\u0020\u007f]/.test(value) || value.startsWith("//")) return undefined;
  if (!value.startsWith("/") && !/^https?:\/\//i.test(value)) return undefined;
  try {
    const url = new URL(value, origin);
    if (url.origin !== new URL(origin).origin || url.username || url.password || url.pathname.startsWith("//") || url.pathname.startsWith("/api/")) return undefined;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return undefined; }
}

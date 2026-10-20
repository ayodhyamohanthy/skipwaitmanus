import type { Request } from "express";

export type RequestOriginSource = Pick<Request, "protocol" | "get">;

/**
 * Canonical public origin for links that leave the app (email review links,
 * share cards). `PUBLIC_BASE_URL` is the deploy's declared origin; the request
 * origin is a local-development fallback only, never the production source.
 */
export function publicOrigin(
  req: RequestOriginSource,
  configured: string | undefined = process.env.PUBLIC_BASE_URL,
): string {
  const fromEnv = (configured ?? "").trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  return `${req.protocol}://${req.get("host")}`;
}

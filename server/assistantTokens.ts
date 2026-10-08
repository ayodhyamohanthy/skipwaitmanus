import { createHash, randomBytes } from "node:crypto";

/**
 * Assistant and API tokens. Only the SHA-256 hash is stored (assistantTokens.tokenHash).
 * The clear token is shown once, at creation. The prefix is kept so the user
 * can tell tokens apart in the list without the secret.
 */
export type AssistantTokenKind = "api" | "access" | "refresh";

const KIND_PREFIX: Record<AssistantTokenKind, string> = { api: "swk_", access: "swa_", refresh: "swr_" };

export function hashAssistantToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateAssistantToken(kind: AssistantTokenKind): { token: string; tokenHash: string; prefix: string } {
  const token = `${KIND_PREFIX[kind]}${randomBytes(32).toString("base64url")}`;
  return { token, tokenHash: hashAssistantToken(token), prefix: token.slice(0, 10) };
}

/** Cheap shape check before any database lookup. */
export function looksLikeAssistantToken(value: unknown): value is string {
  return typeof value === "string" && /^sw[kar]_[A-Za-z0-9_-]{43}$/.test(value);
}

export function tokenKindFromValue(value: string): AssistantTokenKind | null {
  if (value.startsWith("swk_")) return "api";
  if (value.startsWith("swa_")) return "access";
  if (value.startsWith("swr_")) return "refresh";
  return null;
}

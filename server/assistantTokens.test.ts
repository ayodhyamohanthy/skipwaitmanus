import { describe, expect, it } from "vitest";
import { generateAssistantToken, hashAssistantToken, looksLikeAssistantToken, tokenKindFromValue } from "./assistantTokens";

describe("assistant tokens", () => {
  it("generates a unique token per call and stores only its hash", () => {
    const a = generateAssistantToken("api");
    const b = generateAssistantToken("api");
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).toBe(hashAssistantToken(a.token));
    expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.tokenHash).not.toContain(a.token);
    expect(a.prefix).toBe(a.token.slice(0, 10));
    expect(a.token.startsWith("swk_")).toBe(true);
  });

  it("marks each kind with its own prefix and recognises it", () => {
    for (const [kind, prefix] of [["api", "swk_"], ["access", "swa_"], ["refresh", "swr_"]] as const) {
      const { token } = generateAssistantToken(kind);
      expect(token.startsWith(prefix)).toBe(true);
      expect(looksLikeAssistantToken(token)).toBe(true);
      expect(tokenKindFromValue(token)).toBe(kind);
    }
  });

  it("rejects malformed values before any lookup", () => {
    expect(looksLikeAssistantToken("")).toBe(false);
    expect(looksLikeAssistantToken("swk_short")).toBe(false);
    expect(looksLikeAssistantToken(undefined)).toBe(false);
    expect(looksLikeAssistantToken(`swk_${"a".repeat(43)}x`)).toBe(false);
    expect(tokenKindFromValue("nope")).toBeNull();
  });
});

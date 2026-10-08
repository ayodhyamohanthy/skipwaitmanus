import { describe, expect, it } from "vitest";
import { isWellFormedShareToken, onRequest } from "../functions/share-card/[token]";

const run = (token: string) => (onRequest as unknown as (c: unknown) => Promise<Response>)({
  params: { token },
  next: async () => new Response("<html>app</html>", { status: 200, headers: { "content-type": "text/html" } }),
});

describe("share-card Pages function", () => {
  it("accepts API-shaped tokens", () => {
    expect(isWellFormedShareToken("abcdefgh-12345678")).toBe(true);
    expect(isWellFormedShareToken("bogus")).toBe(false);
    expect(isWellFormedShareToken("x".repeat(65))).toBe(false);
  });
  it("404s a malformed token but keeps the app body", async () => {
    const res = await run("bogus");
    expect(res.status).toBe(404);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(await res.text()).toContain("app");
  });
  it("passes a well-formed token through", async () => {
    expect((await run("abcdefgh-12345678")).status).toBe(200);
  });
});

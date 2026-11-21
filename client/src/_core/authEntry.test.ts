import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("ordinary WorkOS auth entry", () => {
  it("navigates directly to the on-site sign-in page without SDK PKCE", () => {
    const source = readFileSync("client/src/_core/auth.tsx", "utf8");
    const block = source.slice(source.indexOf("const openSignIn"), source.indexOf("// Publish the SDK access token"));
    expect(block).toContain("signInPagePath");
    expect(block).toContain("window.location.href");
    expect(block).not.toContain("/api/auth/workos/sign-in");
    expect(block).not.toContain("auth.signIn");
    // Preserve the explicit-click behavior while auth is loading (the server owns authentication).
    expect(block).not.toMatch(/if\s*\(\s*!isLoaded\s*\)/);
  });
});

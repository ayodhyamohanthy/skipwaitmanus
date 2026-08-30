import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const app = readFileSync(fileURLToPath(new URL("./App.tsx", import.meta.url)), "utf8");

describe("app session continuity", () => {
  it("uses the provider auth state for the global PWA session marker without triggering the retired tRPC auth refresh", () => {
    expect(app).toContain('function PwaSessionContinuity(){');
    expect(app).toContain('markSecureSessionVerified()');
    expect(app).not.toContain('registerSecureSessionRestoration');
    expect(app).not.toContain('const { isAuthenticated, refresh }=useAuth()');
  });
});

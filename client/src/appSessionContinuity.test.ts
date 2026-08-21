import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const app = readFileSync(fileURLToPath(new URL("./App.tsx", import.meta.url)), "utf8");

describe("app session continuity", () => {
  it("uses Clerk state for the global PWA session marker without triggering the retired tRPC auth refresh", () => {
    expect(app).toContain('function PwaSessionContinuity(){const {isLoaded,isSignedIn}=useClerkAuth()');
    expect(app).toContain('if(isLoaded&&isSignedIn)markSecureSessionVerified()');
    expect(app).not.toContain('registerSecureSessionRestoration');
    expect(app).not.toContain('const { isAuthenticated, refresh }=useAuth()');
  });
});

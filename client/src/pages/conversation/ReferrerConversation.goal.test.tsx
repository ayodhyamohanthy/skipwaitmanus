import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const entry = readFileSync(new URL("../ReferralConversation.tsx", import.meta.url), "utf8");

describe("released conversation retirement (D-048-K-conversation)", () => {
  it("renders only the released conversation pages, without an old/new design switch", () => {
    expect(entry).not.toMatch(/goalSurfaceOn|@\/lib\/goalSurfaces/);
    expect(entry).toContain("<SeekerConversation");
    expect(entry).toContain("<ReferrerConversation");
  });

  it("cannot reach the retired referrer body or its kit frame from the route entry", () => {
    expect(entry).not.toMatch(/components\/kit|ThreadMain|ReferrerPanel|components\/AppShell/);
  });
});

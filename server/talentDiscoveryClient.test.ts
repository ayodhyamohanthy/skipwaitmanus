import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("talent discovery client privacy", () => {
  it("keys and calls every talent action by displayRef, never userId or undefined", () => {
    const source = readFileSync(new URL("../client/src/pages/TalentDiscovery.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("userId");
    expect(source).not.toContain("row.userId");
    expect(source).toContain("encodeURIComponent(row.displayRef)");
    expect(source).toContain("/intro");
    expect(source).not.toContain("${row.displayRef}/unlock");
  });
});

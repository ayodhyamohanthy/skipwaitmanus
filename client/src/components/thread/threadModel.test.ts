import { describe, expect, it } from "vitest";

import { referrerPendingCopy } from "./threadModel";
describe("referrerPendingCopy", () => {
  it("prefixes the real expiry and keeps the reassurance", () => {
    const now = Date.parse("2026-10-15T00:00:00Z");
    const fresh = new Date(now - 3600_000).toISOString();
    expect(referrerPendingCopy({ createdAt: fresh }, now)).toMatch(/^Expires (today|tomorrow|in \d+ days)\. No reply needed to pass — but a quick answer helps\.$/);
    expect(referrerPendingCopy({ createdAt: "not a date" }, now)).toBe("No reply needed to pass — but a quick answer helps.");
  });
});

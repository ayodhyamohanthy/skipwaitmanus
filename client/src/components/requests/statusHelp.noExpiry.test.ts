import { describe, expect, it, vi } from "vitest";

// D-174/D-379 (3): with the ask clocks off the waiting help drops the 90-day close. The switch-off
// body stays pinned byte-for-byte in statusHelp.test.ts.
vi.mock("@shared/askNoExpiry", async importOriginal => ({
  ...await importOriginal<typeof import("@shared/askNoExpiry")>(),
  ASK_NO_EXPIRY_ENABLED: true,
}));

import { STATUS_HELP } from "./statusHelp";

describe("D-174: the waiting help with the ask clocks off", () => {
  it("drops the 90-day close and keeps the rest of the sentence", () => {
    const body = STATUS_HELP["waiting:waiting_for_coverage"].body;
    expect(body).toBe("No verified employee at this company can see it yet. It stays private while it waits; when one joins, the oldest waiting requests reach them first.");
    expect(body).not.toContain("90 days");
  });
});

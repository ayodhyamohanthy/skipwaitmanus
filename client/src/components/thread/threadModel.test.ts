import { describe, expect, it } from "vitest";

import { referrerPendingCopy, seekerWaitingCopy } from "./threadModel";
describe("referrerPendingCopy", () => {
  it("prefixes the real expiry and keeps the reassurance", () => {
    const now = Date.parse("2026-10-15T00:00:00Z");
    const fresh = new Date(now - 3600_000).toISOString();
    expect(referrerPendingCopy({ createdAt: fresh }, now)).toMatch(/^Expires (today|tomorrow|in \d+ days)\. No reply needed to pass — but a quick answer helps\.$/);
    expect(referrerPendingCopy({ createdAt: "not a date" }, now)).toBe("No reply needed to pass — but a quick answer helps.");
  });
});

describe("seekerWaitingCopy", () => {
  const now = Date.parse("2026-10-18T12:00:00Z");
  const base = { companyDomain: "acme.com", companyName: "Acme", companyInitials: "A", createdAt: new Date(now - 2 * 86_400_000).toISOString() };

  it("tells a personal-link ask its employee has not acted on who has it and when it expires (D-050)", () => {
    expect(seekerWaitingCopy({ ...base, referrerId: 77, heldForReferrer: true }, now)).toBe("Sent privately to the Acme employee whose link you used. Expires in 5 days if they don't respond. Your credit comes back, unless its month or plan has ended by then.");
    expect(seekerWaitingCopy({ ...base, referrerId: 77, heldForReferrer: true, createdAt: "not a date" }, now)).toBe("Sent privately to the Acme employee whose link you used.");
  });

  it("keeps the claimed and the open-to-the-company lines", () => {
    expect(seekerWaitingCopy({ ...base, referrerId: 77 }, now)).toBe("A verified Acme employee is reviewing your request. We'll notify you the moment it's accepted.");
    expect(seekerWaitingCopy({ ...base, referrerId: null }, now)).toBe("Waiting for a verified Acme referrer. Expires in 5 days if nobody accepts. Your credit comes back, unless its month or plan has ended by then.");
  });

  it("states the coverage wait and the held-for-credit next step (D-034/D-047)", () => {
    expect(seekerWaitingCopy({ ...base, referrerId: null, queueStatus: "waiting_for_coverage" }, now)).toBe("No verified Acme employee is available yet. Your ask waits at no cost, and when one can see it, 1 credit is used — we'll notify you.");
    expect(seekerWaitingCopy({ ...base, referrerId: null, queueStatus: "held_for_credit" }, now)).toBe("A verified Acme employee can see asks now. Add a credit to send yours.");
  });
});

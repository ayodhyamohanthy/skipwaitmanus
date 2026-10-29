import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { CREDIT_ENDED_CAVEAT } from "@shared/moneyCopy";
import { canMessage, referrerPendingCopy, seekerWaitingCopy } from "./threadModel";
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

// F5 (packet item 1): the refund caveat is `shared/moneyCopy.ts`'s, never retyped
// here. The model composes its waiting copy from the shared constant, and the
// source carries no copy of the literal that could drift from it.
describe("threadModel never retypes a shared money line (D-180 / packet item 1)", () => {
  const now = Date.parse("2026-10-18T12:00:00Z");
  const base = { companyDomain: "acme.com", companyName: "Acme", companyInitials: "A", createdAt: new Date(now - 2 * 86_400_000).toISOString() };

  it("builds the waiting refund caveat from CREDIT_ENDED_CAVEAT", () => {
    expect(seekerWaitingCopy({ ...base, referrerId: null }, now)).toBe(`Waiting for a verified Acme referrer. Expires in 5 days if nobody accepts. Your credit comes back, ${CREDIT_ENDED_CAVEAT}.`);
    expect(seekerWaitingCopy({ ...base, referrerId: 77, heldForReferrer: true }, now)).toBe(`Sent privately to the Acme employee whose link you used. Expires in 5 days if they don't respond. Your credit comes back, ${CREDIT_ENDED_CAVEAT}.`);
  });

  it("holds no copy of the caveat literal in its own source", () => {
    const source = readFileSync(path.resolve(__dirname, "threadModel.ts"), "utf8");
    expect(source).toContain("CREDIT_ENDED_CAVEAT");
    expect(source).not.toContain(CREDIT_ENDED_CAVEAT);
  });
});

// F7 (packet item 3): the message box is gated by the model, not only by the
// component's prop, so a pending seeker is denied a composer by the page.
describe("canMessage keeps a pending seeker out of the thread (D-019(e))", () => {
  it("refuses the composer to a pending seeker, however the ask was routed", () => {
    expect(canMessage("seeker", { status: "pending", referrerId: null })).toBe(false);
    expect(canMessage("seeker", { status: "pending", referrerId: 77 })).toBe(false);
    expect(canMessage("referrer-pending", { status: "pending", referrerId: 77 })).toBe(false);
  });

  it("opens the composer only once a referrer has accepted", () => {
    expect(canMessage("seeker", { status: "approved", referrerId: 77 })).toBe(true);
    expect(canMessage("seeker", { status: "intro_made", referrerId: 77 })).toBe(true);
    expect(canMessage("seeker", { status: "approved", referrerId: null })).toBe(false);
  });
});

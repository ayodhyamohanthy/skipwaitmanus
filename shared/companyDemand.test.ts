// D-086 demand list: the pure contract. Counts are distinct canonical people
// over live requests, k-anonymous from 3 up, and the liveness predicate is the
// runtime's own isAskExpired (imported, never re-implemented).
import { afterEach, describe, expect, it, vi } from "vitest";
import type { isAskExpired } from "./referral";

// The clock-removal proof needs isAskExpired stubbed to "never expires". The
// mock delegates to the real predicate everywhere else, so every other test
// exercises the shipped rule.
const real = vi.hoisted(() => ({ isAskExpired: null as null | typeof isAskExpired }));
vi.mock("./referral", async importOriginal => {
  const actual = await importOriginal<typeof import("./referral")>();
  real.isAskExpired = actual.isAskExpired;
  return { ...actual, isAskExpired: vi.fn(actual.isAskExpired) };
});

import { isAskExpired } from "./referral";
import {
  DEMAND_PUBLIC_MIN,
  DEMAND_UNLISTED_EMPLOYEE_LINE,
  DEMAND_UNLISTED_SEEKER_LINE,
  UNLISTED_DEMAND_MAX_ROWS,
  companyDemandDetailResponseSchema,
  companyDemandListResponseSchema,
  countDemandPeople,
  countUnlistedDemand,
  demandBonusLine,
  demandCountLine,
  demandFewLine,
  demandHelpLine,
  demandLine,
  isLiveDemandRow,
  orderDemandList,
  publicDemandSchema,
  toPublicDemand,
  unlistedDemandAdminResponseSchema,
  type DemandCompany,
  type DemandRow,
} from "./companyDemand";

const isAskExpiredMock = vi.mocked(isAskExpired);
afterEach(() => {
  isAskExpiredMock.mockReset();
  if (real.isAskExpired) isAskExpiredMock.mockImplementation(real.isAskExpired);
});

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-02T00:00:00Z");

/** A live pending request at acme.com by person 1. */
function row(over: Partial<DemandRow> = {}): DemandRow {
  return {
    company: "acme.com",
    userId: 1,
    canonicalPersonId: null,
    role: "user",
    userSuspended: false,
    personSuspended: null,
    status: "pending",
    referrerId: null,
    createdAt: new Date(NOW - DAY),
    coverageVisibleAt: null,
    waitingForCoverage: false,
    ...over,
  };
}

const acme: DemandCompany = { slug: "acme", name: "Acme", domains: ["acme.com", "acme.io"] };
const globex: DemandCompany = { slug: "globex", name: "Globex", domains: ["globex.com"] };
const operator: DemandCompany = { slug: "skipwait", name: "SkipWait", domains: ["skipwait.me"] };
const directory: DemandCompany[] = [acme, globex, operator];

const peopleAt = (rows: readonly DemandRow[], slug: string, nowMs = NOW) =>
  countDemandPeople(rows, directory, nowMs).find(entry => entry.slug === slug)?.people ?? 0;

describe("toPublicDemand", () => {
  it.each([
    [0, { state: "none" }],
    [1, { state: "few" }],
    [2, { state: "few" }],
    [3, { state: "count", people: 3 }],
    [20, { state: "count", people: 20 }],
    [Number.NaN, { state: "none" }],
    [-1, { state: "none" }],
  ])("maps %s", (people, expected) => {
    expect(toPublicDemand(people)).toEqual(expected);
  });

  it("never publishes a number below the k-anonymity floor", () => {
    for (let people = -3; people < DEMAND_PUBLIC_MIN; people += 1) {
      expect(publicDemandSchema.parse(toPublicDemand(people)).state).not.toBe("count");
    }
  });
});

describe("countDemandPeople", () => {
  it("counts one person with two live requests at a company once", () => {
    expect(peopleAt([row(), row({ company: "acme.io" })], "acme")).toBe(1);
  });

  it("counts two aliases of one canonical person once", () => {
    expect(peopleAt([row({ userId: 1, canonicalPersonId: 7 }), row({ userId: 2, canonicalPersonId: 7 })], "acme")).toBe(1);
  });

  it("counts two domains of one company once", () => {
    expect(peopleAt([row({ company: "acme.com", userId: 1 }), row({ company: "acme.io", userId: 1 })], "acme")).toBe(1);
  });

  it("counts one person at two companies once at each", () => {
    const rows = [row({ company: "acme.com", userId: 4 }), row({ company: "globex.com", userId: 4 })];
    expect(peopleAt(rows, "acme")).toBe(1);
    expect(peopleAt(rows, "globex")).toBe(1);
  });

  it.each(["approved", "declined", "intro_made", "interview", "offer", "closed", "withdrawn"] as const)("counts nothing for a %s request", status => {
    expect(peopleAt([row({ status })], "acme")).toBe(0);
  });

  it("counts nothing for a suspended user, a suspended person, an admin, an unlisted domain or the operator company", () => {
    expect(peopleAt([row({ userSuspended: true })], "acme")).toBe(0);
    expect(peopleAt([row({ canonicalPersonId: 9, personSuspended: true })], "acme")).toBe(0);
    expect(peopleAt([row({ role: "admin" })], "acme")).toBe(0);
    expect(peopleAt([row({ company: "unlisted.example" })], "acme")).toBe(0);
    expect(peopleAt([row({ company: "skipwait.me" })], "skipwait")).toBe(0);
  });

  it("counts a waiting, a held, a delivered and a claimed pending request", () => {
    const rows = [
      row({ userId: 1, waitingForCoverage: true, coverageVisibleAt: null }),
      // Held: coverage opened, so the ask is no longer waiting; nothing about a
      // credit hold makes it not a person asking.
      row({ userId: 2, waitingForCoverage: false, coverageVisibleAt: new Date(NOW - 2 * DAY) }),
      row({ userId: 3, waitingForCoverage: false, coverageVisibleAt: new Date(NOW - 2 * DAY) }),
      row({ userId: 4, referrerId: 77 }),
    ];
    expect(peopleAt(rows, "acme")).toBe(4);
  });

  it("returns every listed company, including the ones at zero", () => {
    expect(countDemandPeople([row()], directory, NOW).map(entry => entry.slug)).toEqual(["acme", "globex", "skipwait"]);
  });

  describe("liveness is the runtime's own predicate (F2)", () => {
    it("counts a waiting request created 40 days earlier", () => {
      expect(peopleAt([row({ waitingForCoverage: true, createdAt: new Date(NOW - 40 * DAY) })], "acme")).toBe(1);
    });

    it("drops a waiting request past the 90-day shelf life and a visible one past 7 days", () => {
      const longWaiting = row({ waitingForCoverage: true, createdAt: new Date(NOW - 91 * DAY) });
      const longVisible = row({ waitingForCoverage: false, coverageVisibleAt: new Date(NOW - 8 * DAY) });
      expect(isAskExpired(longWaiting, NOW)).toBe(true);
      expect(isAskExpired(longVisible, NOW)).toBe(true);
      expect(peopleAt([longWaiting], "acme")).toBe(0);
      expect(peopleAt([longVisible], "acme")).toBe(0);
    });

    it("counts both once the clocks are removed, so the count has no age rule of its own", () => {
      const longWaiting = row({ waitingForCoverage: true, createdAt: new Date(NOW - 91 * DAY) });
      const longVisible = row({ waitingForCoverage: false, coverageVisibleAt: new Date(NOW - 8 * DAY) });
      isAskExpiredMock.mockReturnValue(false);
      expect(peopleAt([longWaiting], "acme")).toBe(1);
      expect(peopleAt([longVisible], "acme")).toBe(1);
    });

    it("counts a request awaiting reconfirm: reconfirm gates the spend, not liveness", () => {
      // D-174-held-ask-reconfirm asks a waiting request older than 30 days for a
      // one-tap reconfirm before its credit is spent. It stays pending and inside
      // the runtime's own shelf life, so it keeps counting: the count neither
      // freezes nor expires at the reconfirm threshold.
      const awaitingReconfirm = { ...row({ waitingForCoverage: true, createdAt: new Date(NOW - 40 * DAY) }), reconfirmRequestedAt: new Date(NOW - 2 * DAY) };
      expect(isAskExpired(awaitingReconfirm, NOW)).toBe(false);
      expect(peopleAt([awaitingReconfirm], "acme")).toBe(1);
    });

    it("agrees with isAskExpired at every age boundary", () => {
      for (const days of [0, 1, 6, 7, 8, 40, 89, 90, 91, 400]) {
        for (const waitingForCoverage of [true, false]) {
          const candidate = row({ waitingForCoverage, createdAt: new Date(NOW - days * DAY), coverageVisibleAt: waitingForCoverage ? null : new Date(NOW - days * DAY) });
          const expected = isAskExpired(candidate, NOW) ? 0 : 1;
          expect(peopleAt([candidate], "acme"), `waiting=${waitingForCoverage} days=${days}`).toBe(expected);
        }
      }
    });
  });
});

describe("isLiveDemandRow", () => {
  it("is true only for a pending request the runtime has not ended", () => {
    expect(isLiveDemandRow(row(), NOW)).toBe(true);
    expect(isLiveDemandRow(row({ status: "withdrawn" }), NOW)).toBe(false);
    expect(isLiveDemandRow(row({ waitingForCoverage: true, createdAt: new Date(NOW - 91 * DAY) }), NOW)).toBe(false);
  });
});

describe("orderDemandList", () => {
  it("orders counts by people then name, and every few by name alone", () => {
    const items = orderDemandList([
      { slug: "b", name: "Beta", people: 1 },
      { slug: "a", name: "Alpha", people: 2 },
      { slug: "z", name: "Zeta", people: 20 },
      { slug: "m", name: "Mu", people: 3 },
      { slug: "n", name: "None", people: 0 },
    ]);
    expect(items.map(item => [item.slug, item.demand.state])).toEqual([
      ["z", "count"],
      ["m", "count"],
      ["a", "few"],
      ["b", "few"],
    ]);
  });

  it("cannot reveal one person from two: both are the same state in name order", () => {
    const items = orderDemandList([{ slug: "a", name: "Alpha", people: 2 }, { slug: "b", name: "Beta", people: 1 }]);
    expect(items).toEqual([{ slug: "a", name: "Alpha", demand: { state: "few" } }, { slug: "b", name: "Beta", demand: { state: "few" } }]);
  });
});

describe("countUnlistedDemand", () => {
  it("lists only live corporate domains no company owns, by distinct people", () => {
    const rows = [
      row({ company: "unlisted.example", userId: 1 }),
      row({ company: "unlisted.example", userId: 2 }),
      row({ company: "unlisted.example", userId: 2 }),
      row({ company: "gmail.com", userId: 3 }),
      row({ company: "acme.com", userId: 4 }),
      row({ company: "skipwait.me", userId: 5 }),
      row({ company: "unlisted.example", userId: 6, status: "declined" }),
    ];
    expect(countUnlistedDemand(rows, ["acme.com", "skipwait.me"], NOW)).toEqual([{ domain: "unlisted.example", people: 2 }]);
  });

  it("excludes a hidden company's domain too, because a company owns it", () => {
    expect(countUnlistedDemand([row({ company: "hidden.example" })], ["hidden.example"], NOW)).toEqual([]);
  });

  it("is capped at the maximum number of rows, keeping the busiest domains", () => {
    const rows: DemandRow[] = [];
    for (let index = 0; index < 205; index += 1) rows.push(row({ company: `quiet-${index}.example`, userId: 1000 + index }));
    for (let index = 0; index < 5; index += 1) {
      rows.push(row({ company: `busy-${index}.example`, userId: 2000 + index }));
      rows.push(row({ company: `busy-${index}.example`, userId: 3000 + index }));
    }
    const listed = countUnlistedDemand(rows, [], NOW);
    expect(listed).toHaveLength(UNLISTED_DEMAND_MAX_ROWS);
    expect(listed.slice(0, 5).every(entry => entry.domain.startsWith("busy-") && entry.people === 2)).toBe(true);
  });
});

describe("schemas", () => {
  it("reject unknown keys, a few carrying a number, a count below the floor and any total", () => {
    expect(publicDemandSchema.safeParse({ state: "count", people: 5, total: 9 }).success).toBe(false);
    expect(publicDemandSchema.safeParse({ state: "few", people: 2 }).success).toBe(false);
    expect(publicDemandSchema.safeParse({ state: "count", people: 2 }).success).toBe(false);
    expect(companyDemandListResponseSchema.safeParse({ companies: [], total: 3 }).success).toBe(false);
    expect(companyDemandListResponseSchema.safeParse({ companies: [{ slug: "acme", name: "Acme", demand: { state: "few" } }] }).success).toBe(true);
    expect(companyDemandDetailResponseSchema.safeParse({ demand: { state: "none" } }).success).toBe(true);
    expect(unlistedDemandAdminResponseSchema.safeParse({ domains: [{ domain: "unlisted.example", people: 2 }] }).success).toBe(true);
    expect(unlistedDemandAdminResponseSchema.safeParse({ domains: [{ domain: "unlisted.example", people: 2, ids: [1] }] }).success).toBe(false);
  });
});

describe("copy", () => {
  it("states a count, a few, and nothing at none", () => {
    expect(demandCountLine("Acme", 20)).toBe("20 people are asking for a referral at Acme.");
    expect(demandFewLine("Acme")).toBe("A few people are asking for a referral at Acme.");
    expect(demandLine({ state: "none" }, "Acme")).toBeNull();
    expect(demandLine({ state: "count", people: 3 }, "Acme")).toBe("3 people are asking for a referral at Acme.");
  });

  it("invites employees to verify and never promises a payout", () => {
    expect(demandHelpLine("Acme")).toBe("Work at Acme? Verify your work email to help.");
    expect(demandBonusLine("Acme")).toBe("If Acme pays employees a referral bonus, Acme sets and pays it under its own rules. skipwait.me never pays referrers.");
    expect(demandBonusLine("Acme")).not.toMatch(/\d|[$₹€£]|guarantee/i);
  });

  it("says what the list covers and what an unlisted company can do", () => {
    expect(DEMAND_UNLISTED_SEEKER_LINE).toBe("Your company isn't listed? Request a referral with a job link from its careers site.");
    expect(DEMAND_UNLISTED_EMPLOYEE_LINE).toBe("Work at a company that isn't listed? Verify your work email to help people asking there.");
  });

  it("uses referral words only: no credit, no noun ask, no availability framing", () => {
    const lines = [demandCountLine("Acme", 20), demandFewLine("Acme"), demandHelpLine("Acme"), demandBonusLine("Acme"), DEMAND_UNLISTED_SEEKER_LINE, DEMAND_UNLISTED_EMPLOYEE_LINE];
    for (const line of lines) {
      expect(line).not.toMatch(/credit/i);
      expect(line).not.toMatch(/\b(an?|the|my|your) ask\b/i);
      expect(line).not.toMatch(/waiting|not open|open to/i);
    }
  });
});

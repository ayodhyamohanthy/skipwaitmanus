import { describe, expect, it } from "vitest";
import {
  DEMO, freeWallet, identityProblem, ledgerEntries, ledgerFor, moneyProblems,
  privacyProblems, revealProblems, trpcJson, walletTotal,
} from "./liveQaJourneyContracts.mjs";

interface LedgerRow {
  id: number;
  kind: string;
  credits: number;
  bucket: string | null;
  reference: { type: string; id: string } | null;
  createdAt: string;
}
const debit = (overrides: Partial<LedgerRow> = {}): LedgerRow => ({
  id: 1, kind: "credit_spend", credits: -1, bucket: "cycle",
  reference: { type: "referral_request", id: "71#1" }, createdAt: "2026-11-25T12:00:00.000Z", ...overrides,
});
const refund = (overrides: Partial<LedgerRow> = {}): LedgerRow => debit({
  id: 2, kind: "withdrawal_refund", credits: 1,
  reference: { type: "referral_request", id: "71#refund#1" }, ...overrides,
});
const checkMoney = (entries: LedgerRow[], returned = false) => moneyProblems({
  requestId: 71, entries, expect: { spend: true, refund: returned },
});
const freeSummary = {
  plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: 2,
  purchasedCreditsRemaining: 0, promoCreditsRemaining: 0, totalAvailable: 2, ledger: { balance: 2 },
};
const wallet = (overrides: Partial<typeof freeSummary> = {}) => ({ summary: { ...freeSummary, ...overrides } });
const locked = { mimeType: "image/png", fileSize: 70, availability: "after_claim" };
const open = { id: 501, fileName: "qa-demo-resume.png", url: "/api/documents/501" };

describe("journey response projections", () => {
  it("reads tRPC plain, superjson and batch envelopes without inventing values", () => {
    const value = { email: DEMO.seeker };
    expect(trpcJson({ result: { data: value } })).toEqual(value);
    expect(trpcJson({ result: { data: { json: value } } })).toEqual(value);
    expect(trpcJson([{ result: { data: { json: value } } }])).toEqual(value);
    expect(trpcJson({ result: { data: 0 } })).toBe(0);
    for (const body of [null, [], {}, "bad", { result: null }]) expect(trpcJson(body)).toBeNull();
  });

  it("keeps the numeric wallet-total compatibility helper", () => {
    expect(walletTotal(wallet())).toBe(2);
    expect(walletTotal(wallet({ totalAvailable: 0 }))).toBe(0);
    for (const body of [null, {}, { summary: { totalAvailable: "2" } }, wallet({ totalAvailable: -1 }), wallet({ totalAvailable: 0.5 })]) {
      expect(walletTotal(body)).toBeNull();
    }
  });

  it("accepts only consistent calendar free allowance while ignoring unused envelope fields", () => {
    expect(freeWallet({ ...wallet(), extra: true })).toEqual({ total: 2, free: 2 });
    expect(freeWallet(wallet({ monthlyCreditsRemaining: 0, totalAvailable: 0, ledger: { balance: 0 } }))).toEqual({ total: 0, free: 0 });
    expect(freeWallet(wallet({ monthlyCreditsRemaining: 3, totalAvailable: 3, ledger: { balance: 3 } }))).toEqual({ total: 3, free: 3 });
  });

  it.each([
    { plan: "start" }, { monthlyAllowance: 4 }, { purchasedCreditsRemaining: 1 }, { promoCreditsRemaining: 1 },
    { monthlyCreditsRemaining: 0, purchasedCreditsRemaining: 2 }, { monthlyCreditsRemaining: 1 },
    { ledger: { balance: 1 } }, { monthlyCreditsRemaining: 4, totalAvailable: 4, ledger: { balance: 4 } },
    { monthlyCreditsRemaining: -1 }, { monthlyCreditsRemaining: 0.5 }, { totalAvailable: Number.NaN },
  ])("rejects a wallet that can spend another source or has inconsistent counts: %j", overrides => {
    expect(freeWallet(wallet(overrides))).toBeNull();
  });

  it.each([null, [], {}, { summary: null }, { summary: [] }, { summary: { totalAvailable: 2 } }].map(body => [body] as const))("rejects malformed free-wallet response %j", body => {
    expect(freeWallet(body)).toBeNull();
  });

  it("parses the public ledger including zero refunds and unrelated legitimate kinds", () => {
    const entries = [debit(), refund({ credits: 0 }), debit({ id: 3, kind: "purchase", credits: 10, bucket: "purchased", reference: null })];
    expect(ledgerEntries({ entries, nextCursor: null })).toEqual(entries);
    expect(ledgerEntries({ entries: [] })).toEqual([]);
  });

  it.each([
    null, [], {}, { entries: null }, { entries: {} }, { entries: [null] },
    { entries: [{ ...debit(), credits: "-1" }] }, { entries: [{ ...debit(), credits: -0.5 }] },
    { entries: [{ ...debit(), kind: null }] }, { entries: [{ ...debit(), bucket: 1 }] },
    { entries: [{ ...debit(), reference: { type: "referral_request", id: 71 } }] },
    { entries: [{ ...debit(), createdAt: "bad" }] }, { entries: [{ ...debit(), id: 0 }] },
    { entries: [{ kind: "credit_spend", credits: -1 }] },
  ].map(body => [body] as const))("rejects malformed ledger response %j", body => {
    expect(ledgerEntries(body)).toBeNull();
  });
});

describe("per-request sandbox money proof", () => {
  it("finds keyed debit/refund legs without matching adjacent request ids or reference types", () => {
    const entries = [debit(), refund(), debit({ id: 3, reference: { type: "referral_request", id: "710#1" } }), debit({ id: 4, reference: { type: "payment", id: "71#1" } })];
    expect(ledgerFor(entries, 71)).toEqual({ spend: [entries[0]], refund: [entries[1]] });
    expect(ledgerFor(entries, "71")).toEqual(ledgerFor(entries, 71));
    expect(ledgerFor(entries, 7)).toEqual({ spend: [], refund: [] });
  });

  it("keeps zero and malformed-value legs visible by kind", () => {
    const zero = refund({ credits: 0 });
    const malformed = { ...debit(), credits: "bad" };
    expect(ledgerFor([zero, malformed], 71)).toEqual({ spend: [malformed], refund: [zero] });
  });

  it.each([null, {}, "bad", [null, false, 2, "row", {}]].map(entries => [entries] as const))("handles malformed ledger selection %j", entries => {
    expect(ledgerFor(entries, 71)).toEqual({ spend: [], refund: [] });
  });

  it("proves the one cycle spend, pre-pickup refund and retained employee-decline charge", () => {
    expect(checkMoney([debit(), refund()], true)).toEqual([]);
    expect(checkMoney([debit()])).toEqual([]);
    expect(checkMoney([debit(), debit({ id: 3, kind: "plan_grant", credits: 3, reference: null })])).toEqual([]);
  });

  it("does not assume an aggregate delta across unledgered sandbox top-ups", () => {
    expect(moneyProblems({ requestId: 71, entries: [debit()], before: 1, after: 2, expect: { spend: true, refund: false } })).toEqual([]);
    expect(moneyProblems({ requestId: 71, entries: [debit(), refund()], before: 2, after: 3, expect: { spend: true, refund: true } })).toEqual([]);
  });

  it("honors an explicitly requested legacy wallet delta only", () => {
    expect(moneyProblems({ requestId: 71, entries: [debit()], before: 3, after: 2, expect: { spend: true, refund: false, walletDelta: -1 } })).toEqual([]);
    expect(moneyProblems({ requestId: 71, entries: [debit()], before: 3, after: 3, expect: { spend: true, refund: false, walletDelta: -1 } })).not.toEqual([]);
  });

  it.each([
    [], [refund()], [debit(), debit({ id: 3 })], [debit(), refund(), refund({ id: 3 })],
    [debit({ credits: -2 }), refund()], [debit({ credits: 0 }), refund()],
    [debit({ bucket: "purchased" }), refund()], [debit(), refund({ bucket: "promo" })],
    [debit(), refund({ credits: 0 })], [debit(), refund({ credits: 2 })], [debit(), refund({ credits: -1 })],
    [debit(), debit({ id: 3, credits: 0, bucket: "promo", reference: { type: "referral_request", id: "71#2" } }), refund()],
    [debit({ kind: "direct_request" }), refund()], [debit(), refund({ kind: "expiry_refund" })],
    [debit({ reference: { type: "referral_request", id: "71#2" } }), refund()],
    [debit(), refund({ reference: { type: "referral_request", id: "71#refund#2" } })],
  ].map(entries => [entries] as const))("rejects missing, duplicate, extra or incorrect ledger legs %j", entries => {
    expect(checkMoney(entries, true)).not.toEqual([]);
  });

  it.each([0, 1, -1])("rejects every refund after a decline or claimed-then-passed request, including %s", credits => {
    expect(checkMoney([debit(), refund({ credits })])).not.toEqual([]);
  });

  it.each([null, {}, [null], [{ ...debit(), credits: "bad" }], [{ ...debit(), bucket: 1 }]].map(entries => [entries] as const))("reports malformed ledger rather than throwing %j", entries => {
    expect(moneyProblems({ requestId: 71, entries, expect: { spend: true, refund: false } })).not.toEqual([]);
  });

  it("rejects invalid request identifiers and missing expectations", () => {
    for (const requestId of [null, "", 0, -1, {}, "71#1"]) {
      expect(moneyProblems({ requestId, entries: [debit()], expect: { spend: true, refund: false } })).not.toEqual([]);
    }
    expect(moneyProblems({ requestId: 71, entries: [debit()] })).not.toEqual([]);
  });
});

describe("privacy and accepted-file proof", () => {
  it("permits locked metadata before acceptance and an open name/file after acceptance", () => {
    expect(privacyProblems({ request: { attachments: [locked] } })).toEqual([]);
    expect(privacyProblems({ request: { attachments: [] } })).toEqual([]);
    expect(revealProblems({ request: { candidateName: "Demo seeker", attachments: [open] } })).toEqual([]);
  });

  it("rejects a candidateName field even when empty or null", () => {
    for (const candidateName of ["Demo seeker", "", null]) {
      expect(privacyProblems({ request: { candidateName, attachments: [] } })).toContain("the preview names the seeker");
    }
  });

  it.each([{ id: 501 }, { fileName: "resume.png" }, { url: null }])("rejects exposed attachment fields %j", exposed => {
    expect(privacyProblems({ request: { attachments: [{ ...locked, ...exposed }] } })).toContain("the preview opens a file");
  });

  it.each([null, [], {}, { request: null }, { request: [] }, { request: "bad" }, { request: {} }, { request: { attachments: {} } }, { request: { attachments: [null] } }, { request: { attachments: ["file"] } }].map(body => [body] as const))("fails closed on malformed privacy/detail response %j", body => {
    expect(privacyProblems(body)).not.toEqual([]);
    expect(revealProblems(body)).not.toEqual([]);
  });

  it.each([{ ...locked, storageKey: "private" }, { ...locked, fileSize: -1 }, { mimeType: "image/png" }])("requires only valid locked metadata %j", file => {
    expect(privacyProblems({ request: { attachments: [file] } })).not.toEqual([]);
  });

  it.each([null, "", "   ", 1])("requires a nonempty accepted candidate name %j", candidateName => {
    expect(revealProblems({ request: { candidateName, attachments: [open] } })).toContain("the accepted detail has no candidate name");
  });

  it.each([[], null, {}, [null], ["file"], [{ ...open, fileName: " " }], [{ ...open, url: null }], [{ ...open, url: " " }]].map(attachments => [attachments] as const))("rejects absent or malformed accepted files %j", attachments => {
    expect(revealProblems({ request: { candidateName: "Demo seeker", attachments } })).not.toEqual([]);
  });
});

describe("demo identity confinement", () => {
  it("accepts each exact public demo identity with case/whitespace normalization", () => {
    expect(identityProblem("seeker", ` ${DEMO.seeker.toUpperCase()} `)).toBeNull();
    expect(identityProblem("referrer", DEMO.referrer)).toBeNull();
    expect(identityProblem("seeker", DEMO.referrer)).not.toBeNull();
  });

  it("never repeats an unexpected received email", () => {
    const email = "private-person@example.invalid";
    const problem = identityProblem("seeker", email);
    expect(problem).not.toBeNull();
    expect(problem).not.toContain(email);
    expect(problem).toContain(DEMO.seeker);
  });

  it.each([undefined, null, {}, [], 1, ""].map(email => [email] as const))("fails closed on missing/malformed email %j", email => {
    expect(identityProblem("seeker", email)).not.toBeNull();
  });

  it.each(["admin", "toString", "constructor", "__proto__", null, {}])("rejects unsupported roles %j without leaking an email", role => {
    const problem = identityProblem(role, "private-person@example.invalid");
    expect(problem).not.toBeNull();
    expect(problem).not.toContain("private-person@example.invalid");
  });
});

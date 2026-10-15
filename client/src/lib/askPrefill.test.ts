import { describe, expect, it } from "vitest";
import { ASK_NOTE_LIMIT, ASK_PREFILL_KEY, ASK_PREFILL_TTL_MS, clearAskPrefill, forgetReferrerLink, parseReferrerLink, readAskPrefill, referrerLinkFromSearch, referrerLinkSearch, resolveAskPrefill, saveAskPrefill, searchWithoutReferrerLink, withReferrerLink } from "./askPrefill";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

const throwingStorage = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("blocked"); },
  removeItem: () => { throw new Error("blocked"); },
};

describe("ask prefill hand-off", () => {
  it("round-trips a trimmed draft within its lifetime", () => {
    const storage = memoryStorage();
    expect(saveAskPrefill({ companySlug: "wipro", targetRoleUrl: "  https://careers.wipro.com/jobs/1 ", note: "  Strong fit.  " }, storage, 1_000)).toBe(true);
    expect(readAskPrefill(storage, 1_000 + ASK_PREFILL_TTL_MS)).toEqual({ companySlug: "wipro", targetRoleUrl: "https://careers.wipro.com/jobs/1", note: "Strong fit.", savedAt: 1_000 });
  });

  it("caps the note at the composer limit", () => {
    const storage = memoryStorage();
    saveAskPrefill({ companySlug: "tcs", targetRoleUrl: "https://tcs.com/careers/1", note: "x".repeat(ASK_NOTE_LIMIT + 50) }, storage, 5);
    expect(readAskPrefill(storage, 5)?.note).toHaveLength(ASK_NOTE_LIMIT);
  });

  it("refuses an empty link instead of storing a broken draft", () => {
    const storage = memoryStorage();
    expect(saveAskPrefill({ companySlug: "tcs", targetRoleUrl: "   ", note: "" }, storage, 5)).toBe(false);
    expect(storage.values.size).toBe(0);
  });

  it("drops an expired draft", () => {
    const storage = memoryStorage();
    saveAskPrefill({ companySlug: "merkle", targetRoleUrl: "https://merkle.com/jobs/2", note: "" }, storage, 0);
    expect(readAskPrefill(storage, ASK_PREFILL_TTL_MS + 1)).toBeNull();
    expect(storage.values.has(ASK_PREFILL_KEY)).toBe(false);
  });

  it("rejects tampered or malformed storage", () => {
    const storage = memoryStorage();
    storage.setItem(ASK_PREFILL_KEY, JSON.stringify({ companySlug: "wipro", targetRoleUrl: "https://a.b/c", note: "", savedAt: 1, injected: true }));
    expect(readAskPrefill(storage, 1)).toBeNull();
    expect(storage.values.has(ASK_PREFILL_KEY)).toBe(false);
    storage.setItem(ASK_PREFILL_KEY, "{not json");
    expect(readAskPrefill(storage, 1)).toBeNull();
  });

  it("degrades quietly when storage is blocked", () => {
    expect(saveAskPrefill({ companySlug: "wipro", targetRoleUrl: "https://a.b/c", note: "" }, throwingStorage, 1)).toBe(false);
    expect(readAskPrefill(throwingStorage, 1)).toBeNull();
    expect(() => clearAskPrefill(throwingStorage)).not.toThrow();
    expect(saveAskPrefill({ companySlug: "wipro", targetRoleUrl: "https://a.b/c", note: "" }, null, 1)).toBe(false);
  });

  it("clears a stored draft", () => {
    const storage = memoryStorage();
    saveAskPrefill({ companySlug: "wipro", targetRoleUrl: "https://a.b/c", note: "" }, storage, 1);
    clearAskPrefill(storage);
    expect(readAskPrefill(storage, 1)).toBeNull();
  });
});

const CODE = "abcdefghijklmnop1234";

describe("referrer link hand-off (D-017)", () => {
  it("round-trips a job link with a personal link code, and with a vanity alias", () => {
    const storage = memoryStorage();
    expect(saveAskPrefill({ targetRoleUrl: " https://careers.tcs.com/job/42 ", referrerLink: { fastTrackCode: CODE } }, storage, 10)).toBe(true);
    expect(readAskPrefill(storage, 10)).toEqual({ targetRoleUrl: "https://careers.tcs.com/job/42", referrerLink: { fastTrackCode: CODE }, savedAt: 10 });
    expect(saveAskPrefill({ targetRoleUrl: "https://careers.tcs.com/job/42", referrerLink: { fastTrackCompanySlug: "tcs", fastTrackAlias: "asha-k" } }, storage, 11)).toBe(true);
    expect(readAskPrefill(storage, 11)?.referrerLink).toEqual({ fastTrackCompanySlug: "tcs", fastTrackAlias: "asha-k" });
  });

  it("refuses a hand-off that carries nothing, or two kinds of referrer link at once", () => {
    const storage = memoryStorage();
    expect(saveAskPrefill({}, storage, 1)).toBe(false);
    storage.setItem(ASK_PREFILL_KEY, JSON.stringify({ targetRoleUrl: "https://a.b/c", referrerLink: { fastTrackCode: CODE, fastTrackCompanySlug: "tcs", fastTrackAlias: "asha-k" }, savedAt: 1 }));
    expect(readAskPrefill(storage, 1)).toBeNull();
    storage.setItem(ASK_PREFILL_KEY, JSON.stringify({ targetRoleUrl: "https://a.b/c", referrerLink: { fastTrackCompanySlug: "tcs" }, savedAt: 1 }));
    expect(readAskPrefill(storage, 1)).toBeNull();
    storage.setItem(ASK_PREFILL_KEY, JSON.stringify({ referrerLink: { fastTrackCode: "<script>" }, savedAt: 1 }));
    expect(readAskPrefill(storage, 1)).toBeNull();
    expect(storage.values.has(ASK_PREFILL_KEY)).toBe(false);
  });

  it("reads the link from the query string, code first, and lowercases a vanity alias", () => {
    expect(referrerLinkFromSearch(`?fast=${CODE}`)).toEqual({ fastTrackCode: CODE });
    expect(referrerLinkFromSearch("?referCompany=TCS&referAlias=Asha-K")).toEqual({ fastTrackCompanySlug: "tcs", fastTrackAlias: "asha-k" });
    expect(referrerLinkFromSearch(`?fast=${CODE}&referCompany=tcs&referAlias=asha-k`)).toEqual({ fastTrackCode: CODE });
    for (const search of ["", "?referCompany=tcs", "?fast=", "?fast=bad%20code", "?referAlias=asha-k"]) expect(referrerLinkFromSearch(search)).toBeNull();
  });

  it("builds the query an entry page hands on, and strips only the link from a query", () => {
    expect(referrerLinkSearch({ fastTrackCode: CODE })).toBe(`?fast=${CODE}`);
    expect(referrerLinkSearch({ fastTrackCompanySlug: "tcs", fastTrackAlias: "asha-k" })).toBe("?referCompany=tcs&referAlias=asha-k");
    expect(referrerLinkFromSearch(referrerLinkSearch({ fastTrackCompanySlug: "tcs", fastTrackAlias: "asha-k" }))).toEqual({ fastTrackCompanySlug: "tcs", fastTrackAlias: "asha-k" });
    expect(searchWithoutReferrerLink(`?fast=${CODE}&utm_source=x`)).toBe("?utm_source=x");
    expect(searchWithoutReferrerLink("?referCompany=tcs&referAlias=asha-k")).toBe("");
    expect(withReferrerLink("/start", parseReferrerLink({ fastTrackCode: CODE }))).toBe(`/start?fast=${CODE}`);
    expect(withReferrerLink("/start", parseReferrerLink({ fastTrackCompanySlug: "TCS", fastTrackAlias: "asha-k" }))).toBe("/start?referCompany=tcs&referAlias=asha-k");
    expect(withReferrerLink("/ask", parseReferrerLink({ fastTrackCode: "" }))).toBe("/ask");
  });

  it("prefers the link in the URL over the stored one and keeps the stored job link", () => {
    const storage = memoryStorage();
    saveAskPrefill({ targetRoleUrl: "https://careers.tcs.com/job/42", referrerLink: { fastTrackCompanySlug: "tcs", fastTrackAlias: "old-one" } }, storage, 5);
    expect(resolveAskPrefill(`?fast=${CODE}`, storage, 6)).toEqual({ targetRoleUrl: "https://careers.tcs.com/job/42", referrerLink: { fastTrackCode: CODE }, savedAt: 5 });
    expect(resolveAskPrefill("", storage, 6)?.referrerLink).toEqual({ fastTrackCompanySlug: "tcs", fastTrackAlias: "old-one" });
    expect(resolveAskPrefill(`?fast=${CODE}`, memoryStorage(), 7)).toEqual({ referrerLink: { fastTrackCode: CODE }, savedAt: 7 });
    expect(resolveAskPrefill("", memoryStorage(), 7)).toBeNull();
    expect(resolveAskPrefill(`?fast=${CODE}`, throwingStorage, 7)).toEqual({ referrerLink: { fastTrackCode: CODE }, savedAt: 7 });
  });

  it("forgets only the link when the seeker sends to the company instead", () => {
    const storage = memoryStorage();
    saveAskPrefill({ targetRoleUrl: "https://careers.tcs.com/job/42", referrerLink: { fastTrackCode: CODE } }, storage, 5);
    forgetReferrerLink(storage, 6);
    expect(readAskPrefill(storage, 6)).toEqual({ targetRoleUrl: "https://careers.tcs.com/job/42", savedAt: 5 });
    saveAskPrefill({ referrerLink: { fastTrackCode: CODE } }, storage, 7);
    forgetReferrerLink(storage, 7);
    expect(storage.values.has(ASK_PREFILL_KEY)).toBe(false);
    expect(() => forgetReferrerLink(throwingStorage, 7)).not.toThrow();
  });
});

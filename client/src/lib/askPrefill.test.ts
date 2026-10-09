import { describe, expect, it } from "vitest";
import { ASK_NOTE_LIMIT, ASK_PREFILL_KEY, ASK_PREFILL_TTL_MS, clearAskPrefill, readAskPrefill, saveAskPrefill } from "./askPrefill";

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

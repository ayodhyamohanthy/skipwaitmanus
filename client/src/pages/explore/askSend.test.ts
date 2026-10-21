import { describe, expect, it } from "vitest";
import { ASK_IDEMPOTENCY_KEY, askIdempotencyKey, buildAskBody } from "./askSend";

const storage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

describe("ask send body", () => {
  it("reuses the session's idempotency key and creates one when absent", () => {
    const existing = storage({ [ASK_IDEMPOTENCY_KEY]: "key-1" });
    expect(askIdempotencyKey(existing)).toBe("key-1");
    const created = askIdempotencyKey(storage());
    expect(created).toMatch(/^[0-9a-f-]{36}$/);
    expect(askIdempotencyKey(null)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("sends the selected company, the resume and the three reasons as one note", () => {
    expect(buildAskBody({
      targetRoleUrl: "  https://careers.acme.com/jobs/1  ",
      reasons: ["Cut p99 by 41%", "Ran 14 services", ""],
      resumeId: 44,
      companySlug: "acme",
      fastTrack: {},
      confirmedCompanyDomain: undefined,
    })).toEqual({
      targetRoleUrl: "https://careers.acme.com/jobs/1",
      attachmentIds: [44],
      candidateMessage: "Cut p99 by 41%\nRan 14 services",
      companySlug: "acme",
    });
  });

  it("keeps a personal-link ask with its referrer", () => {
    const body = buildAskBody({ targetRoleUrl: "https://acme.com/jobs/1", reasons: ["One"], resumeId: 1, companySlug: null, fastTrack: { fastTrackCode: "abc" }, confirmedCompanyDomain: undefined });
    expect(body.fastTrackCode).toBe("abc");
    expect(body.companySlug).toBeUndefined();
  });

  it("passes a confirmed employer domain only when one was handed in", () => {
    const base = { targetRoleUrl: "https://acme.com/jobs/1", reasons: ["One"], resumeId: 1, companySlug: "acme", fastTrack: {} } as const;
    expect(buildAskBody({ ...base, confirmedCompanyDomain: "acme.com" }).confirmedCompanyDomain).toBe("acme.com");
    expect(buildAskBody({ ...base, confirmedCompanyDomain: undefined }).confirmedCompanyDomain).toBeUndefined();
  });
});

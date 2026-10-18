import { describe, expect, it } from "vitest";
import { displayRef, displayRefSecret } from "./displayRef";

describe("displayRef (D-077(5))", () => {
  it("is R- plus five Crockford base32 characters", () => {
    for (const id of [1, 2, 999, 123456]) expect(displayRef(id, "k")).toMatch(/^R-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{5}$/);
  });
  it("is stable for an id and a key, and different across ids and keys", () => {
    expect(displayRef(42, "k")).toBe(displayRef(42, "k"));
    expect(displayRef(42, "k")).not.toBe(displayRef(43, "k"));
    expect(displayRef(42, "k")).not.toBe(displayRef(42, "other"));
  });
  it("does not reveal order or volume: consecutive ids do not give ordered codes", () => {
    const codes = Array.from({ length: 50 }, (_, index) => displayRef(1000 + index, "k"));
    expect(new Set(codes).size).toBe(50);
    expect([...codes].sort()).not.toEqual(codes);
  });
  it("derives its key from JWT_SECRET with its own prefix", () => {
    expect(displayRefSecret({ JWT_SECRET: " s3cret " } as NodeJS.ProcessEnv)).toBe("display-ref-jwt:s3cret");
    expect(displayRefSecret({} as NodeJS.ProcessEnv)).toBe("display-ref-jwt:skipwait-local-development-secret");
  });
});

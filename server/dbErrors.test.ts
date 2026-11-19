import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { isDuplicateKeyError } from "./dbErrors";

function mysqlError(code: string, errno: number): Error {
  return Object.assign(new Error(`mysql ${code}`), { code, errno, sqlState: "23000" });
}

describe("isDuplicateKeyError", () => {
  it("matches a bare driver error by code or errno", () => {
    expect(isDuplicateKeyError(mysqlError("ER_DUP_ENTRY", 1062))).toBe(true);
    expect(isDuplicateKeyError(Object.assign(new Error("dup"), { errno: 1062 }))).toBe(true);
  });

  it("matches the production shape: the driver error wrapped by DrizzleQueryError", () => {
    const wrapped = new DrizzleQueryError("insert into `userBlocks`", [], mysqlError("ER_DUP_ENTRY", 1062));
    expect(isDuplicateKeyError(wrapped)).toBe(true);
  });

  it("matches a doubly wrapped error", () => {
    const inner = new DrizzleQueryError("insert into `companies`", [], mysqlError("ER_DUP_ENTRY", 1062));
    const outer = new DrizzleQueryError("transaction", [], inner);
    expect(isDuplicateKeyError(outer)).toBe(true);
  });

  it("rejects other driver failures, plain errors and non-objects", () => {
    expect(isDuplicateKeyError(new DrizzleQueryError("insert", [], mysqlError("ER_LOCK_DEADLOCK", 1213)))).toBe(false);
    expect(isDuplicateKeyError(new Error("Duplicate entry"))).toBe(false);
    expect(isDuplicateKeyError(undefined)).toBe(false);
    expect(isDuplicateKeyError("ER_DUP_ENTRY")).toBe(false);
  });

  it("stops on a cause cycle and after five inspected levels", () => {
    const loop: { cause?: unknown } = {};
    loop.cause = loop;
    expect(isDuplicateKeyError(loop)).toBe(false);

    // Four wrappers put the driver error at the fifth level: still found.
    let found: unknown = mysqlError("ER_DUP_ENTRY", 1062);
    for (let level = 0; level < 4; level += 1) found = { cause: found };
    expect(isDuplicateKeyError(found)).toBe(true);

    // A fifth wrapper puts it out of reach: SQLSTATE codes never nest that deep,
    // and an unbounded walk could read unrelated objects.
    expect(isDuplicateKeyError({ cause: found })).toBe(false);
  });
});

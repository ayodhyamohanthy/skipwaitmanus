import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userBlocks } from "../drizzle/schema";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";
import { BlockedPersonalLinkError, PERSONAL_LINK_UNAVAILABLE, blockedCounterpartsFailOpen, selectBlockedCounterparts } from "./blockedPairs";

/*
 * The one lookup every delivery path uses (P0-block-delivery): who among the
 * candidates is blocked with a person, in either direction, in bounded chunks;
 * and its fail-open form, which never hides a failed lookup.
 */

const mocks = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("./sentry", async importOriginal => ({ ...(await importOriginal<typeof import("./sentry")>()), captureServerError: mocks.capture }));

const store = createInMemoryDrizzle();
const SEEKER = 7;
const block = (id: number, blockerUserId: number, blockedUserId: number): Row => ({ id, blockerUserId, blockedUserId, reason: null, createdAt: new Date("2026-10-01T00:00:00Z") });

beforeEach(() => {
  store.reset([[userBlocks, []]]);
  mocks.capture.mockClear();
});
afterEach(() => { vi.restoreAllMocks(); });

describe("selectBlockedCounterparts", () => {
  it("returns the candidates blocked with the person in either direction, and nobody else", async () => {
    store.reset([[userBlocks, [block(1, SEEKER, 2), block(2, 4, SEEKER), block(3, 5, 6), block(4, SEEKER, 99)]]]);
    expect(await selectBlockedCounterparts(store.db, SEEKER, [2, 3, 4, 5, 6])).toEqual(new Set([2, 4]));
  });

  it("covers every candidate past one chunk instead of truncating", async () => {
    const candidates = Array.from({ length: 450 }, (_, index) => 1000 + index);
    store.reset([[userBlocks, [block(1, SEEKER, 1000), block(2, 1250, SEEKER), block(3, SEEKER, 1449)]]]);
    const select = vi.spyOn(store.db, "select");
    expect(await selectBlockedCounterparts(store.db, SEEKER, candidates)).toEqual(new Set([1000, 1250, 1449]));
    expect(select).toHaveBeenCalledTimes(3);
  });

  it("asks nothing for no candidates, the person themself or invalid ids", async () => {
    const select = vi.spyOn(store.db, "select");
    expect(await selectBlockedCounterparts(store.db, SEEKER, [])).toEqual(new Set());
    expect(await selectBlockedCounterparts(store.db, SEEKER, [SEEKER, 0, -3, 1.5])).toEqual(new Set());
    expect(select).not.toHaveBeenCalled();
  });

  it("throws when the lookup fails", async () => {
    store.failReads(userBlocks);
    await expect(selectBlockedCounterparts(store.db, SEEKER, [2])).rejects.toThrow(/userBlocks/);
  });
});

describe("blockedCounterpartsFailOpen", () => {
  it("returns the same answer as the strict lookup when it works, without reporting", async () => {
    store.reset([[userBlocks, [block(1, 2, SEEKER)]]]);
    expect(await blockedCounterpartsFailOpen(store.db, SEEKER, [2, 4], "test_area")).toEqual(new Set([2]));
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("blocks nobody when the lookup fails, and logs and reports it with the path", async () => {
    store.reset([[userBlocks, [block(1, 2, SEEKER)]]]);
    store.failReads(userBlocks);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await blockedCounterpartsFailOpen(store.db, SEEKER, [2, 4], "test_area")).toEqual(new Set());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("fail-open"), expect.objectContaining({ area: "test_area" }));
    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({ code: "ER_NO_SUCH_TABLE" }), { area: "test_area" });
  });
});

describe("BlockedPersonalLinkError", () => {
  it("carries the inactive-link words, so a refusal never reveals the block", () => {
    const error = new BlockedPersonalLinkError();
    expect(error.message).toBe(PERSONAL_LINK_UNAVAILABLE);
    expect(PERSONAL_LINK_UNAVAILABLE).toBe("This private referral link is no longer active");
    expect(error.name).toBe("BlockedPersonalLinkError");
  });
});

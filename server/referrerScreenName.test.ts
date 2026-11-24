import { describe, expect, it, vi } from "vitest";
import { ScreenNameRefusedError, screenNameRefusalStatus, setReferrerScreenName, type ScreenNameStore } from "./referrerScreenName";

/**
 * D-089.server (D-327 §4.3, T3): the screen-name route's decisions, against an injected store so
 * the test proves the rule rather than the database. The unique index is the only uniqueness check;
 * a duplicate arrives as ER_DUP_ENTRY and becomes 409 `screen_name_taken`.
 */

const USER = 41;

function store(overrides: Partial<ScreenNameStore> = {}): ScreenNameStore & { updates: string[] } {
  const updates: string[] = [];
  const base: ScreenNameStore = {
    ensureLink: async () => ({ vanityAlias: "ref-a1b2c3d4e5", companyDomain: "acme-corp.com" }),
    readIdentity: async () => ({ fullName: "Ada Lovelace", workEmail: "ada.lovelace@acme-corp.com" }),
    updateAlias: async (_userId, alias) => { updates.push(alias); },
  };
  return Object.assign({ ...base, ...overrides }, { updates });
}

const refusal = async (screenName: string, overrides: Partial<ScreenNameStore> = {}) => {
  try {
    await setReferrerScreenName(USER, { screenName }, store(overrides));
  } catch (error) {
    if (error instanceof ScreenNameRefusedError) return error.code;
    throw error;
  }
  return "accepted";
};

describe("setReferrerScreenName refusals (§4.3, T3)", () => {
  it("refuses the slug of the person's own name", async () => {
    expect(await refusal("ada-lovelace")).toBe("screen_name_identifying");
  });

  it("refuses a single name token of three or more characters", async () => {
    expect(await refusal("lovelace")).toBe("screen_name_identifying");
    expect(await refusal("ada")).toBe("screen_name_identifying");
  });

  it("refuses the work email's local part and its dash-joined tokens", async () => {
    expect(await refusal("ada.lovelace")).toBe("screen_name_invalid");
    expect(await refusal("ada-lovelace")).toBe("screen_name_identifying");
  });

  it("refuses the generated ref- form", async () => {
    expect(await refusal("ref-a1b2c3d4e5")).toBe("screen_name_invalid");
  });

  it("refuses a reserved word", async () => {
    expect(await refusal("admin")).toBe("screen_name_invalid");
    expect(await refusal("settings")).toBe("screen_name_invalid");
  });

  it("refuses one character and thirty-one characters", async () => {
    expect(await refusal("a")).toBe("screen_name_invalid");
    expect(await refusal("a".repeat(31))).toBe("screen_name_invalid");
  });

  it("maps a taken name to 409 and the other refusals to 422", () => {
    expect(screenNameRefusalStatus("screen_name_taken")).toBe(409);
    expect(screenNameRefusalStatus("screen_name_identifying")).toBe(422);
    expect(screenNameRefusalStatus("screen_name_invalid")).toBe(422);
  });
});

describe("setReferrerScreenName writes (§4.3, T2)", () => {
  it("normalizes and writes a safe name, reporting the rename", async () => {
    const fake = store();
    const result = await setReferrerScreenName(USER, { screenName: "  Backend Buddy  " }, fake);
    expect(result).toEqual({ vanityAlias: "backend-buddy", renamed: true });
    expect(fake.updates).toEqual(["backend-buddy"]);
  });

  it("does not write when the name is unchanged", async () => {
    const fake = store({ ensureLink: async () => ({ vanityAlias: "backend-buddy", companyDomain: "acme-corp.com" }) });
    const result = await setReferrerScreenName(USER, { screenName: "backend-buddy" }, fake);
    expect(result).toEqual({ vanityAlias: "backend-buddy", renamed: false });
    expect(fake.updates).toEqual([]);
  });

  it("turns the unique index's duplicate into 409 screen_name_taken", async () => {
    const duplicate = Object.assign(new Error("Duplicate entry 'backend-buddy' for key 'referrer_fast_track_vanity_unique'"), { code: "ER_DUP_ENTRY" });
    const fake = store({ updateAlias: async () => { throw duplicate; } });
    await expect(setReferrerScreenName(USER, { screenName: "backend-buddy" }, fake))
      .rejects.toMatchObject({ code: "screen_name_taken" });
  });

  it("lets exactly one of two concurrent sets of the same name win", async () => {
    const taken = new Set<string>();
    const updateAlias = vi.fn(async (_userId: number, alias: string) => {
      if (taken.has(alias)) throw Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" });
      taken.add(alias);
    });
    const fake = store({ updateAlias });
    const results = await Promise.allSettled([
      setReferrerScreenName(USER, { screenName: "backend-buddy" }, fake),
      setReferrerScreenName(USER + 1, { screenName: "backend-buddy" }, fake),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected");
    expect(rejected && rejected.status === "rejected" ? (rejected.reason as ScreenNameRefusedError).code : null).toBe("screen_name_taken");
  });

  it("rethrows an unexpected store failure instead of calling it a refusal", async () => {
    const fake = store({ updateAlias: async () => { throw new Error("connection lost"); } });
    await expect(setReferrerScreenName(USER, { screenName: "backend-buddy" }, fake)).rejects.toThrow("connection lost");
  });

  it("refuses before any write when the caller is not a verified employee", async () => {
    const updateAlias = vi.fn(async () => {});
    const fake = store({
      ensureLink: async () => { throw new Error("Verify your company email before creating your link"); },
      updateAlias,
    });
    await expect(setReferrerScreenName(USER, { screenName: "backend-buddy" }, fake))
      .rejects.toThrow("Verify your company email");
    expect(updateAlias).not.toHaveBeenCalled();
  });
});

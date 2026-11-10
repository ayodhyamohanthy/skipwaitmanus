import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { getAccountLanguage, recordSignupLanguage, saveAccountLanguage, type AccountLanguageGateway } from "./accountLanguage";
import { DESIRED_COLUMNS } from "./schemaReconcile";

// D-093 packet §5.1 red-first tests 3 and 4 (C2). Red first:
// server/accountLanguage.ts and the additive migration do not exist on main.
const HOUR = 60 * 60 * 1000;

function fakeGateway(overrides: Partial<AccountLanguageGateway> = {}) {
  const state: { signupLanguage: string | null; createdAt: Date } = { signupLanguage: null, createdAt: new Date(0) };
  const writeSignupLanguage = vi.fn(async (_userId: number, _value: string) => {});
  const writeLanguage = vi.fn(async (_userId: number, _value: string | null) => {});
  const gateway: AccountLanguageGateway = {
    enabled: true,
    accountState: vi.fn(async () => ({ ...state })),
    writeSignupLanguage,
    readLanguage: vi.fn(async () => null as string | null),
    writeLanguage,
    ...overrides,
  };
  return { gateway, state, writeSignupLanguage, writeLanguage };
}

describe("recordSignupLanguage (D-093.capture §5.1 test 3)", () => {
  it("writes nothing while the capture switch is off", async () => {
    const { gateway, writeSignupLanguage } = fakeGateway({ enabled: false });
    expect(await recordSignupLanguage(1, "te", new Date(23 * HOUR), gateway)).toBe(false);
    expect(writeSignupLanguage).not.toHaveBeenCalled();
  });

  it("writes the canonical value once for a 23-hour-old account with no value", async () => {
    const { gateway, writeSignupLanguage } = fakeGateway();
    expect(await recordSignupLanguage(1, "te", new Date(23 * HOUR), gateway)).toBe(true);
    expect(writeSignupLanguage).toHaveBeenCalledTimes(1);
    expect(writeSignupLanguage).toHaveBeenCalledWith(1, "te");
  });

  it("never writes for an account older than 24 hours", async () => {
    const { gateway, writeSignupLanguage } = fakeGateway();
    expect(await recordSignupLanguage(1, "te", new Date(25 * HOUR), gateway)).toBe(false);
    expect(writeSignupLanguage).not.toHaveBeenCalled();
  });

  it("never overwrites a value that is already set", async () => {
    const { gateway, state, writeSignupLanguage } = fakeGateway();
    state.signupLanguage = "en";
    expect(await recordSignupLanguage(1, "te", new Date(HOUR), gateway)).toBe(false);
    expect(writeSignupLanguage).not.toHaveBeenCalled();
  });

  it("never writes for a missing account, a null value or a future-created account", async () => {
    const missing = fakeGateway({ accountState: async () => undefined });
    expect(await recordSignupLanguage(1, "te", new Date(HOUR), missing.gateway)).toBe(false);
    expect(missing.writeSignupLanguage).not.toHaveBeenCalled();

    const nullValue = fakeGateway();
    expect(await recordSignupLanguage(1, null, new Date(HOUR), nullValue.gateway)).toBe(false);
    expect(nullValue.writeSignupLanguage).not.toHaveBeenCalled();

    const future = fakeGateway();
    expect(await recordSignupLanguage(1, "other", new Date(-HOUR), future.gateway)).toBe(false);
    expect(future.writeSignupLanguage).not.toHaveBeenCalled();
  });
});

describe("account language reads and writes", () => {
  it("exposes only a reviewed language, never an unreviewed stored value", async () => {
    const reviewed = fakeGateway({ readLanguage: async () => "en" });
    expect(await getAccountLanguage(1, reviewed.gateway)).toBe("en");
    const unreviewed = fakeGateway({ readLanguage: async () => "te" });
    expect(await getAccountLanguage(1, unreviewed.gateway)).toBeNull();
    const empty = fakeGateway();
    expect(await getAccountLanguage(1, empty.gateway)).toBeNull();
  });

  it("saves a reviewed language or clears it, and refuses an unreviewed one", async () => {
    const { gateway, writeLanguage } = fakeGateway();
    await saveAccountLanguage(1, "en", gateway);
    await saveAccountLanguage(1, null, gateway);
    expect(writeLanguage.mock.calls).toEqual([[1, "en"], [1, null]]);
    await expect(saveAccountLanguage(1, "te", gateway)).rejects.toThrow();
    expect(writeLanguage).toHaveBeenCalledTimes(2);
  });
});

// C2: the additive migration and the boot reconcile must describe the same two
// columns. Read from the files, never restate the contract in a fixture.
describe("account language migration contract (C2)", () => {
  const sql = readFileSync(new URL("../drizzle/deploy/0121_account_language.sql", import.meta.url), "utf8");

  it("guards each additive column separately with information_schema", () => {
    expect(sql.match(/information_schema\.COLUMNS/g) ?? []).toHaveLength(2);
    expect(sql).toContain("COLUMN_NAME = 'language'");
    expect(sql).toContain("COLUMN_NAME = 'signupLanguage'");
    expect(sql).toContain("ADD COLUMN `language` VARCHAR(16) NULL");
    expect(sql).toContain("ADD COLUMN `signupLanguage` VARCHAR(16) NULL");
    expect(sql.match(/PREPARE stmt FROM @ddl/g) ?? []).toHaveLength(2);
    expect(sql).not.toMatch(/DROP\s|TRUNCATE\s|DELETE\s+FROM/i);
  });

  it("lists both columns in DESIRED_COLUMNS with the same definition as the SQL", () => {
    for (const column of ["language", "signupLanguage"]) {
      expect(DESIRED_COLUMNS).toContainEqual({ table: "accountPreferences", column, definition: "VARCHAR(16) NULL" });
    }
  });

  it("declares both nullable columns in drizzle/schema.ts", () => {
    const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
    expect(schema).toMatch(/language:\s*varchar\("language",\s*\{\s*length:\s*16\s*\}\)/);
    expect(schema).toMatch(/signupLanguage:\s*varchar\("signupLanguage",\s*\{\s*length:\s*16\s*\}\)/);
  });
});

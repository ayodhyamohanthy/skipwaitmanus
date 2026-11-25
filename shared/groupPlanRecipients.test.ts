import { describe, expect, expectTypeOf, it } from "vitest";
import {
  GROUP_RECIPIENT_LIMIT,
  parseRecipientList,
  recipientListResultSchema,
  type RecipientListResult,
} from "./groupPlanRecipients";

const addresses = (count: number) =>
  Array.from({ length: count }, (_, index) => `candidate${index}@example.com`);

describe("Group Plan recipient list", () => {
  it.each(["\n", "\r\n", ",", ";", "\t"])("accepts %j separators", separator => {
    expect(parseRecipientList(`ada@example.com${separator}lin@example.com`)).toEqual({
      valid: ["ada@example.com", "lin@example.com"],
      invalid: [], duplicates: [], overLimit: false, entries: 2,
    });
  });

  it("accepts mixed separators and preserves input order", () => {
    expect(parseRecipientList("z@example.com, a@example.com; m@example.com\tn@example.com\rb@example.com").valid)
      .toEqual(["z@example.com", "a@example.com", "m@example.com", "n@example.com", "b@example.com"]);
  });

  it.each(["", "   ", "\r\n, ;\t\n,,;"])("ignores blank entries in %j", text => {
    expect(parseRecipientList(text)).toEqual({
      valid: [], invalid: [], duplicates: [], overLimit: false, entries: 0,
    });
  });

  it("trims entries, removes surrounding quotes and accepts display names", () => {
    const text = '  "ADA@Example.com" ; \'lin@example.com\'; "Mira" < MIRA@example.com >; <noor@example.com>';
    expect(parseRecipientList(text)).toEqual({
      valid: ["ada@example.com", "lin@example.com", "mira@example.com", "noor@example.com"],
      invalid: [], duplicates: [], overLimit: false, entries: 4,
    });
  });

  it("checks the extracted address length rather than the display name length", () => {
    expect(parseRecipientList(`${"Long name ".repeat(40)}<ada@example.com>`).valid).toEqual(["ada@example.com"]);
  });

  it("numbers non-empty entries and points every duplicate to the first normalized occurrence", () => {
    expect(parseRecipientList("\n junk, ADA@EXAMPLE.COM; ; lin@example.com\tada@example.com, A <Ada@Example.com>; LIN@example.com,")).toEqual({
      valid: ["ada@example.com", "lin@example.com"],
      invalid: [{ entry: 1, value: "junk", reason: "not_an_email" }],
      duplicates: [
        { entry: 4, value: "ada@example.com", firstEntry: 2 },
        { entry: 5, value: "ada@example.com", firstEntry: 2 },
        { entry: 6, value: "lin@example.com", firstEntry: 3 },
      ],
      overLimit: false, entries: 6,
    });
  });

  it("keeps plus tags and dots instead of guessing provider-specific aliases", () => {
    const valid = ["a.da@example.com", "ada@example.com", "ada+cohort@example.com"];
    expect(parseRecipientList(valid.join(",")).valid).toEqual(valid);
  });

  it("reports malformed addresses using the original trimmed input", () => {
    expect(parseRecipientList(' ada@example.com;  "not an email"  ; ada@@example.com; Name <bad> ')).toEqual({
      valid: ["ada@example.com"],
      invalid: [
        { entry: 2, value: '"not an email"', reason: "not_an_email" },
        { entry: 3, value: "ada@@example.com", reason: "not_an_email" },
        { entry: 4, value: "Name <bad>", reason: "not_an_email" },
      ],
      duplicates: [], overLimit: false, entries: 4,
    });
  });

  it("does not extract an address from an ambiguous or unfinished display-name entry", () => {
    const values = ["A <ada@example.com> suffix", "A <ada@example.com> <lin@example.com>", "A <ada@example.com"];
    expect(parseRecipientList(values.join(";")).invalid).toEqual(values.map((value, index) => ({
      entry: index + 1, value, reason: "not_an_email",
    })));
  });

  it("accepts 254 address characters and reports longer addresses as too_long", () => {
    const email = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`;
    expect(email).toHaveLength(254);
    expect(parseRecipientList(` ${email}; ${email}d `)).toEqual({
      valid: [email],
      invalid: [{ entry: 2, value: `${email}d`.slice(0, 120), reason: "too_long" }],
      duplicates: [], overLimit: false, entries: 2,
    });
  });

  it("bounds invalid previews without truncating valid addresses", () => {
    const text = "x".repeat(121);
    expect(parseRecipientList(`  ${text}  `).invalid).toEqual([
      { entry: 1, value: "x".repeat(120), reason: "not_an_email" },
    ]);
  });

  it("allows exactly 500 unique valid recipients despite invalid entries or duplicates", () => {
    expect(GROUP_RECIPIENT_LIMIT).toBe(500);
    const valid = addresses(500);
    const result = parseRecipientList(["bad", ...valid, "candidate0@EXAMPLE.COM"].join("\n"));
    expect(result.valid).toEqual(valid);
    expect(result.overLimit).toBe(false);
    expect(result.entries).toBe(502);
    expect(result.duplicates).toEqual([{ entry: 502, value: "candidate0@example.com", firstEntry: 2 }]);
  });

  it("returns all 501 unique valid recipients and flags overflow", () => {
    const valid = addresses(501);
    const result = parseRecipientList(valid.join("\n"));
    expect(result.valid).toEqual(valid);
    expect(result.overLimit).toBe(true);
    expect(result.entries).toBe(501);
  });
});

describe("Group Plan recipient result contract", () => {
  const result = () => parseRecipientList("ADA@example.com;bad;ada@example.com");

  it("round-trips through its schema and JSON deterministically", () => {
    const parsed = result();
    expect(recipientListResultSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    expect(result()).toEqual(parsed);
    expect(Object.keys(parsed).sort()).toEqual(["duplicates", "entries", "invalid", "overLimit", "valid"]);
  });

  it("rejects account data and unknown fields at every object boundary", () => {
    const parsed = result();
    expect(recipientListResultSchema.safeParse({ ...parsed, accountExists: true }).success).toBe(false);
    expect(recipientListResultSchema.safeParse({
      ...parsed, invalid: [{ entry: 2, value: "bad", reason: "not_an_email", userId: 1 }],
    }).success).toBe(false);
    expect(recipientListResultSchema.safeParse({
      ...parsed, duplicates: [{ entry: 3, value: "ada@example.com", firstEntry: 1, accountExists: false }],
    }).success).toBe(false);
  });

  it("rejects malformed fields, incomplete results and invalid recipient addresses", () => {
    const parsed = result();
    for (const patch of [
      { entries: -1 }, { entries: 1.5 }, { overLimit: "false" }, { valid: ["bad"] },
      { valid: ["ADA@example.com"] }, { invalid: [{ entry: 0, value: "bad", reason: "not_an_email" }] },
      { invalid: [{ entry: 2, value: "x".repeat(121), reason: "not_an_email" }] },
      { invalid: [{ entry: 2, value: "bad", reason: "account_missing" }] },
      { duplicates: [{ entry: 3, value: "ada@example.com", firstEntry: 0 }] },
    ]) expect(recipientListResultSchema.safeParse({ ...parsed, ...patch }).success).toBe(false);
    expect(recipientListResultSchema.safeParse({ valid: [] }).success).toBe(false);
  });

  it("exposes readonly results, arrays and diagnostic entries", () => {
    const parsed = result();
    for (const value of [parsed, parsed.valid, parsed.invalid, parsed.duplicates, ...parsed.invalid, ...parsed.duplicates]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expectTypeOf<RecipientListResult>().toEqualTypeOf<{
      readonly valid: readonly string[];
      readonly invalid: readonly { readonly entry: number; readonly value: string; readonly reason: "not_an_email" | "too_long" }[];
      readonly duplicates: readonly { readonly entry: number; readonly value: string; readonly firstEntry: number }[];
      readonly overLimit: boolean;
      readonly entries: number;
    }>();
  });
});

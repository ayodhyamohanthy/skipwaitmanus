import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LANGUAGES } from "../languages";
import {
  collectEnglishLeaves,
  translate,
  translateWithTrees,
  validateLocaleAgainstEnglish,
  type LocaleValidation,
} from "./catalog";
import content from "../../design/goal-ui/content.json";

// D-093 packet §5.3 red-first tests. They fail on main because ./catalog does
// not exist yet; they pass once the catalogue is built.
const enTree = content as unknown as Record<string, unknown>;

describe("D-093 i18n catalogue — English source of truth", () => {
  it("returns the content.json copy verbatim for three existing keys", () => {
    expect(translate("en", "shell.brand")).toEqual({ text: "SkipWait", fellBack: false });
    expect(translate("en", "shell.unverifiedEntry.label")).toEqual({ text: "Give a referral", fellBack: false });
    expect(translate("en", "companySignal.intro")).toEqual({ text: (content as { companySignal: { intro: string } }).companySignal.intro, fellBack: false });
  });

  it("returns the key path with fellBack for a key English does not define", () => {
    expect(translate("en", "no.such.key")).toEqual({ text: "no.such.key", fellBack: true });
  });

  it("collects one English leaf per string and per plural node", () => {
    const leaves = collectEnglishLeaves(enTree);
    expect(leaves.size).toBeGreaterThan(600);
    expect(leaves.get("shell.brand")).toBe("SkipWait");
    for (const [key, value] of leaves) {
      expect(value !== undefined, `${key} resolves to a leaf`).toBe(true);
      expect(key.length).toBeGreaterThan(0);
    }
  });
});

describe("D-093 i18n catalogue — fallback and interpolation", () => {
  const enFixture = {
    greet: "Hello {name}, you have {count} ask{s}",
    plural: { one: "{count} ask", other: "{count} asks" },
  } as Record<string, unknown>;

  it("falls back to English with fellBack for a key the te locale lacks", () => {
    const te = { greet: "Hola {name}, you have {count} ask{s}" } as Record<string, unknown>;
    expect(translateWithTrees(enFixture, te, "te", "greet", { name: "Ana", count: 3 })).toEqual({ text: "Hola Ana, you have 3 ask{s}", fellBack: false });
    expect(translateWithTrees(enFixture, te, "te", "plural", { count: 5 }, 5)).toEqual({ text: "5 asks", fellBack: true });
    expect(translateWithTrees(enFixture, undefined, "te", "greet", { name: "Ana", count: 3 })).toEqual({ text: "Hello Ana, you have 3 ask{s}", fellBack: true });
  });

  it("picks the plural category by Intl.PluralRules of the catalogue language", () => {
    const arFixture = {
      inbox: { zero: "zero {count}", one: "one {count}", two: "two {count}", few: "few {count}", many: "many {count}", other: "other {count}" },
    } as Record<string, unknown>;
    for (const count of [0, 1, 2, 3, 11, 100, 1000]) {
      const category = new Intl.PluralRules("ar").select(count);
      expect(translateWithTrees(arFixture, undefined, "ar", "inbox", { count }, count).text).toBe(`${category} ${count}`);
    }
    expect(translateWithTrees(enFixture, undefined, "en", "plural", { count: 1 }, 1).text).toBe("1 ask");
    expect(translateWithTrees(enFixture, undefined, "en", "plural", { count: 2 }, 2).text).toBe("2 asks");
    // a locale plural node missing the exact category falls back to its "other" in-language
    const tePlural = { plural: { other: "{count} solicitudes" } } as Record<string, unknown>;
    expect(translateWithTrees(enFixture, tePlural, "te", "plural", { count: 1 }, 1)).toEqual({ text: "1 solicitudes", fellBack: false });
  });

  it("interpolates {placeholders} from params and leaves unknown ones untouched", () => {
    expect(translateWithTrees(enFixture, undefined, "en", "greet", { name: "Ana" }).text).toBe("Hello Ana, you have {count} ask{s}");
    expect(translateWithTrees(enFixture, undefined, "en", "greet", { name: "Ana", count: 4 }).text).toBe("Hello Ana, you have 4 ask{s}");
  });
});

describe("D-093 i18n catalogue — locale validation", () => {
  const enFixture = {
    greet: "Hello {name}",
    plural: { one: "{count} ask", other: "{count} asks" },
    group: { nested: "Nested {count}" },
  } as Record<string, unknown>;

  it("accepts a locale that mirrors English keys and placeholders", () => {
    const te = {
      greet: "నమస్తే {name}",
      plural: { one: "{count} అభ్యర్థన", other: "{count} అభ్యర్థనలు" },
      group: { nested: "నెస్టెడ్ {count}" },
    } as Record<string, unknown>;
    const result = validateLocaleAgainstEnglish(enFixture, te);
    expect(result.extraKeys).toEqual([]);
    expect(result.placeholderMismatches).toEqual([]);
    expect(result.missingKeys).toEqual([]);
    expect(result.presentLeaves).toBe(result.totalEnglishLeaves);
  });

  it("rejects a locale with an extra key that does not exist in English", () => {
    const te = { greet: "నమస్తే {name}", bogus: "తెలుగు మాత్రమే" } as Record<string, unknown>;
    const result = validateLocaleAgainstEnglish(enFixture, te);
    expect(result.extraKeys).toEqual(["bogus"]);
    expect(result.missingKeys).toEqual(["group.nested", "plural"]);
  });

  it("rejects a locale that renames a {placeholder}", () => {
    const te = { greet: "నమస్తే {nama}" } as Record<string, unknown>;
    const result = validateLocaleAgainstEnglish(enFixture, te);
    expect(result.placeholderMismatches).toEqual(["greet"]);
  });

  it("rejects a locale that renames a plural {placeholder}", () => {
    const te = { plural: { one: "{n} అభ్యర్థన", other: "{count} అభ్యర్థనలు" } } as Record<string, unknown>;
    const result = validateLocaleAgainstEnglish(enFixture, te);
    expect(result.placeholderMismatches).toEqual(["plural"]);
  });

  it("flags every real locale file: no extra keys, no renamed placeholders", () => {
    const localesDir = join(__dirname, "locales");
    if (existsSync(localesDir)) {
      for (const file of readdirSync(localesDir).filter(name => name.endsWith(".json"))) {
        const locale = JSON.parse(readFileSync(join(localesDir, file), "utf8")) as Record<string, unknown>;
        const result: LocaleValidation = validateLocaleAgainstEnglish(enTree, locale);
        expect(result.extraKeys, `${file} extra keys`).toEqual([]);
        expect(result.placeholderMismatches, `${file} placeholder mismatches`).toEqual([]);
      }
    }
  });

  it("fails a language marked reviewed unless its file has every English key", () => {
    const localesDir = join(__dirname, "locales");
    for (const entry of LANGUAGES) {
      if (!entry.reviewed || entry.code === "en") continue; // English is the source of truth
      const file = join(localesDir, `${entry.code}.json`);
      expect(existsSync(file), `${entry.code}.json must exist for a reviewed language`).toBe(true);
      const locale = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      const result = validateLocaleAgainstEnglish(enTree, locale);
      expect(result.missingKeys, `${entry.code}.json must carry every English key`).toEqual([]);
    }
  });
});

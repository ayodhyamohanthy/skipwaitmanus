import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LANGUAGES, LANGUAGE_CAPTURE_ENABLED, isVisibleLanguage, signupLanguageOf, visibleLanguages } from "./languages";

// D-093 packet §5.1 test 1. Red first: shared/languages.ts does not exist yet.
describe("D-093 language registry", () => {
  it("holds exactly the six endonym entries named by D-093", () => {
    expect(LANGUAGES.map(entry => [entry.code, entry.endonym, entry.script, entry.dir])).toEqual([
      ["en", "English", "Latn", "ltr"],
      ["hi", "हिन्दी", "Deva", "ltr"],
      ["te", "తెలుగు", "Telu", "ltr"],
      ["or", "ଓଡ଼ିଆ", "Orya", "ltr"],
      ["ta", "தமிழ்", "Taml", "ltr"],
      ["kn", "ಕನ್ನಡ", "Knda", "ltr"],
    ]);
  });

  it("shows only reviewed English and capture starts switched off", () => {
    expect(visibleLanguages().map(entry => entry.code)).toEqual(["en"]);
    expect(isVisibleLanguage("en")).toBe(true);
    expect(isVisibleLanguage("te")).toBe(false);
    expect(isVisibleLanguage(null)).toBe(false);
    expect(LANGUAGE_CAPTURE_ENABLED).toBe(false);
  });

  it("reduces a browser tag to its primary subtag only", () => {
    expect(signupLanguageOf("te-IN")).toBe("te");
    expect(signupLanguageOf("pt-BR")).toBe("other");
    expect(signupLanguageOf("")).toBeNull();
    expect(signupLanguageOf(42)).toBeNull();
    expect(signupLanguageOf("not a tag")).toBeNull();
    expect(signupLanguageOf("en-GB")).toBe("en");
    expect(signupLanguageOf("ta-SG")).toBe("ta");
  });

  it("derives nothing from a place or a full language list", () => {
    const source = readFileSync(new URL("./languages.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/CF-IPCountry|navigator\.languages|\.region\b|\bcountry\b/i);
    for (const entry of LANGUAGES) {
      expect(Object.keys(entry).some(key => /place|country|region/i.test(key))).toBe(false);
    }
    // Two tags that differ only past the hyphen must land on the same code.
    expect(signupLanguageOf("en-IN")).toBe(signupLanguageOf("en-AU"));
  });
});

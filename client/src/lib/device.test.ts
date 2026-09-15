import{describe,expect,it}from"vitest";import{CONTENT_LANGUAGE,getDeviceLocale,initializeDevicePreferences,resolveDeviceLocale}from"./device";
describe("device locale and content language",()=>{
 it("keeps a canonical device preference for Intl formatting",()=>{expect(resolveDeviceLocale({languages:["fr-ca","en"],language:"en-US"})).toBe("fr-CA");expect(resolveDeviceLocale({language:"pt-br"})).toBe("pt-BR")});
 it("skips empty or malformed preferences and safely falls back",()=>{expect(resolveDeviceLocale({languages:["", "not_a_locale"],language:"de-de"})).toBe("de-DE");expect(resolveDeviceLocale({languages:["%%%"],language:""})).toBe("en");expect(resolveDeviceLocale()).toBe("en")});
 it("marks English UI as English while retaining a non-English device preference",()=>{const root={lang:"fr-CA"};expect(initializeDevicePreferences({language:"fr-CA"},root)).toEqual({deviceLocale:"fr-CA",contentLanguage:"en"});expect(getDeviceLocale()).toBe("fr-CA");expect(root.lang).toBe(CONTENT_LANGUAGE);expect(root.lang).toBe("en")});
});

// D-093 "measure first": the language registry. This is a catalogue of
// endonyms, never a guess about a person. Only reviewed entries are selectable;
// an unreviewed language is never stored or rendered (packet §4.7, §10.4).
export type LanguageCode = "en" | "hi" | "te" | "or" | "ta" | "kn";
export type SignupLanguage = LanguageCode | "other";

export type LanguageEntry = {
  code: LanguageCode;
  endonym: string;
  script: string;
  dir: "ltr" | "rtl";
  reviewed: boolean;
};

export const LANGUAGES: readonly LanguageEntry[] = [
  { code: "en", endonym: "English", script: "Latn", dir: "ltr", reviewed: true },
  { code: "hi", endonym: "हिन्दी", script: "Deva", dir: "ltr", reviewed: false },
  { code: "te", endonym: "తెలుగు", script: "Telu", dir: "ltr", reviewed: false },
  { code: "or", endonym: "ଓଡ଼ିଆ", script: "Orya", dir: "ltr", reviewed: false },
  { code: "ta", endonym: "தமிழ்", script: "Taml", dir: "ltr", reviewed: false },
  { code: "kn", endonym: "ಕನ್ನಡ", script: "Knda", dir: "ltr", reviewed: false },
];

// Capture starts off. Nothing is collected and no new language appears until
// the release row turns it on with the owner's approved wording (§7, §8 Q1).
export const LANGUAGE_CAPTURE_ENABLED = false;

export const visibleLanguages = (): readonly LanguageEntry[] => LANGUAGES.filter(entry => entry.reviewed);

export function isVisibleLanguage(code: unknown): code is LanguageCode {
  return typeof code === "string" && LANGUAGES.some(entry => entry.code === code && entry.reviewed);
}

const REGISTERED_CODES = new Set<string>(LANGUAGES.map(entry => entry.code));

/**
 * Canonicalise one browser tag and keep only its primary subtag. Everything
 * after the hyphen is dropped. An unlisted primary subtag becomes "other";
 * junk, a non-string and an empty tag become null. The full language list, a
 * person's location and any network header are never inputs here (§4.3).
 */
export function signupLanguageOf(tag: unknown): SignupLanguage | null {
  if (typeof tag !== "string" || !tag.trim()) return null;
  let canonical: string;
  try { canonical = Intl.getCanonicalLocales(tag)[0] ?? ""; } catch { return null; }
  if (!canonical) return null;
  let primary: string;
  try { primary = new Intl.Locale(canonical).language ?? ""; } catch { return null; }
  if (!primary) return null;
  return REGISTERED_CODES.has(primary) ? primary as LanguageCode : "other";
}

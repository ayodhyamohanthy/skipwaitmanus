// Deterministic job -> level (L1..L10) classifier, for the level-scaled ask
// cost the owner ordered (Oct 21: "low level jobs referral takes low credits...
// never show level unread; you should always have a level; use different ways
// to find"). Pure and shared, same house pattern as jobFunctionClassifier:
// whole-word matching, ordered rules, first match wins, ties break to the
// LOWER level. It ALWAYS returns a level: weak or missing signals fall back
// to L2 with low confidence, so no surface ever shows "level unread".
// Nothing consumes this yet; the credit-cost wiring ships separately, flag off.
//
// Hardened against growth's adversarial review (Oct 21): hyphenated ladder
// tags, single-letter-tag false positives ("Ex-Serviceman", "EV Charging"),
// bare "Engineer II" suffixes, years-of-age and decimal years, banking titles
// (AVP ~6, VP ~8, MD 10), intern/trainee always wins, plain "manager" is not
// a leadership signal, collision phrases (Lead Generation, Staff Nurse,
// Research Fellow), ambiguous words only ever reach medium confidence, and
// low-confidence results never exceed L5.

export type JobLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type LevelConfidence = "high" | "medium" | "low";

export type JobLevelInput = {
  title?: string | null;
  description?: string | null;
  url?: string | null;
};

export type JobLevelResult = {
  level: JobLevel;
  confidence: LevelConfidence;
  /** Which signal decided, for the internal confidence log. */
  basis: string;
};

/** Level -> what it means, for honest UI copy later. */
export const JOB_LEVEL_LABELS: Record<JobLevel, string> = {
  1: "Intern / trainee",
  2: "Entry / junior",
  3: "Early mid-level",
  4: "Mid-level",
  5: "Senior",
  6: "Senior II",
  7: "Staff / lead",
  8: "Principal",
  9: "Director / head",
  10: "VP / C-level",
};

const norm = (text: string): string => ` ${text.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

// Layer 1: explicit ladder tags ("SDE 2", "SDE-3", "SDE2", "IC5", "L3",
// "grade 7", "band 5"). Digits only: a single-letter prefix followed by a
// LETTER is a word, not a tag ("Ex-Serviceman", "EV Charging", "Pi Data").
// Mapped conservatively to our 1-10 scale (big-tech IC4 ~ senior II).
const LADDER_TAGS: ReadonlyArray<readonly [digits: string, level: JobLevel]> = [
  ["1", 2], ["2", 4], ["3", 5], ["4", 6], ["5", 7], ["6", 8], ["7", 9],
];
const LADDER_RE = /\b(sde|swe|sdet|ic|l|p|e|g|grade|band|level)\s*-?\s*(\d{1,2})\b/g;

function ladderTagLevel(title: string): { level: JobLevel; confidence: LevelConfidence; basis: string } | null {
  for (const match of title.toLowerCase().matchAll(LADDER_RE)) {
    const digits = Number(match[2]);
    // A bare "(L5)" style tag maps to its own number, capped at L6, medium
    // confidence (growth review): company ladders differ too much to trust more.
    if (match[1] === "l") return { level: Math.min(Math.max(digits, 1), 6) as JobLevel, confidence: "medium", basis: "ladder-tag-bare" };
    if (digits >= 8) return { level: 10, confidence: "high", basis: "ladder-tag" };
    const found = LADDER_TAGS.find(([tag]) => tag === match[2]);
    if (found) return { level: found[1], confidence: "high", basis: "ladder-tag" };
  }
  // Roman numerals only after an engineering prefix: "SDE II", "SDE-III".
  const roman = /\b(sde|swe)\s*-?\s*(ii|iii)\b/.exec(title.toLowerCase());
  if (roman) return { level: roman[2] === "ii" ? 4 : 5, confidence: "high", basis: "ladder-tag" };
  return null;
}

// Layer 1b: bare numeric/roman suffix on a role word: "Software Engineer II",
// "Product Analyst 3". Only for known role words, medium confidence.
const SUFFIX_RE = /\b(engineer|developer|designer|analyst|consultant|scientist|architect|associate|specialist)\s+-?\s*(ii|iii|iv|2|3|4)\s*$/;
const SUFFIX_LEVELS: Record<string, JobLevel> = { ii: 4, "2": 4, iii: 5, "3": 5, iv: 6, "4": 6 };

// Layer 2: seniority keywords in the title. Ordered; the first match wins.
// Intern/trainee rules come FIRST so "Product Manager Intern" and "Manager
// Trainee" can never read as IC or leadership roles. Collision phrases
// ("lead generation", "staff nurse", "research fellow") come before the
// generic words they contain. Ambiguous words (lead, manager, architect,
// partner, head, officer, specialist, consultant) only earn medium
// confidence - see AMBIGUOUS_BASIS below.
const TITLE_RULES: ReadonlyArray<readonly [phrase: string, level: JobLevel]> = [
  // Interns and trainees always win.
  ["intern", 1], ["internship", 1], ["trainee", 1], ["apprentice", 1],
  // Collision phrases before the generic words inside them.
  ["lead generation", 3], ["lead gen", 3], ["staff nurse", 3], ["research fellow", 2],
  ["solution architect", 7], ["solutions architect", 7], ["enterprise architect", 8], ["chief architect", 8],
  ["assistant general manager", 6], ["deputy general manager", 7],
  ["assistant vice president", 6], ["associate vice president", 6],
  ["assistant manager", 3], ["deputy manager", 3],
  ["associate product manager", 3], ["associate program manager", 3], ["associate project manager", 3],
  ["hr business partner", 5], ["business partner", 5],
  ["senior product manager", 5], ["senior program manager", 5], ["senior project manager", 5], ["senior account manager", 5],
  ["lead product manager", 6], ["product lead", 6], ["lead program manager", 6], ["lead project manager", 6],
  ["group product manager", 7], ["senior manager", 7], ["engineering manager", 7],
  // C-level and owners.
  ["chief", 10], ["cxo", 10], ["cto", 10], ["ceo", 10], ["cfo", 10], ["coo", 10], ["cpo", 10], ["founder", 10],
  ["managing director", 10], ["managing partner", 10],
  // Senior-executive compounds before the words inside them.
  ["senior vice president", 9], ["executive vice president", 9], ["senior partner", 9], ["senior director", 9],
  ["senior principal", 8], ["senior architect", 8], ["senior staff", 7],
  // Banking VP sits well below C-level; "vice president" before "president".
  ["vice president", 8], ["vp", 8],
  ["president", 9], ["svp", 9], ["evp", 9], ["partner", 9], ["director", 9], ["head of", 9], ["country manager", 9],
  ["general manager", 8], ["gm", 8],
  ["distinguished", 8], ["principal", 8], ["fellow", 8], ["architect", 7],
  ["agm", 6], ["avp", 6], ["dgm", 7],
  ["staff", 7], ["tech lead", 7], ["technical lead", 7], ["team lead", 7],
  ["lead", 6],
  // "mid-senior" before "senior".
  ["mid senior", 4], ["mid level", 4], ["intermediate", 4],
  ["senior", 5], ["sr", 5],
  ["manager", 5],
  ["product manager", 3], ["program manager", 3], ["project manager", 3], ["account manager", 3],
  ["officer", 3], ["specialist", 3], ["consultant", 3],
  ["junior", 2], ["jr", 2], ["associate", 2], ["entry level", 2], ["fresher", 2], ["graduate", 2],
];

// Words whose seniority meaning varies by company: a title hit on one of
// these is never high confidence.
const AMBIGUOUS_BASIS = new Set(["lead", "manager", "architect", "partner", "head of", "officer", "specialist", "consultant", "associate", "fellow", "team lead", "solution architect", "solutions architect"]);

// Layer 3: years of experience from title or description. Lower bound of a
// range wins (tie-break lower). "18 years of age" and decimals ("2.5 years")
// are not experience. Years alone never go above L6 (a 20-year veteran with
// no seniority word in the title is not assumed to run the company).
const YEARS_TO_LEVEL: ReadonlyArray<readonly [minYears: number, level: JobLevel]> = [
  [8, 6], [6, 6], [5, 5], [4, 4], [2, 3], [0, 2],
];

const YEARS_RE = /(?<![\d.])(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})(?![\d.])\s*\+?\s*(?:years|year|yrs|yr)\b|(?<![\d.])(\d{1,2})(?![\d.])\s*\+\s*(?:years|year|yrs|yr)\b|(?<![\d.])(\d{1,2})(?:\.(\d+))?(?![\d.])\s*(?:years|year|yrs|yr)\b/g;
// Company age or heritage is not candidate experience ("20 years in business").
const YEARS_EXCLUSION = /in business|of excellence|of legacy|of service|since\b/;

export function parseYearsOfExperience(text: string): number | null {
  const candidates: Array<{ years: number; experienced: boolean }> = [];
  for (const match of text.toLowerCase().matchAll(YEARS_RE)) {
    const after = text.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 8);
    if (/^\s*of age/.test(after)) continue; // "18 years of age" is not experience
    const years = Math.floor(Number(match[1] ?? match[3] ?? match[4] + (match[5] ? `.${match[5]}` : "")));
    if (years > 40) continue;
    const around = text.slice(Math.max(0, (match.index ?? 0) - 40), (match.index ?? 0) + match[0].length + 20);
    if (YEARS_EXCLUSION.test(around) && !/experience|exp\b/.test(around)) continue; // company age, not experience
    candidates.push({ years, experienced: /experience|exp\b|professional|industry/.test(around) });
  }
  if (candidates.length === 0) return null;
  // Prefer a mention tied to the word "experience"; otherwise the first.
  return (candidates.find(candidate => candidate.experienced) ?? candidates[0]).years;
}

function yearsToLevel(years: number): JobLevel {
  for (const [min, level] of YEARS_TO_LEVEL) if (years >= min) return level;
  return 2;
}

// Layer 4: leadership verbs in the description (weak, capped at L5; a low
// confidence result never exceeds L5).
const LEADERSHIP_VERBS: ReadonlyArray<readonly [phrase: string, level: JobLevel]> = [
  ["lead a team", 5], ["leading a team", 5], ["manage a team", 5], ["managing a team", 5], ["people management", 5],
  ["drive strategy", 5], ["own the roadmap", 5], ["mentor", 4], ["mentoring", 4],
];

const URL_LEVEL_CAP: JobLevel = 6;

/** Assign a level to a job. Always returns one; never "unread". */
export function assignJobLevel(input: JobLevelInput): JobLevelResult {
  const title = input.title ?? "";
  const description = input.description ?? "";
  const url = input.url ?? "";
  const titleNorm = norm(title);
  const urlNorm = norm(url.replace(/[-_./]+/g, " "));

  // Layer 1: explicit ladder tag in the title (strongest).
  const tag = ladderTagLevel(title);
  if (tag !== null) return tag;

  // Layer 1b: bare role + suffix ("Software Engineer II").
  const suffix = SUFFIX_RE.exec(title.toLowerCase());
  if (suffix) return { level: SUFFIX_LEVELS[suffix[2]], confidence: "medium", basis: `suffix:${suffix[2]}` };

  // Layer 2: seniority keywords, title first, then URL words (weaker, capped).
  for (const [phrase, level] of TITLE_RULES) if (titleNorm.includes(` ${phrase} `)) {
    return { level, confidence: AMBIGUOUS_BASIS.has(phrase) ? "medium" : "high", basis: `title:${phrase}` };
  }
  for (const [phrase, level] of TITLE_RULES) {
    if (level <= 1) continue; // "intern" in a URL slug is usually the board's, not the role's
    if (urlNorm.includes(` ${phrase} `)) return { level: Math.min(level, URL_LEVEL_CAP) as JobLevel, confidence: "medium", basis: `url:${phrase}` };
  }

  // Layer 3: years of experience, description then title.
  const years = parseYearsOfExperience(description) ?? parseYearsOfExperience(title);
  const yearsLevel = years === null ? null : yearsToLevel(years);

  // Layer 4: leadership verbs (weak).
  const descNorm = norm(description);
  const verbHit = LEADERSHIP_VERBS.find(([verb]) => descNorm.includes(verb));
  const verbLevel = verbHit ? verbHit[1] : null;

  if (yearsLevel !== null && verbLevel !== null) {
    // Signals disagree -> take the lower (owner rule: bias down).
    const level = Math.min(yearsLevel, verbLevel) as JobLevel;
    return { level, confidence: "medium", basis: `years:${years}+verb:${verbHit[0]}` };
  }
  if (yearsLevel !== null) return { level: yearsLevel, confidence: "medium", basis: `years:${years}` };
  if (verbLevel !== null) return { level: verbLevel, confidence: "low", basis: `verb:${verbHit[0]}` };

  // Last resort (growth's layer 9): L2, low confidence. Never "unread".
  return { level: 2, confidence: "low", basis: "fallback" };
}

/** Proposed credit cost per level (owner: "1 credit for L1 ... 10 credits for L10"). */
export function creditsForLevel(level: JobLevel): number {
  return level;
}
